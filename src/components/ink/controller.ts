// The basin's conductor. Owns the clock projection (anchor + performance.now()), decides what
// falls into the water and when (drops on the second boundary, the minute vortex, the hour
// ring, start / pause / reset), turns pointer movement into stirring, resolves colours from CSS,
// and runs the one requestAnimationFrame loop, which sleeps whenever nothing can move.

import { activity, onActivity } from '../../activity'
import { Fluid, RIM, type DisplayParams, type SimParams } from './fluid'

export interface FaceStats {
  frames: number
  steps: number
  loop: boolean
  frameMs: number
  avgMs: number
  maxMs: number
  gpuMs: number | null
  sleeps: number
}

declare global {
  interface Window { __faceStats?: FaceStats } // frame counters for the lab and perf checks
}

const STEP = 1 / 60
const RESYNC_SECONDS = 0.35
const DROP_R = 0.446 // where a second's drop lands, just inside the rim
const CENTRE = 0.5

const SIM = {
  simRes: 160,
  waveRes: 128,
  dyeRes: 448,
  pressureIterations: 20,
  velocityDissipation: 0.4,
  stillDissipation: 5,
  dyeDissipation: 0.13,
  dyeSubtract: 0.006,
  curl: 12,
  spin: 0.012,
  draw: 0.0025,
  push: 0.004,
  waveC2: 0.45,
  waveDamp: 0.991,
  waveStillDamp: 0.975,
  waveSubsteps: 5,
}

interface Look {
  ground: [number, number, number]
  grey: [number, number, number]
  inkK: number
  bloom: number
  refract: number
  spec: number
  diffuse: number
  normal: number
  waveAmp: number
  pressAmp: number
  clear: number
  sheen: number
}

const LIGHT: Look = { ground: [0.969, 0.969, 0.976], grey: [0.6, 0.6, 0.63], inkK: 3.4, bloom: 0, refract: 0.012, spec: 0.3, diffuse: 0.09, normal: 4.5, waveAmp: 1, pressAmp: 6, clear: 0.14, sheen: 0.025 }
const DARK: Look = { ground: [0.094, 0.094, 0.106], grey: [0.52, 0.52, 0.55], inkK: 2.6, bloom: 0.75, refract: 0.012, spec: 0.4, diffuse: 0.12, normal: 4.5, waveAmp: 1, pressAmp: 6, clear: 0.16, sheen: 0.012 }

interface Anchor { elapsed: number; at: number; running: boolean }
interface Pulse { until: number; from: number; apply: (k: number) => void } // k = 1 → 0 over the pulse
type Vec3 = [number, number, number]

const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const approach = (value: number, target: number, dt: number, tau: number) => value + (target - value) * (1 - Math.exp(-dt / tau))
const dropAt = (second: number): [number, number] => {
  const theta = ((second % 60) * 6 * Math.PI) / 180
  return [CENTRE + DROP_R * Math.sin(theta), CENTRE + DROP_R * Math.cos(theta)]
}

export class InkController {
  private fluid: Fluid | null = null
  private anchor: Anchor = { elapsed: 0, at: performance.now(), running: false }
  private shownSecond = -1
  private running = false
  private elapsed = 0
  private reduced = false
  private loop = 0
  private timer = 0
  private lastFrameAt = 0
  private accum = 0
  private activeUntil = 0
  private lastInject = -1e9
  private pulses: Pulse[] = []
  private queue: Array<(fluid: Fluid) => void> = []
  private drain: { until: number } | null = null
  private alive = 1
  private aliveTarget = 1
  private dyeBoostUntil = 0
  private ink: Vec3 = [0.06, 0.62, 0.56]
  private inkTarget: Vec3 = [0.06, 0.62, 0.56]
  private desat = 0
  private desatTarget = 0
  private dark = 0
  private darkTarget = 0
  private ground: Vec3 = LIGHT.ground
  private look: Look = LIGHT
  private colourCss = ''
  private pointer: { x: number; y: number; down: boolean } | null = null
  private parser: CanvasRenderingContext2D | null = null
  private readonly observer: MutationObserver
  private readonly resizer: ResizeObserver
  private readonly motion: MediaQueryList
  private stats: FaceStats = { frames: 0, steps: 0, loop: false, frameMs: 0, avgMs: 0, maxMs: 0, gpuMs: null, sleeps: 0 }
  private disposed = false
  private behind = false // seconds went by while away without their drops; the trail is re-laid on return
  private readonly offActivity: () => void

