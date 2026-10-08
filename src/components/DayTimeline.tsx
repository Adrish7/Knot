import { useLayoutEffect, useRef, useState } from 'react'
import { formatSpent } from '../time'

export interface TimelineSpan {
  start: number // ms
  end: number
  color: string
  title: string
  running: boolean
}

interface DayTimelineProps {
  spans: TimelineSpan[]
  now: number
}

const clockTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const HOUR = 3_600_000

// Today's sessions along a hairline from the first one to now (at least an hour wide), with
// hour ticks. Labels that would collide with the start or "Now" labels are left out.
export function DayTimeline({ spans, now }: DayTimelineProps) {
  const bandRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

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

  return (
    <section className="sw-sessions" aria-label="Today's sessions">
      <div className="sw-section-head">
        <h2>Sessions</h2>
        {count > 0 && <span>{count} {count === 1 ? 'session' : 'sessions'} since {clockTime.format(start)}</span>}
      </div>
      <div className="sw-band" ref={bandRef}>
        <div className="sw-band-base" />
        {count > 0 && (
          <>
            {hours.map((hour) => <div key={hour.at} className="sw-band-tick" style={{ left: `${hour.pct}%` }} />)}
            {spans.map((span, index) => (
              <div
                key={`${index}-${span.start}`}
                className={`sw-band-seg ${span.running ? 'is-live' : ''}`}
                style={{ '--seg-color': span.color, left: `${pct(span.start)}%`, width: `${Math.max(0, pct(span.end) - pct(span.start))}%` } as React.CSSProperties}
                title={`${span.title} · ${clockTime.format(span.start)}–${span.running ? 'now' : clockTime.format(span.end)} · ${formatSpent((span.end - span.start) / 1000)}`}
              />
            ))}
            {live
              ? <div className="sw-band-cap" style={{ '--seg-color': live.color, left: `${nowPct}%` } as React.CSSProperties} />
              : <div className="sw-band-now" style={{ left: `${nowPct}%` }} />}
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
