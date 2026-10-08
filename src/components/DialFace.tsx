import { ChevronsUpDown } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatClock } from '../time'
import './DialFace.css'

// The Dial face. Sixty second ticks around the rim light up one by one in the task's colour and
// wipe clockwise back to neutral at the top of each minute; an inner ring of sixty minute ticks
// does the same once an hour, and completed hours gather as dots along the bottom. The page hands
// in `elapsed` a few times a second; the face projects it on its own animation frame and only
// re-renders when the shown second changes, so ticks step exactly once a second.

export interface StopwatchFaceProps {
  elapsed: number // seconds, may be fractional
  running: boolean
  color: string // the task's list colour, or the stopwatch hue
  title: string
  subtitle?: string
  subtitleColor?: string // a dot beside the subtitle, e.g. the list colour
  titleControl?: React.ReactNode // laid over the title, e.g. a transparent <select> to change task
}

const C = 200
const SWEEP_MS = 7 // between ticks when many change at once
const HOUR_SWEEP_MS = 40
// Drift under this between the page's updates and our own clock is jitter, not a real change.
const RESYNC_SECONDS = 0.35

const polar = (radius: number, degrees: number): [number, number] => {
  const angle = (degrees * Math.PI) / 180
  return [+(C + radius * Math.sin(angle)).toFixed(3), +(C - radius * Math.cos(angle)).toFixed(3)]
}

interface Tick {
  x1: number
  y1: number
  x2: number
  y2: number
  major: boolean
  origin: boolean
}

// Sixty ticks from an outer radius inward: every fifth reaches further, the one at twelve furthest.
const ring = (outer: number, inner: number, major: number, origin: number): Tick[] =>
  Array.from({ length: 60 }, (_, index) => {
    const isMajor = index % 5 === 0
    const [x1, y1] = polar(outer, index * 6)
    const [x2, y2] = polar(index === 0 ? origin : isMajor ? major : inner, index * 6)
    return { x1, y1, x2, y2, major: isMajor, origin: index === 0 }
  })

const SECONDS = ring(196, 187, 184, 181)
const MINUTES = ring(177, 165, 162, 159)
// Twelve hour positions on an arc along the bottom, filling left to right.
const HOURS = Array.from({ length: 12 }, (_, index) => polar(128, 180 + (5.5 - index) * 7.2))

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
  delays: { s: Delay; m: Delay; h: Delay }
}

const NO_SWEEP: Lighting['delays'] = { s: () => 0, m: () => 0, h: () => 0 }

const countsOf = (second: number): Counts => ({
  s: second % 60,
  m: Math.floor(second / 60) % 60,
  h: Math.min(12, Math.floor(second / 3600)),
})

// Per-element transition delay so that a bulk change sweeps clockwise one step at a time. Lit
// elements are those with `first <= index < count + first`; a single new tick lights at once.
const sweep = (count: number, prev: number, step: number, first: number): Delay => (index) => {
  const position = index - first
  if (count > prev) return count - prev === 1 || position < prev || position >= count ? 0 : (position - prev) * step
  if (count < prev) return position < count || position >= prev ? 0 : (position - count) * step
  return 0
}

export function DialFace({ elapsed, running, color, title, subtitle, subtitleColor, titleControl }: StopwatchFaceProps) {
  const anchor = useRef<Anchor | null>(null)
  const shownSecond = useRef(Math.floor(elapsed))
  const [second, setSecond] = useState(() => Math.floor(elapsed))
  const lighting = useRef<Lighting>({ counts: countsOf(second), delays: NO_SWEEP })

  // Only touches refs and state setters, so it never goes stale.
  const paint = useCallback((value: number) => {
    const whole = Math.floor(value)
    if (whole !== shownSecond.current) {
      shownSecond.current = whole
      setSecond(whole)
    }
  }, [])

  // Re-anchor on each update from the page, unless it only differs from our own projection by
  // jitter; then keep the existing anchor so the ticks never step backwards.
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

  // Sweep delays are worked out against the last lit counts and kept until the counts change
  // again, so re-renders from the page mid-wipe leave the running transitions alone.
  const counts = countsOf(second)
  const prev = lighting.current.counts
  if (counts.s !== prev.s || counts.m !== prev.m || counts.h !== prev.h) {
    lighting.current = {
      counts,
      delays: { s: sweep(counts.s, prev.s, SWEEP_MS, 1), m: sweep(counts.m, prev.m, SWEEP_MS, 1), h: sweep(counts.h, prev.h, HOUR_SWEEP_MS, 0) },
    }
  }
  const { delays } = lighting.current

  const state = running ? 'running' : elapsed > 0 ? 'paused' : 'idle'
  const clock = formatClock(second)
  const cut = clock.lastIndexOf(':')

  const renderRing = (ticks: Tick[], kind: 's' | 'm', count: number, delay: Delay) =>
    ticks.map((tick, index) => (
      <line
        key={index}
        className={`sw-dial-tick is-${kind} ${tick.major ? 'is-major' : ''} ${tick.origin ? 'is-origin' : ''} ${index >= 1 && index <= count ? 'is-on' : ''}`}
        style={{ transitionDelay: `${delay(index)}ms` }}
        x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2}
      />
    ))

  return (
    <div className={`sw-face sw-dial is-${state}`} style={{ '--face-color': color } as React.CSSProperties}>
      <svg className="sw-dial-svg" viewBox="0 0 400 400" aria-hidden="true">
        <circle className="sw-dial-hairline" cx={C} cy={C} r="149.5" />
        <g>{renderRing(SECONDS, 's', counts.s, delays.s)}</g>
        <g>{renderRing(MINUTES, 'm', counts.m, delays.m)}</g>
        <g>
          {HOURS.map(([cx, cy], index) => (
            <circle key={index} className={`sw-dial-hour ${index < counts.h ? 'is-on' : ''}`} style={{ transitionDelay: `${delays.h(index)}ms` }} cx={cx} cy={cy} />
          ))}
        </g>
      </svg>
      <div className="sw-dial-readout">
        <div className="sw-dial-state"><i />{state === 'running' ? 'Running' : state === 'paused' ? 'Paused' : 'Ready'}</div>
        <div className="sw-dial-digits" role="timer" aria-label={clock}>
          <span aria-hidden="true">{clock.slice(0, cut)}</span>
          <span className="sw-dial-sec" aria-hidden="true">{clock.slice(cut)}</span>
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
