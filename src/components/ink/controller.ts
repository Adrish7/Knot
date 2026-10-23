// The basin's conductor. Owns the clock projection (anchor + performance.now()), works out where
// each recent second's drop has drifted to by now, keeps the pointer's touches, resolves colours
// from CSS, and runs the one draw loop. Nothing is simulated: every frame is a pure function of the
// elapsed time, so the loop can stop at any moment and pick up later with nothing to catch up.
//
// The loop draws at about 30 fps while a drop is landing or something is settling and much slower
// in between (the trail only creeps), stops when nothing moves, and stops altogether while Knot's
// window isn't focused: the water holds still and the readout keeps counting.

import { activity, onActivity } from '../../activity'
import { Glyphs, RIM, type Look } from './ascii'

export interface FaceStats {
  frames: number
  loop: boolean
  frameMs: number
  avgMs: number
  maxMs: number
  sleeps: number
}

declare global {
  interface Window { __faceStats?: FaceStats } // frame counters for the lab and perf checks
}

const RESYNC_SECONDS = 0.35
const CENTRE = 0.5
const BUSY_MS = 33 // a drop landing, the pointer, a colour or theme change
const CREEP_MS = 125 // the rest of each second: the trail only creeps
const GRAIN_MS = 120 // how often the glyphs' flicker reshuffles

// The comet: each second's drop lands just inside the rim and, as it ages, drifts backwards and
// inwards, spreads and fades, gone after about half a minute.
const TRAIL = {
  seconds: 32,
  rim: 0.446, // where a drop lands
  drift: 0.02, // radians per second, counter-clockwise (behind the head)
  draw: 0.0035, // inward, uv per second
  land: 0.4, // seconds for a drop to open out on landing
  size: 0.024,
  spread: 0.0026, // uv per second
  amount: 0.95,
  fade: 0.12,
  subtract: 0.004,
}

const TOUCHES = 16

const LIGHT = { ground: [0.969, 0.969, 0.976] as Vec3, grey: [0.6, 0.6, 0.63] as Vec3, inkK: 3.4, bloom: 0, clear: 0.14, sheen: 0.025 }
const DARK = { ground: [0.094, 0.094, 0.106] as Vec3, grey: [0.52, 0.52, 0.55] as Vec3, inkK: 2.6, bloom: 0.75, clear: 0.16, sheen: 0.012 }

interface Anchor { elapsed: number; at: number; running: boolean }
interface Touch { x: number; y: number; at: number; amount: number; size: number; life: number }
type Vec3 = [number, number, number]

const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const approach = (value: number, target: number, dt: number, tau: number) => value + (target - value) * (1 - Math.exp(-dt / tau))
const near3 = (a: Vec3, b: Vec3) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 0.004

export class InkController {
  private basin: Glyphs | null = null
  private anchor: Anchor = { elapsed: 0, at: performance.now(), running: false }
  private shownSecond = -1
  private running = false
  private elapsed = 0
  private reduced = false
  private loop = 0
  private timer = 0
  private lastFrameAt = 0
  private activeUntil = 0
  private touches: Touch[] = []
  private drain: { from: number; until: number } | null = null // a reset: the trail fades out where it was
  private alive = 1
  private ink: Vec3 = [0.06, 0.62, 0.56]
  private inkTarget: Vec3 = [0.06, 0.62, 0.56]
  private desat = 0
  private desatTarget = 0
  private dark = 0
  private darkTarget = 0
  private ground: Vec3 = LIGHT.ground
  private colourCss = ''
  private pointer: { x: number; y: number; at: number } | null = null
  private parser: CanvasRenderingContext2D | null = null
  private readonly observer: MutationObserver
  private readonly resizer: ResizeObserver
  private readonly motion: MediaQueryList
  private stats: FaceStats = { frames: 0, loop: false, frameMs: 0, avgMs: 0, maxMs: 0, sleeps: 0 }
  private disposed = false
  private readonly offActivity: () => void

