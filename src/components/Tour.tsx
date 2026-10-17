import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import hearth from '../assets/sanctuary/hearth-awake.avif'
import type { ViewId } from '../types'
import './Tour.css'

// A short walkthrough of what's new: coach marks over the real interface. Each step names the view
// it needs, the element it points at (a data-tour attribute) and where the card prefers to sit.

type Side = 'right' | 'left' | 'above' | 'below'

export interface TourStep {
  view: ViewId | null // null: stay where the user is
  target: string // data-tour value
  title: string
  body: string
  sides: Side[]
  pad: number
  radius: number | string
  art?: boolean
}

export const WHATS_NEW: TourStep[] = [
  {
    view: null, target: 'sanctuary-nav', title: 'Sanctuary', sides: ['right'], pad: 4, radius: 8, art: true,
    body: 'A tree hollow that fills from your focus time. There is nothing in it to keep up with.',
  },
  {
    view: 'sanctuary', target: 'lanterns', title: 'Hearth and the lanterns', sides: ['right', 'below'], pad: 8, radius: 16,
    body: 'Every 72 minutes of focus lights a lantern; all five is a 6 h day. They go out at 6 AM. Click Hearth and it says how much today has.',
  },
  {
    view: 'sanctuary', target: 'growth', title: 'Growth and glimmers', sides: ['right', 'below', 'left'], pad: 8, radius: 14,
    body: 'The marks on the trunk are the long run: your focus hours, all time. Hearth is a Sprout until 20 h, Hearth until 150 h, then Elder. Every 15 minutes also drops a glimmer in the jar; spend them on the faint keepsakes.',
  },
  {
    view: 'stopwatch', target: 'cinder', title: 'Cinder on the Stopwatch', sides: ['right', 'left', 'above'], pad: 10, radius: 16,
    body: 'Cinder stands beside the basin while a stopwatch runs. After 50 minutes without a break it offers one, and rests with tea on a break. Click it for the stretch so far.',
  },
  {
    view: null, target: 'foot-buddy', title: 'Hearth in the sidebar', sides: ['right', 'above'], pad: 6, radius: '50%',
    body: 'Opens the Sanctuary from any page. This tour is under ? on the Sanctuary and in Settings, where you can also turn the Sanctuary and buddies off.',
  },
]

const GAP = 12
const MARGIN = 16
const CARD_W = 300

interface Rect { top: number; left: number; width: number; height: number }

export function Tour({ steps, step, onStep, onClose, onView }: { steps: TourStep[]; step: number; onStep: (step: number) => void; onClose: () => void; onView: (view: ViewId) => void }) {
  const current = steps[step]
  const [rect, setRect] = useState<Rect | null>(null)
  const [cardH, setCardH] = useState(180)
  const cardRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const last = step === steps.length - 1

  useEffect(() => {
    if (current.view) onView(current.view)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // Measure the target after the view has painted, and again on resize and while things settle.
  useLayoutEffect(() => {
    let frame = 0
    let tries = 0
    const measure = () => {
      const element = document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`)
      const box = element?.getBoundingClientRect()
      if (box && box.width > 0) setRect({ top: box.top - current.pad, left: box.left - current.pad, width: box.width + current.pad * 2, height: box.height + current.pad * 2 })
      else setRect(null)
      if (cardRef.current) setCardH(cardRef.current.offsetHeight)
      if (tries++ < 20) frame = requestAnimationFrame(measure)
    }
    frame = requestAnimationFrame(measure)
    const onResize = () => { tries = 0; cancelAnimationFrame(frame); frame = requestAnimationFrame(measure) }
    window.addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', onResize) }
  }, [current])

  useEffect(() => { nextRef.current?.focus() }, [step])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() }
      if (event.key === 'ArrowRight') { event.preventDefault(); if (last) onClose(); else onStep(step + 1) }
      if (event.key === 'ArrowLeft' && step > 0) { event.preventDefault(); onStep(step - 1) }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [step, last, onClose, onStep])

  const place = placeCard(rect, current.sides, cardH)

  return (
    <div className="tour" role="presentation">
      {rect
        ? <div className="tour-spot" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height, borderRadius: current.radius }} />
        : <div className="tour-dim" />}
      <div
        key={step}
        ref={cardRef}
        className={`tour-card ${current.art ? 'has-art' : ''}`}
        role="dialog"
        aria-label={current.title}
        style={{ top: place.top, left: place.left, width: CARD_W }}
      >
        {place.side && <span className={`tour-arrow is-${place.side}`} style={place.side === 'left' || place.side === 'right' ? { top: place.arrow } : { left: place.arrow }} />}
        {current.art && <img className="tour-art" src={hearth} alt="" />}
        <h2>{current.title}</h2>
        <p>{current.body}</p>
        <div className="tour-foot">
          <span className="tour-count">{step + 1} of {steps.length}</span>
          {!last && <button className="tour-skip" onClick={onClose}>Skip</button>}
          <button className="tour-back" onClick={() => onStep(step - 1)} disabled={step === 0}>Back</button>
          <button ref={nextRef} className="tour-next" onClick={() => last ? onClose() : onStep(step + 1)}>{last ? 'Done' : 'Next'}</button>
        </div>
      </div>
    </div>
  )
}

// The first preferred side with room wins; otherwise the roomiest. The card is centred on the
// target along the other axis and kept inside the window; the arrow keeps pointing at the target.
function placeCard(rect: Rect | null, sides: Side[], cardH: number) {
  const W = window.innerWidth
  const H = window.innerHeight
  if (!rect) return { top: Math.max(MARGIN, (H - cardH) / 2), left: Math.max(MARGIN, (W - CARD_W) / 2), side: null as Side | null, arrow: 0 }
  const room: Record<Side, number> = {
    right: W - (rect.left + rect.width) - GAP - MARGIN,
    left: rect.left - GAP - MARGIN,
    below: H - (rect.top + rect.height) - GAP - MARGIN,
    above: rect.top - GAP - MARGIN,
  }
  const need = (side: Side) => side === 'left' || side === 'right' ? CARD_W : cardH
  const side = sides.find((candidate) => room[candidate] >= need(candidate))
    ?? (Object.keys(room) as Side[]).sort((a, b) => room[b] - room[a])[0]
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max))
  let top: number
  let left: number
  if (side === 'right' || side === 'left') {
    left = side === 'right' ? rect.left + rect.width + GAP : rect.left - GAP - CARD_W
    top = clamp(cy - cardH / 2, MARGIN, H - cardH - MARGIN)
    return { top, left, side, arrow: clamp(cy - top - 6, 14, cardH - 26) }
  }
  top = side === 'below' ? rect.top + rect.height + GAP : rect.top - GAP - cardH
  left = clamp(cx - CARD_W / 2, MARGIN, W - CARD_W - MARGIN)
  return { top, left, side, arrow: clamp(cx - left - 6, 14, CARD_W - 26) }
}
