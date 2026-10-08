import { ChevronsUpDown } from 'lucide-react'
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatClock } from '../time'
import './DialFace.css'

// The Dial, machined. A shallow instrument puck: sixty second keys around the rim rise out of
// their slots in the task's colour one per second and drop back as a clockwise wave at the top of
// each minute; the wave knocks up the next minute key on the inner ring as it passes it. At the
// hour both rings fall in a double wave and a bearing rolls out of the port at the end of the
// groove along the bottom into its detent. The readout turns on drums like a counter. Starting
// sends a hop around the lit keys, and the puck tilts toward the pointer under a fixed light.
//
// Timing: the page hands in `elapsed` a few times a second, the face projects it on its own
// animation frame and only re-renders when the shown second changes. Everything that moves in
// between (key springs, drums, bearings, pointer tilt) is CSS transitions, CSS animations or Web
// Animations on transform and opacity, never a React render.

export interface StopwatchFaceProps {
  elapsed: number // seconds, may be fractional
  running: boolean
  color: string // the task's list colour, or the stopwatch hue
  title: string
  subtitle?: string
  subtitleColor?: string // a dot beside the subtitle, e.g. the list colour
  titleControl?: React.ReactNode // laid over the title, e.g. a transparent <select> to change task
  onBreak?: boolean // timing a break-tagged task: the state reads "On break" while it runs
}

// --- geometry, in a 400-unit face space ----------------------------------------------------

const UNIT = 0.25 // cqi per unit: the face is 100cqi = 400 units wide
const cq = (units: number) => `${+(units * UNIT).toFixed(4)}cqi`
const pct = (value: number) => `${+(value / 4).toFixed(4)}%`
const rad = (degrees: number) => (degrees * Math.PI) / 180

interface Key {
  index: number
  major: boolean
  origin: boolean
  style: React.CSSProperties // static placement; the delay is added per render
}

interface RingSpec {
  outer: number
  minor: number // key lengths
  major: number
  origin: number
  width: number
  majorWidth: number
}

const SECOND_RING: RingSpec = { outer: 190, minor: 8.5, major: 11.5, origin: 14, width: 2.3, majorWidth: 2.7 }
const MINUTE_RING: RingSpec = { outer: 174, minor: 10, major: 13, origin: 15.5, width: 2.9, majorWidth: 3.3 }

// Sixty keys standing radially; each one carries its angle so materials can light it in screen
// space (--ga turns a gradient back to screen-vertical, --sx/--sy point screen-down locally).
const ring = (spec: RingSpec): Key[] =>
  Array.from({ length: 60 }, (_, index) => {
    const major = index % 5 === 0
    const origin = index === 0
    const length = origin ? spec.origin : major ? spec.major : spec.minor
    const width = major ? spec.majorWidth : spec.width
    const centre = spec.outer - length / 2
    const angle = index * 6
    return {
      index,
      major,
      origin,
      style: {
        left: pct(200 + centre * Math.sin(rad(angle))),
        top: pct(200 - centre * Math.cos(rad(angle))),
        width: cq(width),
        height: cq(length),
        marginLeft: cq(-width / 2),
        marginTop: cq(-length / 2),
        rotate: `${angle}deg`,
        '--ga': `${180 - angle}deg`,
        '--sx': +Math.sin(rad(angle)).toFixed(4),
        '--sy': +Math.cos(rad(angle)).toFixed(4),
      } as React.CSSProperties,
    }
  })

const SECONDS = ring(SECOND_RING)
const MINUTES = ring(MINUTE_RING)

// Twelve detents on an arc along the bottom, filling left to right.
const GROOVE_R = 128
const HOUR_ANGLES = Array.from({ length: 12 }, (_, index) => 180 + (5.5 - index) * 7.2)
const PORT_ANGLE = 180 + (5.5 - 12.4) * 7.2 // the hole a bearing rolls out of, right of the last detent
const GROOVE_END = 180 + (5.5 + 0.85) * 7.2

const polar = (radius: number, degrees: number): [number, number] =>
  [+(200 + radius * Math.sin(rad(degrees))).toFixed(3), +(200 - radius * Math.cos(rad(degrees))).toFixed(3)]