  constructor(private readonly root: HTMLDivElement, private readonly canvas: HTMLCanvasElement, private readonly probe: HTMLElement, private readonly onSecond: (second: number) => void) {
    this.motion = matchMedia('(prefers-reduced-motion: reduce)')
    this.reduced = this.motion.matches
    this.darkTarget = this.dark = this.isDark() ? 1 : 0
    this.ground = this.dark ? DARK.ground : LIGHT.ground
    this.create()

    this.observer = new MutationObserver(() => this.onTheme())
    this.observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    this.resizer = new ResizeObserver(() => this.onResize())
    this.resizer.observe(root)
    this.onResize()

    root.addEventListener('pointermove', this.onPointerMove)
    root.addEventListener('pointerdown', this.onPointerDown)
    root.addEventListener('pointerleave', this.onPointerLeave)
    canvas.addEventListener('contextlost', this.onLost)
    canvas.addEventListener('contextrestored', this.onRestored)
    this.offActivity = onActivity(this.onActivity)
    this.motion.addEventListener('change', this.onMotion)
    window.__faceStats = this.stats
  }

  // --- setup ----------------------------------------------------------------------------------

  private create() {
    try {
      this.basin = new Glyphs(this.canvas)
      this.root.classList.remove('is-fallback')
    } catch (error) {
      console.warn(error)
      this.basin = null
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
    const rgb = this.parse(getComputedStyle(this.probe).color)
    if (rgb) this.inkTarget = rgb
  }

  setColor(css: string) {
    const first = this.colourCss === ''
    this.colourCss = css
    this.probe.style.color = css
    this.resolveColour()
    if (first) this.ink = this.inkTarget
    this.wake(0)
  }

  private onTheme() {
    this.darkTarget = this.isDark() ? 1 : 0
    this.resolveColour()
    this.wake(0)
  }

  // The glyphs pick their own backing scale from the display; the controller works in CSS pixels.
  private onResize() {
    const box = this.root.getBoundingClientRect()
    this.basin?.resize(Math.max(1, Math.round(box.width)), Math.max(1, Math.round(box.height)))
    this.wake(0)
  }

  private onActivity = () => {
    if (activity().away) this.stop()
    else this.wake(0)
  }

  private onMotion = () => {
    this.reduced = this.motion.matches
    this.touches = []
    this.wake(0)
  }

  private onLost = (event: Event) => {
    event.preventDefault()
    this.basin = null
    this.root.classList.add('is-fallback')
    this.stop()
  }

  private onRestored = () => {
    this.create()
    this.onResize()
  }

  // --- the clock ------------------------------------------------------------------------------

  // Called whenever the page hands in a new elapsed/running pair. Keeps the existing anchor when
  // the page's value only differs from our own projection by jitter, so time never steps back.
  sync(elapsed: number, running: boolean) {
    const now = performance.now()
    const prev = this.anchor
    const wasElapsed = this.elapsed
    this.running = running
    this.elapsed = elapsed
    const projected = prev.elapsed + (prev.running ? (now - prev.at) / 1000 : 0)
    const ticking = running && prev.running && Math.abs(projected - elapsed) < RESYNC_SECONDS
    if (!ticking) this.anchor = { elapsed, at: now, running }
    const whole = Math.floor(this.projected(now))
    const changed = whole !== this.shownSecond
    if (changed) { this.shownSecond = whole; this.onSecond(whole) }

    this.desatTarget = !running && elapsed > 0 ? 1 : 0
    if (!running && elapsed === 0 && wasElapsed > 0 && !this.reduced) {
      this.drain = { from: projected, until: now + 700 }
    }
    if (ticking) { if (!this.reduced || changed) this.wake(0, false) }
    else if (running || elapsed !== wasElapsed) this.wake(0)
  }

  private projected(now: number) {
    const a = this.anchor
    return a.elapsed + (a.running ? (now - a.at) / 1000 : 0)
  }

  // --- pointer --------------------------------------------------------------------------------

  private toUv(event: PointerEvent): [number, number] {
    const box = this.root.getBoundingClientRect()
    return [(event.clientX - box.left) / box.width, 1 - (event.clientY - box.top) / box.height]
  }

  private touch(touch: Touch) {
    this.touches.push(touch)
    if (this.touches.length > TOUCHES) this.touches.shift()
    this.wake(0)
  }

  // Moving over the water trails a little ink behind the pointer.
  private onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch' || this.reduced || !this.basin) return
    const [x, y] = this.toUv(event)
    const now = performance.now()
    const prev = this.pointer
    if (prev && now - prev.at < 40) return
    this.pointer = { x, y, at: now }
    if (!prev || Math.hypot(x - CENTRE, y - CENTRE) > RIM - 0.01) return
    const len = Math.hypot(x - prev.x, y - prev.y)
    if (len < 0.006) return
    const amount = Math.min(0.45, len * 8) * (event.buttons ? 1.6 : 1)
    this.touch({ x, y, at: now, amount, size: 0.012, life: 1.6 })
  }