  constructor(private readonly root: HTMLDivElement, private readonly canvas: HTMLCanvasElement, private readonly probe: HTMLElement, private readonly onSecond: (second: number) => void) {
    this.motion = matchMedia('(prefers-reduced-motion: reduce)')
    this.reduced = this.motion.matches
    this.darkTarget = this.dark = this.isDark() ? 1 : 0
    this.look = this.dark ? DARK : LIGHT
    this.ground = this.look.ground
    this.create()

    this.observer = new MutationObserver(() => this.onTheme())
    this.observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    this.resizer = new ResizeObserver(() => this.onResize())
    this.resizer.observe(root)
    this.onResize()

    root.addEventListener('pointermove', this.onPointerMove)
    root.addEventListener('pointerdown', this.onPointerDown)
    root.addEventListener('pointerup', this.onPointerUp)
    root.addEventListener('pointercancel', this.onPointerUp)
    root.addEventListener('pointerleave', this.onPointerLeave)
    canvas.addEventListener('webglcontextlost', this.onLost)
    canvas.addEventListener('webglcontextrestored', this.onRestored)
    this.offActivity = onActivity(this.onVisibility)
    this.motion.addEventListener('change', this.onMotion)
    window.__faceStats = this.stats
  }

  // --- setup ----------------------------------------------------------------------------------

  private create() {
    try {
      this.fluid = new Fluid(this.canvas, SIM.simRes, SIM.waveRes, SIM.dyeRes)
      this.root.classList.remove('is-fallback')
    } catch (error) {
      console.warn(error)
      this.fluid = null
      this.root.classList.add('is-fallback')
    }
  }

  private isDark() { return document.documentElement.dataset.theme === 'dark' }

  private parse(css: string): Vec3 | null {
    if (!this.parser) {
      const c = document.createElement('canvas')
      c.width = c.height = 1
      this.parser = c.getContext('2d', { willReadFrequently: true })
    }
    const ctx = this.parser
    if (!ctx) return null
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = '#000'
    ctx.fillStyle = css
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    if (a === 0) return null
    return [r / 255, g / 255, b / 255]
  }

  private resolveColour() {
    const css = getComputedStyle(this.probe).color
    const rgb = this.parse(css)
    if (rgb) this.inkTarget = rgb
  }

  setColor(css: string) {
    const first = this.colourCss === ''
    this.colourCss = css
    this.probe.style.color = css
    this.resolveColour()
    if (first) this.ink = this.inkTarget
    else this.wake(800)
  }

  private onTheme() {
    const dark = this.isDark()
    this.darkTarget = dark ? 1 : 0
    this.look = dark ? DARK : LIGHT
    this.resolveColour()
    this.wake(700)
  }

  private onResize() {
    const fluid = this.fluid
    const box = this.root.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = Math.max(1, Math.round(box.width * dpr))
    const h = Math.max(1, Math.round(box.height * dpr))
    if (!fluid) return
    fluid.resize(w, h)
    this.render()
  }

  // While another app is in front (or the window is hidden) the water holds still: the loop stops
  // and the seconds' drops are skipped. The readout keeps counting. On return the trail is re-laid
  // as it would look by now.
  private onVisibility = () => {
    if (activity().away) { this.stop(); return }
    if (this.behind && this.running && !this.reduced) this.seedTrail(this.shownSecond)
    this.behind = false
    this.wake(300)
  }

  private onMotion = () => {
    this.reduced = this.motion.matches
    if (this.reduced) { this.fluid?.clearVelocity(); this.fluid?.clearWave(); this.renderStatic() }
    this.wake(100)
  }

