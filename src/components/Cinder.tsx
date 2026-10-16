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
// the belly's glow are drawn over them and grow with the stretch (`focus`, 0..1).

export type CinderPose = 'asleep' | 'awake' | 'focused' | 'tired' | 'break' | 'cheer'

const POSES: { pose: CinderPose; src: string; tip: [number, number] }[] = [
  { pose: 'asleep', src: asleep, tip: [57, 1] },
  { pose: 'awake', src: awake, tip: [52, 3] },
  { pose: 'focused', src: focused, tip: [57, 5] },
  { pose: 'tired', src: tired, tip: [72, 2] },
  { pose: 'break', src: rest, tip: [51, 3] },
  { pose: 'cheer', src: cheer, tip: [52, 4] },
]

export function Cinder({ pose, focus, className = '', ...rest }: { pose: CinderPose; focus: number; className?: string; 'data-tour'?: string }) {
  const current = POSES.find((entry) => entry.pose === pose) ?? POSES[0]
  return (
    <div
      {...rest}
      className={`cinder is-${pose} ${className}`}
      style={{ '--focus': focus.toFixed(3), '--tip-x': `${current.tip[0]}%`, '--tip-y': `${current.tip[1]}%` } as React.CSSProperties}
      aria-hidden="true"
    >
      <div className="cinder-warm" />
      <div className="cinder-floor" />
      <div className="cinder-rig">
        {POSES.map((entry) => <img key={entry.pose} src={entry.src} alt="" draggable={false} className={entry.pose === pose ? 'is-on' : ''} />)}
        <div className="cinder-ember" />
        <div className="cinder-halo" />
        {pose === 'break' && <div className="cinder-steam" />}
      </div>
    </div>
  )
}