const arc = (radius: number, from: number, to: number) => {
  const [x1, y1] = polar(radius, from)
  const [x2, y2] = polar(radius, to)
  return `M${x1} ${y1}A${radius} ${radius} 0 0 1 ${x2} ${y2}`
}

// --- timing -------------------------------------------------------------------------------

const STEP_MS = 10 // between keys in a wave
const CARRY_MS = 70 // the minute key pops just after the seconds wave passes it
const MINUTE_LAG_MS = 160 // at the hour the minute wave trails the seconds wave
const HOUR_STEP_MS = 110 // between bearings when several move at once
const RESYNC_SECONDS = 0.35 // drift under this between page updates and our clock is jitter
const WAKE_STEP_MS = 11 // between keys in the hop that runs round when the stopwatch starts
const TILT_DEG = 7
// One fixed light, up and to the left of the viewer. HALF is the half vector between it and the
// eye: wherever a surface normal lines up with it, that surface glints.
const LIGHT = (() => {
  const l = [-0.35, -0.75, 0.55]
  const h = [l[0], l[1], l[2] + Math.hypot(...l)]
  const n = Math.hypot(...h)
  return h.map((v) => v / n)
})()
// Where on the chamfer the glint sits for a puck turned by rotateX(ax) rotateY(ay): take the half
// vector into the puck's frame and read off its bearing.
const glintBearing = (ax: number, ay: number) => {
  const [hx, hy, hz] = LIGHT
  const cx = Math.cos(rad(-ax)), sx = Math.sin(rad(-ax)), cy = Math.cos(rad(-ay)), sy = Math.sin(rad(-ay))
  const y1 = hy * cx - hz * sx
  const z1 = hy * sx + hz * cx
  const x2 = hx * cy + z1 * sy
  return (Math.atan2(x2, -y1) * 180) / Math.PI
}
const REST_GLINT = glintBearing(0, 0)
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

interface Anchor {
  elapsed: number
  at: number // performance.now() when `elapsed` was true
  running: boolean
}

interface Counts {
  s: number
  m: number
  h: number
}

type Delay = (index: number) => number

interface Lighting {
  counts: Counts
  delays: { s: Delay; m: Delay }
  hourDelay: number // before the first bearing moves
}

const ZERO: Delay = () => 0

const countsOf = (second: number): Counts => ({
  s: second % 60,
  m: Math.floor(second / 60) % 60,
  h: Math.min(12, Math.floor(second / 3600)),
})

// Per-key delay so a bulk change sweeps clockwise one step at a time. Lit keys are those with
// `first <= index < count + first`; a single new key lights at once.
const sweep = (count: number, prev: number, step: number, first: number): Delay => (index) => {
  const position = index - first
  if (count > prev) return count - prev === 1 || position < prev || position >= count ? 0 : (position - prev) * step
  if (count < prev) return position < count || position >= prev ? 0 : (position - count) * step
  return 0
}

// The minute and hour rollovers are a carry: the seconds wave knocks up the next minute key as it
// passes it, and at the hour the minute wave trails it and releases a bearing when it is done.
const plan = (counts: Counts, prev: Counts): Lighting => {
  const minuteCarry = prev.s === 59 && counts.s === 0 && (counts.m === prev.m + 1 || (prev.m === 59 && counts.m === 0))
  const hourCarry = minuteCarry && counts.m === 0
  const s = sweep(counts.s, prev.s, STEP_MS, 1)
  let m = sweep(counts.m, prev.m, STEP_MS, 1)
  if (hourCarry) m = (index) => (index - 1) * STEP_MS + MINUTE_LAG_MS
  else if (minuteCarry) m = (index) => (index === counts.m ? (counts.m - 1) * STEP_MS + CARRY_MS : 0)
  const bulk = Math.max(Math.abs(counts.s - prev.s), Math.abs(counts.m - prev.m)) > 1 && !minuteCarry
  return { counts, delays: { s, m }, hourDelay: hourCarry ? 59 * STEP_MS + MINUTE_LAG_MS + 140 : bulk ? 240 : 0 }
}

// --- the rings ----------------------------------------------------------------------------

interface RingProps {
  keys: Key[]
  kind: 's' | 'm'
  count: number
  delay: Delay
}

const keyClass = (key: Key, kind: string, count: number) =>
  `is-${kind}${key.major ? ' is-major' : ''}${key.origin ? ' is-origin' : ''}${key.index >= 1 && key.index <= count ? ' is-on' : ''}`