  private onLost = (event: Event) => {
    event.preventDefault()
    this.fluid = null
    this.root.classList.add('is-fallback')
    this.stop()
  }

  private onRestored = () => {
    this.create()
    this.onResize()
    if (this.running) this.seedTrail(this.shownSecond)
    this.wake(500)
  }

  // --- the clock ------------------------------------------------------------------------------

  // Called whenever the page hands in a new elapsed/running pair. Keeps the existing anchor when
  // the page's value only differs from our own projection by jitter, so time never steps back.
  sync(elapsed: number, running: boolean) {
    const now = performance.now()
    const prev = this.anchor
    const wasRunning = this.running
    const wasElapsed = this.elapsed
    this.running = running
    this.elapsed = elapsed
    const projected = prev.elapsed + (prev.running ? (now - prev.at) / 1000 : 0)
    if (!(running && prev.running && Math.abs(projected - elapsed) < RESYNC_SECONDS)) {
      this.anchor = { elapsed, at: now, running }
    }
    const whole = Math.floor(this.projected(now))
    if (this.shownSecond === -1) {
      this.shownSecond = whole
      this.onSecond(whole)
      if (running) this.seedTrail(whole)
      else if (elapsed > 0) {
        // Opened on a paused stopwatch: the trail is there, settled and grey, as it was left.
        this.seedTrail(whole)
        this.desat = this.desatTarget = 1
          }
    } else if (whole !== this.shownSecond) {
      this.showSecond(whole, now)
    }
    if (running && !wasRunning) this.start(now)
    else if (!running && wasRunning) this.pause(now)
    else if (!running && elapsed === 0 && wasElapsed > 0) this.reset(now)
    if (running) this.wake(0)
    else if (!running && wasRunning) this.wake(2200)
  }

  private projected(now: number) {
    const a = this.anchor
    return a.elapsed + (a.running ? (now - a.at) / 1000 : 0)
  }

  // The second boundary: a drop lands at its place on the rim. A jump of more than a few seconds
  // (adjust time, task switch) re-lays the whole trail instead of firing a burst of drops.
  private showSecond(whole: number, now: number) {
    const prev = this.shownSecond
    this.shownSecond = whole
    this.onSecond(whole)
    if (!this.running) return
    if (activity().away) { this.behind = true; return }
    const delta = whole - prev
    if (this.reduced) { this.renderStatic(); return }
    if (delta < 1 || delta > 3) { this.seedTrail(whole); return }
    const minute = whole % 60 === 0 && whole > 0
    const hour = whole % 3600 === 0 && whole > 0
    const [x, y] = dropAt(whole)
    const theta = ((whole % 60) * 6 * Math.PI) / 180
    const amount = minute ? 1.45 : 1.0
    const radius = minute ? 0.03 : 0.025
    this.inject((fluid) => {
      fluid.splatDye(x, y, amount, radius)
      fluid.splatVelocity(x, y, -Math.sin(theta) * 0.42, -Math.cos(theta) * 0.42, 0.03)
      fluid.splatWave(x, y, minute ? 0.7 : 0.45, 0.018)
    })
    if (minute) this.minute(now)
    if (hour) this.hour(now)
  }

  // Lays down the last half minute of drops as they would look by now: rotated backwards and
  // drawn inward by the spiral, spread and faded by their age.
  private seedTrail(second: number) {
    this.inject((fluid) => {
      fluid.clearDye()
      fluid.clearVelocity()
      fluid.clearWave()
      // Two blooms per second so the seeded comet is continuous, each spread by its age.
      for (let age = 0; age <= 32; age += 0.5) {
        const s = second - age
        if (s < 0) break
        const base = (((s % 60) + 60) % 60 * 6 * Math.PI) / 180
        const theta = base - SIM.spin * age
        const r = DROP_R - SIM.draw * age
        const radius = 0.028 + age * 0.0024
        const minute = Number.isInteger(s) && s % 60 === 0 && s > 0
        const amount = 0.5 * Math.exp(-SIM.dyeDissipation * age) * (0.025 / radius) ** 2 * (minute ? 1.45 : 1) - SIM.dyeSubtract * age
        if (amount <= 0.02) continue
        fluid.splatDye(CENTRE + r * Math.sin(theta), CENTRE + r * Math.cos(theta), amount, radius)
      }
    })
    this.wake(400)
  }

