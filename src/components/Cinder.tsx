import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import asleep from '../assets/sanctuary/cinder-asleep.avif'
import awake from '../assets/sanctuary/cinder-awake.avif'
import rest from '../assets/sanctuary/cinder-break.avif'
import cheer from '../assets/sanctuary/cinder-cheer.avif'
import focused from '../assets/sanctuary/cinder-focused.avif'
import tired from '../assets/sanctuary/cinder-tired.avif'
import './Cinder.css'

// Cinder keeps the flame of focus. It stands beside the Stopwatch's basin (never on it): asleep
// when nothing runs, holding its ember while you work, yawning after a long stretch, with tea on a
// break, and a short cheer when a task is done. Six painted poses, crossfaded; the flame's halo and
// the belly's glow are drawn over them and grow with the stretch (`focus`, 0..1). A click makes it
// hop (or stir, or sip its tea) and say one plain line, `line`, which the page writes.

export type CinderPose = 'asleep' | 'awake' | 'focused' | 'tired' | 'break' | 'cheer'

// Sparks off the flame on a click: six short flights upward.
const SPARKS = Array.from({ length: 6 }, (_, i) => {
  const angle = (i / 6) * Math.PI * 2 + 0.4
  const reach = 10 + (i % 3) * 4
  return { '--dx': `${(Math.cos(angle) * reach).toFixed(0)}px`, '--dy': `${(-22 - Math.abs(Math.sin(angle)) * reach * 0.5).toFixed(0)}px`, '--o': `${i * 36}ms` } as React.CSSProperties
})

const POSES: { pose: CinderPose; src: string; tip: [number, number] }[] = [
  { pose: 'asleep', src: asleep, tip: [57, 1] },
  { pose: 'awake', src: awake, tip: [52, 3] },
  { pose: 'focused', src: focused, tip: [57, 5] },
  { pose: 'tired', src: tired, tip: [72, 2] },
  { pose: 'break', src: rest, tip: [51, 3] },
  { pose: 'cheer', src: cheer, tip: [52, 4] },
]

export function Cinder({ pose, focus, line, onPoke, className = '', ...rest }: { pose: CinderPose; focus: number; line: string | null; onPoke: () => void; className?: string; 'data-tour'?: string }) {
  const current = POSES.find((entry) => entry.pose === pose) ?? POSES[0]
  const [poked, setPoked] = useState(0) // a count, so the steam wisp restarts on each sip
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef(0)
  const [said, setSaid] = useState(line) // the bubble keeps its words while it fades out
  if (line && line !== said) setSaid(line)
  useEffect(() => () => clearTimeout(timer.current), [])
  const poke = () => {
    // Off and on again, so a click mid-reaction restarts it.
    flushSync(() => setPoked((n) => -Math.abs(n)))
    void ref.current?.offsetWidth
    setPoked((n) => Math.abs(n) + 1)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setPoked((n) => -Math.abs(n)), 1100)
    onPoke()
  }
  return (
    <div
      {...rest}
      ref={ref}
      className={`cinder is-${pose} ${poked > 0 ? 'is-poked' : ''} ${className}`}
      style={{ '--focus': focus.toFixed(3), '--tip-x': `${current.tip[0]}%`, '--tip-y': `${current.tip[1]}%` } as React.CSSProperties}
    >
      <div className="cinder-warm" />
      <div className="cinder-floor" />
      <div className="cinder-rig">
        {POSES.map((entry) => <img key={entry.pose} src={entry.src} alt="" draggable={false} className={entry.pose === pose ? 'is-on' : ''} />)}
        <div className="cinder-ember" />
        <div className="cinder-halo" />
        {pose === 'break' && <div key={Math.abs(poked)} className="cinder-steam" />}
        <div className="cinder-sparks">{SPARKS.map((style, i) => <i key={i} style={style} />)}</div>
      </div>
      <button className="cinder-poke" aria-label="Cinder" aria-describedby="cinder-says" onClick={poke} />
      <div id="cinder-says" className={`cinder-bubble ${line ? 'is-on' : ''}`} role="status">{line ?? said}</div>
    </div>
  )
}