// Keys: an engraved slot with a coloured cap that springs up out of it.
const KeyRing = memo(function KeyRing({ keys, kind, count, delay }: RingProps) {
  return keys.map((key) => (
    <i key={key.index} className={`sw-dial-key ${keyClass(key, kind, count)}`} style={{ ...key.style, '--d': `${delay(key.index)}ms` } as React.CSSProperties}>
      <b />
    </i>
  ))
})

// Their cast shadows live in a layer of their own so the light can move them all at once.
const CastRing = memo(function CastRing({ keys, kind, count, delay }: RingProps) {
  return keys.map((key) => (
    <i key={key.index} className={`sw-dial-cast ${keyClass(key, kind, count)}`} style={{ ...key.style, '--d': `${delay(key.index)}ms` } as React.CSSProperties} />
  ))
})

// --- the readout drums --------------------------------------------------------------------

interface DrumState {
  digit: string
  prev: string
  turns: number // how many times it has changed since mount; keys the spans so they replay
  dir: 1 | -1
}

function Drum({ state }: { state: DrumState }) {
  const way = state.dir > 0 ? 'is-up' : 'is-down'
  return (
    <span className="sw-dial-drum">
      {state.turns > 0 && <span key={`o${state.turns}`} className={`sw-dial-dg is-out ${way}`}>{state.prev}</span>}
      <span key={`i${state.turns}`} className={`sw-dial-dg${state.turns > 0 ? ` is-in ${way}` : ''}`}>{state.digit}</span>
    </span>
  )
}

// --- the face -----------------------------------------------------------------------------

