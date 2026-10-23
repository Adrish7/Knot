import { ChevronsUpDown } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatClock } from '../../time'
import { InkController } from './controller'
import './InkFace.css'

// The Ink. A shallow round basin of water seen from above, the readout resting in its calm
// centre. Once a second a drop of the task's colour lands on the rim at the second's place and
// blooms; a slow spiral in the water draws each bloom backwards and inwards as it ages, so the
// last half minute reads as a comet curling round the rim. The pointer trails a little ink.
//
// The water is drawn in type: the trail as it stands at this moment, as a grid of glyphs
// (controller.ts works out where each drop has drifted to, ascii.ts draws it; basin.ts is the
// earlier WebGL2 drawing of the same blobs, one import away). Nothing is simulated.
// React renders only when the shown second changes, for the readout, the minute arc and the
// hour dots. The readout and its drums are the current face's, re-prefixed.

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
    <span className="sw-ink-drum">
      {state.turns > 0 && <span key={`o${state.turns}`} className={`sw-ink-dg is-out ${way}`}>{state.prev}</span>}
      <span key={`i${state.turns}`} className={`sw-ink-dg${state.turns > 0 ? ` is-in ${way}` : ''}`}>{state.digit}</span>
    </span>
  )
}

// --- marks: the minute arc on the rim and the hour dots along the bottom --------------------

const rad = (degrees: number) => (degrees * Math.PI) / 180
// Finished hours sit in a short row at the bottom of the basin, centred on 6 o'clock.
const hourDots = (count: number) => Array.from({ length: count }, (_, index) => {
  const angle = 180 + (count - 1 - 2 * index) * 3.4
  return { x: +(200 + 170 * Math.sin(rad(angle))).toFixed(2), y: +(200 - 170 * Math.cos(rad(angle))).toFixed(2) }
})

// --- the face -----------------------------------------------------------------------------

export function InkFace({ elapsed, running, color, title, subtitle, subtitleColor, titleControl, onBreak }: StopwatchFaceProps) {
  const root = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const probe = useRef<HTMLElement>(null)
  const controller = useRef<InkController | null>(null)
  const shownSecond = useRef(Math.floor(elapsed))
  const [second, setSecond] = useState(() => Math.floor(elapsed))

  useLayoutEffect(() => {
    if (!root.current || !canvas.current || !probe.current) return
    const paint = (whole: number) => {
      if (whole === shownSecond.current) return
      shownSecond.current = whole
      setSecond(whole)
    }
    const ink = new InkController(root.current, canvas.current, probe.current, paint)
    controller.current = ink
    return () => {
      ink.dispose()
      controller.current = null
    }
  }, [])

  useLayoutEffect(() => { controller.current?.setColor(color) }, [color])
  useLayoutEffect(() => { controller.current?.sync(elapsed, running) }, [elapsed, running])

  // When the page is not running we still want the readout to reflect every jump at once.
  useEffect(() => {
    if (!running) {
      const whole = Math.floor(elapsed)
      if (whole !== shownSecond.current) { shownSecond.current = whole; setSecond(whole) }
    }
  }, [elapsed, running])

  const state = running ? 'running' : elapsed > 0 ? 'paused' : 'idle'
  const clock = formatClock(second)
  const minutes = Math.floor(second / 60) % 60
  const hours = Math.min(12, Math.floor(second / 3600))

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
    if (char === ':') readoutCells.unshift(<span key={`c${fromRight}`} className={`sw-ink-colon${isSec ? ' is-sec' : ''}`}>:</span>)
    else {
      readoutCells.unshift(
        <span key={`d${k}`} className={isSec ? 'is-sec' : undefined}><Drum state={readout.columns[k]} /></span>,
      )
      k++
    }
  }

  return (
    <div ref={root} className={`sw-face sw-ink is-${state}`} style={{ '--face-color': color } as React.CSSProperties}>
      <i ref={probe} className="sw-ink-probe" aria-hidden="true" />
      <div className="sw-ink-basin" aria-hidden="true">
        <canvas ref={canvas} className="sw-ink-canvas" />
        <div className="sw-ink-still" />
      </div>
      <div className="sw-ink-rim" aria-hidden="true" />
      <svg className="sw-ink-marks" viewBox="0 0 400 400" aria-hidden="true">
        <circle className={`sw-ink-arc${minutes === 0 ? ' is-empty' : ''}`} cx="200" cy="200" r="193" pathLength={60} transform="rotate(-90 200 200)" style={{ strokeDasharray: `${minutes} 60` }} />
        {hourDots(hours).map((dot, index) => <circle key={index} className="sw-ink-hour" cx={dot.x} cy={dot.y} />)}
      </svg>
      <div className="sw-ink-readout">
        <div className="sw-ink-state"><i />{state === 'running' ? (onBreak ? 'On break' : 'Running') : state === 'paused' ? 'Paused' : 'Ready'}</div>
        <div className="sw-ink-digits" role="timer" aria-label={clock}>
          {readoutCells}
        </div>
        {titleControl
          ? (
            <label className="sw-ink-task has-control" title="Change task">
              <span className="sw-ink-task-name">{title}</span>
              <ChevronsUpDown size={12} />
              {titleControl}
            </label>
          )
          : <div className="sw-ink-task"><span className="sw-ink-task-name">{title}</span></div>}
        {subtitle && (
          <div className="sw-ink-list">
            {subtitleColor && <i style={{ background: subtitleColor }} />}
            <span>{subtitle}</span>
          </div>
        )}
      </div>
    </div>
  )
}
