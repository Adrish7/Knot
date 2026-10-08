import { useLayoutEffect, useRef, useState } from 'react'
import { formatSpent } from '../time'

export interface TimelineSpan {
  start: number // ms
  end: number
  owner: string // what the time belongs to (a task id, or the open stopwatch), to total its day
  color: string
  title: string
  subtitle: string
  running: boolean
  isBreak: boolean // on a break-tagged task: part of a break, not working time
}

// What the pointer is over: a working session, or a break. A break runs from one working session
// to the next (or to now) and takes in any sessions on break-tagged tasks inside it.
type Hovered =
  | { kind: 'span'; span: TimelineSpan }
  | { kind: 'break'; start: number; end: number; untilNow: boolean; inside: TimelineSpan[] }

interface DayTimelineProps {
  spans: TimelineSpan[]
  now: number
  breakColor?: string
}

const clockTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const HOUR = 3_600_000
const HIT_SLOP = 4 // px either side of a session that still counts as on it, so short ones are easy to catch

// Today's sessions along a hairline from the first one to now (at least an hour wide), with
// hour ticks. Labels that would collide with the start or "Now" labels are left out. Hovering
// shows a card for the session (or break) under the pointer.
export function DayTimeline({ spans, now, breakColor = 'var(--text-3)' }: DayTimelineProps) {
  const bandRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [pointerPx, setPointerPx] = useState<number | null>(null)
  const [tipWidth, setTipWidth] = useState(0)

  useLayoutEffect(() => {
    const band = bandRef.current
    if (!band) return
    setWidth(band.clientWidth)
    const observer = new ResizeObserver(() => setWidth(band.clientWidth))
    observer.observe(band)
    return () => observer.disconnect()
  }, [])

  const count = spans.length
  const start = count ? Math.min(...spans.map((span) => span.start)) : now
  const end = Math.max(now, start + HOUR)
  const pct = (ms: number) => ((ms - start) / (end - start)) * 100
  const live = spans.find((span) => span.running)
  const nowPct = pct(now)
  const nowAtEnd = nowPct > 92

  const hours: { at: number; pct: number; label: boolean }[] = []
  const firstHour = new Date(start)
  firstHour.setMinutes(0, 0, 0)
  const nowPx = (nowPct / 100) * width // the start label gives way to "Now" until they have room apart
  let lastLabelPx = 0 // the start label
  for (let at = firstHour.getTime() + (firstHour.getTime() < start ? HOUR : 0); at <= end; at += HOUR) {
    const p = pct(at)
    const px = (p / 100) * width
    const clearNow = nowAtEnd ? px < nowPx - 72 : Math.abs(px - nowPx) > 64
    const label = width > 0 && px - lastLabelPx > 84 && clearNow && px < width - 32
    if (label) lastLabelPx = px
    hours.push({ at, pct: p, label })
  }

  const hovered = pointerPx === null || width === 0 ? null : hitTest(pointerPx)
  function hitTest(px: number): Hovered | null {
    const toPx = (ms: number) => (pct(ms) / 100) * width
    let best: TimelineSpan | null = null
    let bestDistance = HIT_SLOP
    for (const span of spans) {
      const from = toPx(span.start)
      const to = Math.max(toPx(span.end), from + 3) // segments draw at least 3px wide
      const distance = px < from ? from - px : px > to ? px - to : 0
      if (distance <= bestDistance) {
        best = span
        bestDistance = distance
      }
    }
    if (best && !best.isBreak) return { kind: 'span', span: best }
    const at = start + (px / width) * (end - start)
    if (!best && at > now) return null
    const [from, to] = best ? [best.start, best.end] : [at, at]
    const work = spans.filter((span) => !span.isBreak)
    const before = work.filter((span) => span.end <= from).at(-1)
    const after = work.find((span) => span.start >= to)
    const runStart = before ? before.end : spans.find((span) => span.start <= to)?.start
    if (runStart === undefined) return null
    const runEnd = after ? after.start : now
    const inside = spans.filter((span) => span.isBreak && span.start >= runStart && span.end <= runEnd)
    return { kind: 'break', start: runStart, end: runEnd, untilNow: !after, inside }
  }

  useLayoutEffect(() => {
    const measured = tipRef.current?.offsetWidth ?? 0
    if (measured !== tipWidth) setTipWidth(measured)
  })

  const tipLeft = pointerPx === null ? 0 : Math.min(Math.max(pointerPx, tipWidth / 2), width - tipWidth / 2)
  const range = (from: number, to: number, toNow: boolean) => `${clockTime.format(from)} – ${toNow ? 'now' : clockTime.format(to)}`
  let tip: React.ReactNode = null
  if (hovered?.kind === 'span') {
    const { span } = hovered
    const owned = spans.filter((other) => other.owner === span.owner)
    const ownedSeconds = owned.reduce((sum, other) => sum + (other.end - other.start) / 1000, 0)
    tip = (
      <>
        <div className="sw-tip-title" style={{ '--seg-color': span.color } as React.CSSProperties}><span className="sw-tip-dot" />{span.title}</div>
        <div className="sw-tip-meta">{span.subtitle}</div>
        <div className="sw-tip-row"><span>{range(span.start, span.end, span.running)}</span><span>{formatSpent((span.end - span.start) / 1000)}</span></div>
        {owned.length > 1 && (
          <div className="sw-tip-foot">Session {owned.indexOf(span) + 1} of {owned.length} today · {formatSpent(ownedSeconds)} in all</div>
        )}
      </>
    )
  } else if (hovered?.kind === 'break') {
    // Time on break-tagged tasks inside the break, one line per task.
    const onTasks = new Map<string, { title: string; seconds: number }>()
    for (const span of hovered.inside) {
      const entry = onTasks.get(span.owner) ?? { title: span.title, seconds: 0 }
      entry.seconds += (span.end - span.start) / 1000
      onTasks.set(span.owner, entry)
    }
    tip = (
      <>
        <div className="sw-tip-title" style={{ '--seg-color': breakColor } as React.CSSProperties}><span className="sw-tip-dot" />Break</div>
        <div className="sw-tip-row"><span>{range(hovered.start, hovered.end, hovered.untilNow)}</span><span>{formatSpent((hovered.end - hovered.start) / 1000)}</span></div>
        {onTasks.size > 0 && (
          <div className="sw-tip-foot">
            {[...onTasks.entries()].map(([owner, entry]) => <div key={owner} className="sw-tip-line"><span>{entry.title}</span><span>{formatSpent(entry.seconds)}</span></div>)}
          </div>
        )}
      </>
    )
  }

  return (
    <section className="sw-sessions" aria-label="Today's sessions">
      <div className="sw-section-head">
        <h2>Sessions</h2>
        {count > 0 && <span>{count} {count === 1 ? 'session' : 'sessions'} since {clockTime.format(start)}</span>}
      </div>
      <div
        className="sw-band"
        ref={bandRef}
        onPointerMove={(event) => setPointerPx(event.clientX - event.currentTarget.getBoundingClientRect().left)}
        onPointerLeave={() => setPointerPx(null)}
      >
        <div className="sw-band-base" />
        {count > 0 && (
          <>
            {hours.map((hour) => <div key={hour.at} className="sw-band-tick" style={{ left: `${hour.pct}%` }} />)}
            {hovered?.kind === 'break' && (
              <div className="sw-band-gap" style={{ left: `${pct(hovered.start)}%`, width: `${pct(hovered.end) - pct(hovered.start)}%` }} />
            )}
            {spans.map((span, index) => (
              <div
                key={`${index}-${span.start}`}
                className={`sw-band-seg ${span.isBreak ? 'is-break' : ''} ${span.running ? 'is-live' : ''} ${hovered?.kind === 'span' && hovered.span === span ? 'is-hover' : ''}`}
                style={{ '--seg-color': span.isBreak ? breakColor : span.color, left: `${pct(span.start)}%`, width: `${Math.max(0, pct(span.end) - pct(span.start))}%` } as React.CSSProperties}
                role="img"
                aria-label={`${span.isBreak ? 'Break: ' : ''}${span.title}, ${range(span.start, span.end, span.running)}, ${formatSpent((span.end - span.start) / 1000)}`}
              />
            ))}
            {live
              ? <div className="sw-band-cap" style={{ '--seg-color': live.isBreak ? breakColor : live.color, left: `${nowPct}%` } as React.CSSProperties} />
              : <div className="sw-band-now" style={{ left: `${nowPct}%` }} />}
            {tip && <div className="sw-tip" ref={tipRef} style={{ left: tipLeft }} aria-hidden="true">{tip}</div>}
          </>
        )}
      </div>
      {count > 0
        ? (
          <div className="sw-band-labels">
            {(nowAtEnd || nowPx > 72) && <span className="is-start" style={{ left: 0 }}>{clockTime.format(start)}</span>}
            {hours.filter((hour) => hour.label).map((hour) => <span key={hour.at} style={{ left: `${hour.pct}%` }}>{clockTime.format(hour.at)}</span>)}
            <span className={`is-now ${nowAtEnd ? 'is-end' : ''}`} style={{ left: `${nowPct}%` }}>Now</span>
          </div>
        )
        : <p className="sw-sessions-empty">No sessions yet today. Press Start, or play a task from the Today list.</p>}
    </section>
  )
}