export function DialFace({ elapsed, running, color, title, subtitle, subtitleColor, titleControl, onBreak }: StopwatchFaceProps) {
  const anchor = useRef<Anchor | null>(null)
  const shownSecond = useRef(Math.floor(elapsed))
  const [second, setSecond] = useState(() => Math.floor(elapsed))
  const lighting = useRef<Lighting>({ counts: countsOf(second), delays: { s: ZERO, m: ZERO }, hourDelay: 0 })

  // Only touches refs and state setters, so it never goes stale.
  const paint = useCallback((value: number) => {
    const whole = Math.floor(value)
    if (whole !== shownSecond.current) {
      shownSecond.current = whole
      setSecond(whole)
    }
  }, [])

  // Re-anchor on each update from the page, unless it only differs from our own projection by
  // jitter; then keep the existing anchor so the keys never step backwards.
  useLayoutEffect(() => {
    const now = performance.now()
    const prev = anchor.current
    const projected = prev ? prev.elapsed + (prev.running ? (now - prev.at) / 1000 : 0) : null
    if (!(prev && running && prev.running && projected !== null && Math.abs(projected - elapsed) < RESYNC_SECONDS)) {
      anchor.current = { elapsed, at: now, running }
    }
    if (!running) paint(elapsed)
  }, [elapsed, running, paint])

  useEffect(() => {
    if (!running) return
    let frame = 0
    const tick = () => {
      const current = anchor.current
      if (current) paint(current.elapsed + (performance.now() - current.at) / 1000)
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [running, paint])

  // Delays are worked out against the last lit counts and kept until the counts change again,
  // so re-renders from the page mid-wave leave the running transitions alone.
  const counts = countsOf(second)
  const prevCounts = lighting.current.counts
  if (counts.s !== prevCounts.s || counts.m !== prevCounts.m || counts.h !== prevCounts.h) {
    lighting.current = plan(counts, prevCounts)
  }
  const { delays } = lighting.current

  const state = running ? 'running' : elapsed > 0 ? 'paused' : 'idle'
  const clock = formatClock(second)

  // Drums, indexed from the right so the seconds keep their identity when hours appear.
  const drums = useRef<{ second: number; columns: DrumState[] }>({ second, columns: [] })
  const readout = drums.current
  const dir: 1 | -1 = second >= readout.second ? 1 : -1
  const digits = clock.replace(/:/g, '')
  for (let k = 0; k < digits.length; k++) {
    const digit = digits[digits.length - 1 - k]
    const column = readout.columns[k]
    if (!column) readout.columns[k] = { digit, prev: digit, turns: 0, dir: 1 }
    else if (column.digit !== digit) readout.columns[k] = { digit, prev: column.digit, turns: column.turns + 1, dir }
  }
  readout.columns.length = digits.length
  readout.second = second

  const readoutCells: React.ReactNode[] = []
  for (let c = clock.length - 1, k = 0; c >= 0; c--) {
    const char = clock[c]
    const fromRight = clock.length - 1 - c
    const isSec = fromRight <= 2
    if (char === ':') readoutCells.unshift(<span key={`c${fromRight}`} className={`sw-dial-colon${isSec ? ' is-sec' : ''}`}>:</span>)
    else {
      readoutCells.unshift(
        <span key={`d${k}`} className={isSec ? 'is-sec' : undefined}><Drum state={readout.columns[k]} /></span>,
      )
      k++
    }
  }

  // --- bearings: roll in along the groove when an hour completes, back out when time drops --
  const wells = useRef<(HTMLElement | null)[]>([])
  const balls = useRef<(HTMLElement | null)[]>([])
  const shownHours = useRef(counts.h)
  useLayoutEffect(() => {
    const from = shownHours.current
    const to = counts.h
    if (from === to) return
    shownHours.current = to
    if (reducedMotion()) return
    const base = lighting.current.hourDelay
    const roll = (index: number, start: number, end: number, delay: number, arriving: boolean) => {
      const wrap = wells.current[index]
      const ball = balls.current[index]
      if (!wrap || !ball) return
      for (const el of [wrap, ball]) el.getAnimations().forEach((animation) => animation.cancel())
      const travel = Math.abs(end - start)
      const duration = arriving ? 420 + travel * 11 : 300 + travel * 6
      // Out of the port, along the groove, into the detent with a small rebound; or the reverse.
      const path = arriving
        ? [
          { at: 0, angle: start, opacity: 0, scale: 0.55 },
          { at: 0.1, angle: start + 1.5, opacity: 1, scale: 1 },
          { at: 0.8, angle: end, opacity: 1, scale: 1 },
          { at: 0.9, angle: end - 1.4, opacity: 1, scale: 1 },
          { at: 1, angle: end, opacity: 1, scale: 1 },
        ]
        : [
          { at: 0, angle: start, opacity: 1, scale: 1 },
          { at: 0.88, angle: end - 1.5, opacity: 1, scale: 1 },
          { at: 1, angle: end, opacity: 0, scale: 0.55 },
        ]
      const easing = arriving ? ['cubic-bezier(.4,0,.6,1)', 'cubic-bezier(.35,.1,.25,1)', 'ease-out', 'ease-in-out'] : ['cubic-bezier(.5,0,.75,0)', 'ease-out']
      const timing: KeyframeAnimationOptions = { duration, delay, fill: 'backwards' }
      wrap.animate(path.map((p, i) => ({ offset: p.at, rotate: `${p.angle}deg`, opacity: p.opacity, easing: easing[i] ?? 'linear' })), timing)
      ball.animate(path.map((p, i) => ({ offset: p.at, rotate: `${-p.angle}deg`, scale: `${p.scale}`, easing: easing[i] ?? 'linear' })), timing)
    }
    if (to > from) {
      for (let index = from; index < to; index++) roll(index, PORT_ANGLE, HOUR_ANGLES[index], base + (index - from) * HOUR_STEP_MS, true)
    } else {
      for (let index = from - 1; index >= to; index--) roll(index, HOUR_ANGLES[index], PORT_ANGLE, (from - 1 - index) * HOUR_STEP_MS, false)
    }
  }, [counts.h])

  // --- pointer tilt: a spring toward the pointer, one fixed light; runs only while needed ----
  const root = useRef<HTMLDivElement>(null)
  const puck = useRef<HTMLDivElement>(null)
  const drop = useRef<HTMLDivElement>(null)
  const sheen = useRef<HTMLDivElement>(null)
  const casts = useRef<HTMLDivElement>(null)
  const glint = useRef<HTMLDivElement>(null)
  const grain = useRef<HTMLDivElement>(null)
  const bearings = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const face = root.current
    if (!face) return
    const spring = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 }
    // The bearings sit loose in their detents: as the puck tips, they rock toward the low side
    // (the side under the pointer) on a softer, bouncier spring of their own.
    const rock = { b: 0, v: 0 }
    const still = matchMedia('(prefers-reduced-motion: reduce)')
    let width = face.offsetWidth // measured on pointer moves, never per frame
    let frame = 0
    let last = 0
    const apply = () => {
      const { x, y } = spring
      const size = width / 400 // px per unit
      const ax = -y * TILT_DEG
      const ay = x * TILT_DEG
      if (puck.current) puck.current.style.transform = `perspective(${Math.round(width * 2.6)}px) rotateX(${ax.toFixed(3)}deg) rotateY(${ay.toFixed(3)}deg)`
      // Reflections move twice as fast as the surface turns.
      const bearing = `${(REST_GLINT + 2 * (glintBearing(ax, ay) - REST_GLINT)).toFixed(2)}deg`
      if (glint.current) glint.current.style.rotate = bearing
      if (grain.current) grain.current.style.rotate = bearing
      if (bearings.current) bearings.current.style.rotate = `${(-rock.b * 1.5).toFixed(3)}deg`
      // The light stays put: the far side's shadow grows, the sheen slides against the tilt.
      if (drop.current) drop.current.style.transform = `translate(${(-x * 5 * size).toFixed(2)}px, ${(-y * 4 * size).toFixed(2)}px)`
      if (casts.current) casts.current.style.transform = `translate(${(-x * 0.7 * size).toFixed(2)}px, ${(-y * 0.7 * size).toFixed(2)}px)`
      if (sheen.current) sheen.current.style.transform = `translate(${(-x * 26 * size).toFixed(2)}px, ${(-y * 26 * size).toFixed(2)}px)`
    }
    const clear = () => {
      for (const el of [puck.current, drop.current, casts.current, sheen.current]) if (el) el.style.transform = ''
      for (const el of [glint.current, grain.current, bearings.current]) if (el) el.style.rotate = ''
      face.classList.remove('is-tilting')
    }
    const step = (now: number) => {
      const dt = Math.min(0.034, last ? (now - last) / 1000 : 1 / 60)
      last = now
      for (const axis of ['x', 'y'] as const) {
        const v = axis === 'x' ? 'vx' : 'vy'
        const target = axis === 'x' ? spring.tx : spring.ty
        const accel = 170 * (target - spring[axis]) - 17 * spring[v]
        spring[v] += accel * dt
        spring[axis] += spring[v] * dt
      }
      rock.v += (80 * (spring.x - rock.b) - 7 * rock.v) * dt
      rock.b += rock.v * dt
      const settled = Math.abs(spring.tx - spring.x) < 0.002 && Math.abs(spring.ty - spring.y) < 0.002 && Math.abs(spring.vx) < 0.01 && Math.abs(spring.vy) < 0.01
        && Math.abs(spring.x - rock.b) < 0.008 && Math.abs(rock.v) < 0.04
      if (settled) {
        spring.x = spring.tx; spring.y = spring.ty; spring.vx = 0; spring.vy = 0
        rock.b = spring.x; rock.v = 0
        frame = 0
        last = 0
        if (spring.tx === 0 && spring.ty === 0) clear()
        else apply()
        return
      }
      apply()
      frame = requestAnimationFrame(step)
    }
    const kick = () => {
      if (!frame) {
        face.classList.add('is-tilting')
        frame = requestAnimationFrame(step)
      }
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || still.matches) return
      const box = face.getBoundingClientRect()
      width = box.width
      let nx = ((event.clientX - box.left) / box.width) * 2 - 1
      let ny = ((event.clientY - box.top) / box.height) * 2 - 1
      const length = Math.hypot(nx, ny)
      if (length > 1) { nx /= length; ny /= length }
      spring.tx = nx
      spring.ty = ny
      kick()
    }
    const leave = () => {
      spring.tx = 0
      spring.ty = 0
      if (spring.x !== 0 || spring.y !== 0) kick()
    }
    face.addEventListener('pointermove', move)
    face.addEventListener('pointerleave', leave)
    return () => {
      face.removeEventListener('pointermove', move)
      face.removeEventListener('pointerleave', leave)
      cancelAnimationFrame(frame)
    }
  }, [])

  // --- starting: the lit keys hop in a quick clockwise ripple, the minute ring just behind ----
  const wasRunning = useRef(running)
  useEffect(() => {
    if (running === wasRunning.current) return
    wasRunning.current = running
    const face = root.current
    if (!running || !face || reducedMotion()) return
    // Keys and their casts are laid out in ring order: sixty seconds, then sixty minutes.
    const keys = face.querySelectorAll<HTMLElement>('.sw-dial-key')
    const shadows = face.querySelectorAll<HTMLElement>('.sw-dial-cast')
    keys.forEach((key, n) => {
      if (!key.classList.contains('is-on') && !key.classList.contains('is-origin')) return
      const timing: KeyframeAnimationOptions = { duration: 440, delay: (n % 60) * WAKE_STEP_MS + (n >= 60 ? 90 : 0), easing: 'cubic-bezier(.3,.7,.3,1)' }
      key.firstElementChild?.animate([{ scale: '1' }, { scale: '1.42', offset: 0.32 }, { scale: '1' }], timing)
      shadows[n]?.animate([{ scale: '1' }, { scale: '1.36', offset: 0.32 }, { scale: '1' }], timing)
    })
  }, [running])

  const [portX, portY] = polar(GROOVE_R, PORT_ANGLE)

  return (
    <div ref={root} className={`sw-face sw-dial is-${state}`} style={{ '--face-color': color } as React.CSSProperties}>
      <div ref={drop} className="sw-dial-drop" aria-hidden="true" />
      <div ref={puck} className="sw-dial-puck" aria-hidden="true">
        <div className="sw-dial-body" />
        <div ref={grain} className="sw-dial-grain" />
        <div ref={glint} className="sw-dial-glint" />
        <div className="sw-dial-well" />
        <div className="sw-dial-light"><div ref={sheen} className="sw-dial-sheen" /></div>
        <div ref={casts} className="sw-dial-casts">
          <CastRing keys={SECONDS} kind="s" count={counts.s} delay={delays.s} />
          <CastRing keys={MINUTES} kind="m" count={counts.m} delay={delays.m} />
        </div>
        <div className="sw-dial-keys">
          <KeyRing keys={SECONDS} kind="s" count={counts.s} delay={delays.s} />
          <KeyRing keys={MINUTES} kind="m" count={counts.m} delay={delays.m} />
        </div>
        <svg className="sw-dial-groove" viewBox="0 0 400 400">
          <path className="sw-dial-groove-lip" d={arc(GROOVE_R, PORT_ANGLE, GROOVE_END)} />
          <path className="sw-dial-groove-cut" d={arc(GROOVE_R, PORT_ANGLE, GROOVE_END)} />
          {HOUR_ANGLES.map((angle, index) => {
            const [cx, cy] = polar(GROOVE_R, angle)
            return <circle key={index} className="sw-dial-detent" cx={cx} cy={cy} />
          })}
          <circle className="sw-dial-port" cx={portX} cy={portY} />
        </svg>
        <div ref={bearings} className="sw-dial-bearings">
          {HOUR_ANGLES.map((angle, index) => (
            <div
              key={index}
              ref={(el) => { wells.current[index] = el }}
              className={`sw-dial-bearing ${index < counts.h ? 'is-on' : ''}`}
              style={{ rotate: `${angle}deg`, '--a': `${angle}deg` } as React.CSSProperties}
            >
              <i ref={(el) => { balls.current[index] = el }} />
            </div>
          ))}
        </div>
      </div>
      <div className="sw-dial-readout">
        <div className="sw-dial-state"><i />{state === 'running' ? (onBreak ? 'On break' : 'Running') : state === 'paused' ? 'Paused' : 'Ready'}</div>
        <div className="sw-dial-digits" role="timer" aria-label={clock}>
          {readoutCells}
        </div>
        {titleControl
          ? (
            <label className="sw-dial-task has-control" title="Change task">
              <span className="sw-dial-task-name">{title}</span>
              <ChevronsUpDown size={12} />
              {titleControl}
            </label>
          )
          : <div className="sw-dial-task"><span className="sw-dial-task-name">{title}</span></div>}
        {subtitle && (
          <div className="sw-dial-list">
            {subtitleColor && <i style={{ background: subtitleColor }} />}
            <span>{subtitle}</span>
          </div>
        )}
      </div>
    </div>
  )
}