  // --- the moments ----------------------------------------------------------------------------

  private minute(now: number) {
    // A vortex pulse turns the basin, folding the old trail inward; then the water is let settle.
    this.pulse(now, 420, (k) => this.fluid?.force(CENTRE, CENTRE, 0.1, 0.5, 0.06, 1.7 * k, -0.22 * k))
    this.calmFor(now, 900, 2400)
  }

  private hour(now: number) {
    this.inject((fluid) => fluid.splatWave(CENTRE, CENTRE, 1.6, 0.02, 0.44))
    this.pulse(now, 320, (k) => this.fluid?.force(CENTRE, CENTRE, 0.3, 0.5, 0.05, 0, -0.9 * k))
  }

  private start(now: number) {
    this.desatTarget = 0
    this.calmUntil = 0
    if (this.drain) { this.drain = null; this.aliveTarget = 1; this.alive = 1; this.inject((fluid) => fluid.clearDye()) }
    if (this.reduced) return
    this.inject((fluid) => fluid.splatWave(CENTRE, CENTRE, 1.2, 0.03))
    this.pulse(now, 260, (k) => this.fluid?.force(CENTRE, CENTRE, 0, 0.12, 0.06, 0, 1.6 * k))
  }

  private pause(now: number) {
    this.desatTarget = 1
    this.lastInject = now
  }

  private reset(now: number) {
    this.desatTarget = 0
    this.lastInject = now
    if (this.reduced) { this.inject((fluid) => fluid.clearDye()); this.renderStatic(); return }
    this.drain = { until: now + 1300 }
    this.aliveTarget = 0
    this.dyeBoostUntil = now + 1300
    this.pulse(now, 1000, (k) => this.fluid?.force(CENTRE, CENTRE, 0.06, 0.5, 0.06, 2.2 * k, -0.7 * k))
    this.wake(2600)
  }

  // --- pointer --------------------------------------------------------------------------------

  private toUv(event: PointerEvent): [number, number] {
    const box = this.root.getBoundingClientRect()
    return [(event.clientX - box.left) / box.width, 1 - (event.clientY - box.top) / box.height]
  }