  private onPointerDown = (event: PointerEvent) => {
    if (this.reduced || !this.basin) return
    const [x, y] = this.toUv(event)
    if (Math.hypot(x - CENTRE, y - CENTRE) > RIM) return
    this.touch({ x, y, at: performance.now(), amount: 1.2, size: 0.022, life: 2.4 })
  }

  private onPointerLeave = () => {
    this.pointer = null
  }

  // --- the loop -------------------------------------------------------------------------------

  // `redrawAway`: while Knot isn't focused nothing animates, but a change that isn't just time
  // passing (a pause, a reset, a new colour or theme, a resize) is drawn once, settled.
  private wake(ms: number, redrawAway = true) {
    if (this.disposed) return
    const now = performance.now()
    this.activeUntil = Math.max(this.activeUntil, now + ms)
    if (activity().away) {
      if (redrawAway) { this.settle(); this.draw(now) }
      return
    }
    // Time passing doesn't hurry a frame that's already booked; anything else draws now.
    if (this.timer && redrawAway) { clearTimeout(this.timer); this.timer = 0 }
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

  private settle() {
    this.ink = this.inkTarget
    this.desat = this.desatTarget
    this.dark = this.darkTarget
    this.ground = this.dark ? DARK.ground : LIGHT.ground
    this.alive = 1
    this.drain = null
    this.touches = []
  }

  private frame = (now: number) => {
    this.loop = 0
    if (activity().away || this.disposed) { this.stop(); return }
    const started = performance.now()
    const dt = this.lastFrameAt ? Math.min(0.1, (now - this.lastFrameAt) / 1000) : 1 / 30
    this.lastFrameAt = now

    if (this.running) {
      const whole = Math.floor(this.projected(now))
      if (whole !== this.shownSecond) { this.shownSecond = whole; this.onSecond(whole) }
    }

    // slow display transitions
    this.ink = lerp3(this.ink, this.inkTarget, 1 - Math.exp(-dt / 0.16))
    this.desat = approach(this.desat, this.desatTarget, dt, 0.2)
    this.dark = approach(this.dark, this.darkTarget, dt, 0.07)
    this.ground = lerp3(this.ground, this.darkTarget ? DARK.ground : LIGHT.ground, 1 - Math.exp(-dt / 0.07))
    if (this.drain) {
      this.alive = approach(this.alive, 0, dt, 0.18)
      if (now >= this.drain.until) { this.drain = null; this.alive = 1 }
    }
    const settling = !near3(this.ink, this.inkTarget) || !near3(this.ground, this.darkTarget ? DARK.ground : LIGHT.ground)
      || Math.abs(this.desat - this.desatTarget) > 0.005 || Math.abs(this.dark - this.darkTarget) > 0.005

    this.touches = this.touches.filter((t) => (now - t.at) / 1000 < t.life)
    this.draw(now)

    const cost = performance.now() - started
    const s = this.stats
    s.frames++
    s.frameMs = cost
    s.avgMs = s.avgMs ? s.avgMs * 0.95 + cost * 0.05 : cost
    s.maxMs = Math.max(s.maxMs, cost)

    // what's next: quick frames while something is landing or settling, slow ones while the trail
    // only creeps, none when everything is still
    const busy = settling || this.drain !== null || this.touches.length > 0 || now < this.activeUntil
    const creeping = this.running && !this.reduced
    if (busy || creeping) {
      const landing = creeping && this.projected(now) % 1 < TRAIL.land + 0.1
      this.schedule(busy || landing ? BUSY_MS : CREEP_MS)
    } else {
      this.stats.loop = false
      this.stats.sleeps++
    }
  }

  // A timer, then the next display frame: the loop never runs at the display's own rate. While the
  // trail creeps it sleeps through the quiet part of the second but wakes for the next drop on time.
  private schedule(gap: number) {
    const toNext = this.running ? (1 - (this.projected(performance.now()) % 1)) * 1000 : gap
    const wait = Math.max(4, Math.min(gap, toNext) - 8)
    this.timer = window.setTimeout(() => { this.timer = 0; this.loop = requestAnimationFrame(this.frame) }, wait)
  }

  // --- drawing --------------------------------------------------------------------------------

  private draw(now: number) {
    const basin = this.basin
    if (!basin) return
    basin.clear()
    const t = this.drain ? this.drain.from : this.projected(now)
    if (this.running || this.elapsed > 0 || this.drain) {
      if (this.reduced) this.addDrop(basin, Math.floor(t), TRAIL.land)
      else {
        const head = Math.floor(t)
        for (let s = head; s >= Math.max(0, head - TRAIL.seconds); s--) this.addDrop(basin, s, t - s)
      }
    }
    for (const touch of this.touches) {
      const age = (now - touch.at) / 1000
      const size = touch.size + 0.012 * age
      basin.add(touch.x, touch.y, size, touch.amount * (touch.size / size) ** 2 * Math.exp(-age / (touch.life * 0.4)))
    }
    basin.draw(this.look())
  }

  // One second's drop, `age` seconds after it landed.
  private addDrop(basin: Glyphs, second: number, age: number) {
    const T = TRAIL
    const theta = ((second % 60) * 6 * Math.PI) / 180 - T.drift * age
    const r = T.rim - T.draw * age
    const opening = Math.min(1, age / T.land)
    const size = age < T.land
      ? 0.013 + (T.size - 0.013) * (1 - (1 - opening) ** 3)
      : T.size + T.spread * (age - T.land)
    const minute = second % 60 === 0 && second > 0 ? 1.45 : 1
    const amount = T.amount * minute * (T.size / size) ** 2 * Math.exp(-T.fade * age) - T.subtract * age
    basin.add(CENTRE + r * Math.sin(theta), CENTRE + r * Math.cos(theta), size, amount * Math.min(1, age / 0.06))
  }

  private look(): Look {
    const d = this.dark
    const mix = (a: number, b: number) => a + (b - a) * d
    const grey = lerp3(LIGHT.grey, DARK.grey, d)
    return {
      ink: lerp3(this.ink, grey, this.desat * 0.92),
      ground: this.ground,
      dark: d,
      inkK: mix(LIGHT.inkK, DARK.inkK) * (1 - 0.25 * this.desat),
      bloom: mix(LIGHT.bloom, DARK.bloom),
      clear: mix(LIGHT.clear, DARK.clear),
      sheen: mix(LIGHT.sheen, DARK.sheen),
      alive: this.alive,
      grain: this.reduced ? 0 : Math.floor(performance.now() / GRAIN_MS),
    }
  }

  dispose() {
    this.disposed = true
    this.stop()
    this.observer.disconnect()
    this.resizer.disconnect()
    const root = this.root
    root.removeEventListener('pointermove', this.onPointerMove)
    root.removeEventListener('pointerdown', this.onPointerDown)
    root.removeEventListener('pointerleave', this.onPointerLeave)
    this.canvas.removeEventListener('contextlost', this.onLost)
    this.canvas.removeEventListener('contextrestored', this.onRestored)
    this.offActivity()
    this.motion.removeEventListener('change', this.onMotion)
    this.basin?.dispose()
    this.basin = null
  }
}