  private onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch' || this.reduced || !this.fluid) return
    const [x, y] = this.toUv(event)
    const prev = this.pointer
    const down = prev?.down ?? false
    this.pointer = { x, y, down }
    if (!prev) return
    const dx = x - prev.x
    const dy = y - prev.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-4) return
    const inside = Math.hypot(x - CENTRE, y - CENTRE) < RIM + 0.03
    if (!inside) return
    const gain = down ? 22 : 13
    const ink = Math.min(0.45, len * (down ? 22 : 12))
    const ripple = Math.min(0.25, len * 8)
    this.inject((fluid) => {
      fluid.splatVelocity(x, y, dx * gain, dy * gain, down ? 0.05 : 0.04)
      fluid.splatDye(x, y, ink, down ? 0.014 : 0.011, 1.3)
      fluid.splatWave(x, y, ripple, 0.016)
    })
    this.lastInject = performance.now()
  }

  private onPointerDown = (event: PointerEvent) => {
    if (this.reduced || !this.fluid) return
    const [x, y] = this.toUv(event)
    this.pointer = { x, y, down: true }
    if (Math.hypot(x - CENTRE, y - CENTRE) > RIM) return
    this.inject((fluid) => {
      fluid.splatDye(x, y, 1.2, 0.028)
      fluid.splatWave(x, y, -1.1, 0.028)
    })
    this.pulse(performance.now(), 140, (k) => this.fluid?.force(x, y, 0, 0.07, 0.035, 0, 1.4 * k))
  }

  private onPointerUp = () => {
    if (this.pointer) this.pointer.down = false
  }

  private onPointerLeave = () => {
    this.pointer = null
  }

  // --- the loop -------------------------------------------------------------------------------

  private calmUntil = 0

  private calmFor(now: number, after: number, until: number) {
    this.calmStart = now + after
    this.calmUntil = now + until
  }

  private calmStart = 0

  private inject(fn: (fluid: Fluid) => void) {
    this.queue.push(fn)
    this.lastInject = performance.now()
    this.wake(2200)
  }

  private pulse(now: number, duration: number, apply: (k: number) => void) {
    this.pulses.push({ from: now, until: now + duration, apply })
    this.lastInject = now
    this.wake(duration + 2200)
  }

  private wake(ms: number) {
    if (this.disposed) return
    const now = performance.now()
    this.activeUntil = Math.max(this.activeUntil, now + ms)
    if (activity().away) {
      // Nothing moves, but what was asked for (the trail on opening, a new colour) is drawn once.
      const fluid = this.fluid
      if (fluid && this.queue.length) { for (const fn of this.queue.splice(0)) fn(fluid); this.render() }
      return
    }
    if (!this.loop && !this.timer) {
      this.lastFrameAt = 0
      this.stats.loop = true
      this.loop = requestAnimationFrame(this.frame)
    }
  }

  private stop() {
    if (this.loop) cancelAnimationFrame(this.loop)
    if (this.timer) clearTimeout(this.timer)
    this.loop = 0
    this.timer = 0
    this.stats.loop = false
  }

  private frame = (now: number) => {
    this.loop = 0
    const started = performance.now()
    const dt = this.lastFrameAt ? Math.min(0.05, (now - this.lastFrameAt) / 1000) : STEP
    this.lastFrameAt = now

    // 1. the clock
    if (this.running) {
      const whole = Math.floor(this.projected(now))
      if (whole !== this.shownSecond) this.showSecond(whole, now)
    }

    // 2. slow display transitions
    this.ink = lerp3(this.ink, this.inkTarget, 1 - Math.exp(-dt / 0.16))
    this.desat = approach(this.desat, this.desatTarget, dt, 0.2)
    this.dark = approach(this.dark, this.darkTarget, dt, 0.07)
    this.ground = lerp3(this.ground, this.look.ground, 1 - Math.exp(-dt / 0.07))
    this.alive = approach(this.alive, this.aliveTarget, dt, 0.28)
    if (this.drain && now >= this.drain.until) {
      this.drain = null
      this.fluid?.clearDye()
      this.fluid?.clearWave()
      this.alive = this.aliveTarget = 1
    }
    const settling = Math.abs(this.ink[0] - this.inkTarget[0]) + Math.abs(this.ink[1] - this.inkTarget[1]) + Math.abs(this.ink[2] - this.inkTarget[2]) > 0.004
      || Math.abs(this.desat - this.desatTarget) > 0.005 || Math.abs(this.dark - this.darkTarget) > 0.005 || Math.abs(this.alive - this.aliveTarget) > 0.005

    // 3. the water
    const fluid = this.fluid
    if (fluid && !this.reduced) {
      this.accum = Math.min(this.accum + dt, STEP * 2)
      if (this.accum >= STEP) {
        this.accum -= STEP
        for (const fn of this.queue.splice(0)) fn(fluid)
        if (this.pulses.length) {
          this.pulses = this.pulses.filter((p) => now < p.until)
          for (const p of this.pulses) p.apply(1 - (now - p.from) / (p.until - p.from))
        }
        fluid.step(this.simParams(now))
        this.stats.steps++
        this.render()
      } else if (settling) this.render()
    } else if (settling) this.renderStatic()

    // 4. stats and the sleep decision
    const cost = performance.now() - started
    const s = this.stats
    s.frames++
    s.frameMs = cost
    s.avgMs = s.avgMs ? s.avgMs * 0.95 + cost * 0.05 : cost
    s.maxMs = Math.max(s.maxMs, cost)
    s.gpuMs = fluid?.timer.last ?? null

    if (activity().away) { this.stop(); return }
    if ((this.running && !this.reduced) || now < this.activeUntil || settling || this.pulses.length || this.queue.length) {
      this.loop = requestAnimationFrame(this.frame)
    } else if (this.running && this.reduced) {
      // Reduced motion: nothing moves between seconds, so sleep until the next boundary.
      const next = (1 - (this.projected(performance.now()) % 1)) * 1000 + 4
      this.timer = window.setTimeout(() => { this.timer = 0; this.wake(0) }, Math.max(8, next))
      this.stats.loop = false
    } else {
      this.stats.loop = false
      this.stats.sleeps++
      fluid?.clearVelocity()
      fluid?.clearWave()
      this.render()
    }
  }

  private simParams(now: number): SimParams {
    const since = (now - this.lastInject) / 1000
    // Not running: the water moves freely for a moment after the last touch, then stills.
    const still = this.running ? 0 : Math.min(1, Math.max(0, (since - 0.45) / 0.7))
    const calm = this.calmUntil > now && now >= this.calmStart ? 0.5 : 0
    const stilling = Math.max(still, calm)
    const draining = this.dyeBoostUntil > now
    return {
      dt: STEP,
      velocityDissipation: SIM.velocityDissipation + SIM.stillDissipation * stilling,
      // Paused water keeps its ink: the trail is a record of where the session stopped.
      dyeDissipation: draining ? 5 : this.running ? SIM.dyeDissipation : 0,
      dyeSubtract: draining ? 0.3 : this.running ? SIM.dyeSubtract : 0,
      curl: SIM.curl * (1 - 0.8 * stilling),
      spin: this.running ? SIM.spin : 0,
      draw: this.running ? SIM.draw : 0,
      push: this.running ? SIM.push : 0,
      waveC2: SIM.waveC2,
      waveDamp: SIM.waveDamp + (SIM.waveStillDamp - SIM.waveDamp) * stilling,
      waveSubsteps: SIM.waveSubsteps,
      pressureIterations: SIM.pressureIterations,
    }
  }

  private displayParams(): DisplayParams {
    const look = this.look
    const dark = this.dark
    const mixLook = (a: number, b: number) => a + (b - a) * dark
    const grey = lerp3(LIGHT.grey, DARK.grey, dark)
    const ink = lerp3(this.ink, grey, this.desat * 0.92)
    return {
      ink,
      ground: this.ground,
      dark,
      inkK: mixLook(LIGHT.inkK, DARK.inkK) * (1 - 0.25 * this.desat),
      bloom: mixLook(LIGHT.bloom, DARK.bloom),
      refract: look.refract,
      spec: mixLook(LIGHT.spec, DARK.spec),
      diffuse: mixLook(LIGHT.diffuse, DARK.diffuse),
      normal: look.normal,
      waveAmp: look.waveAmp,
      pressAmp: look.pressAmp,
      clear: mixLook(LIGHT.clear, DARK.clear),
      sheen: mixLook(LIGHT.sheen, DARK.sheen),
      alive: this.alive,
    }
  }

  private render() {
    this.fluid?.render(this.displayParams())
  }

  // Reduced motion: a still basin with one drop at the current second.
  private renderStatic() {
    const fluid = this.fluid
    if (!fluid) return
    fluid.clearDye()
    if (this.running || this.elapsed > 0) {
      const [x, y] = dropAt(this.shownSecond)
      fluid.splatDye(x, y, 1, 0.028)
    }
    this.render()
  }

  dispose() {
    this.disposed = true
    this.stop()
    this.observer.disconnect()
    this.resizer.disconnect()
    const root = this.root
    root.removeEventListener('pointermove', this.onPointerMove)
    root.removeEventListener('pointerdown', this.onPointerDown)
    root.removeEventListener('pointerup', this.onPointerUp)
    root.removeEventListener('pointercancel', this.onPointerUp)
    root.removeEventListener('pointerleave', this.onPointerLeave)
    this.canvas.removeEventListener('webglcontextlost', this.onLost)
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored)
    this.offActivity()
    this.motion.removeEventListener('change', this.onMotion)
    this.fluid?.dispose()
    this.fluid = null
  }
}
