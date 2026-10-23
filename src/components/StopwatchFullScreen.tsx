import { Minimize2, Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { InkFace } from './ink/InkFace'

interface StopwatchFullScreenProps {
  elapsed: number
  running: boolean
  color: string
  title: string
  subtitle: string
  subtitleColor?: string
  onBreak: boolean
  onToggle: () => void // start, pause or resume
  onExit: () => void
}

const IDLE_MS = 2500

// The stopwatch alone, filling the screen: the face as large as the screen allows and, under it,
// the one button that matters and the way out. While it runs and the pointer rests, the buttons
// and the cursor fade away so only the face is left. Space starts and pauses; Esc or F leaves.
export function StopwatchFullScreen({ elapsed, running, color, title, subtitle, subtitleColor, onBreak, onToggle, onExit }: StopwatchFullScreenProps) {
  const [idle, setIdle] = useState(false)
  const idleTimer = useRef(0)
  const toggle = useRef(onToggle)
  const exit = useRef(onExit)
  toggle.current = onToggle
  exit.current = onExit

  useEffect(() => {
    const wake = () => {
      setIdle(false)
      window.clearTimeout(idleTimer.current)
      idleTimer.current = window.setTimeout(() => setIdle(true), IDLE_MS)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === ' ') {
        // Space always starts and pauses here, never presses whichever button was clicked last.
        event.preventDefault()
        if (!event.repeat) toggle.current()
      } else if (event.key === 'Escape' || event.key.toLowerCase() === 'f') {
        event.preventDefault()
        exit.current()
      } else return
      wake()
    }
    const onKeyUp = (event: KeyboardEvent) => { if (event.key === ' ') event.preventDefault() }
    wake()
    window.addEventListener('pointermove', wake)
    window.addEventListener('pointerdown', wake)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      window.clearTimeout(idleTimer.current)
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('pointerdown', wake)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
    }
  }, [])

  // Paused or not started, the buttons stay: there is nothing to keep them out of the way of.
  const quiet = idle && running

  return createPortal(
    <div className={`sw-full ${quiet ? 'is-quiet' : ''}`} style={{ '--face-color': color } as React.CSSProperties} role="dialog" aria-label="Stopwatch, full screen">
      <InkFace elapsed={elapsed} running={running} color={color} title={title} subtitle={subtitle} subtitleColor={subtitleColor} onBreak={onBreak} />
      <div className="sw-controls sw-full-bar">
        <button className={`sw-primary ${running ? 'is-running' : ''}`} onClick={onToggle} title={running ? 'Pause (Space)' : 'Start (Space)'}>
          {running
            ? <><Pause size={14} fill="currentColor" strokeWidth={1.5} />Pause</>
            : <><Play size={14} fill="currentColor" strokeWidth={1.5} />{elapsed > 0 ? 'Resume' : 'Start'}</>}
        </button>
        <button className="secondary-button sw-full-exit" onClick={onExit} title="Exit full screen (Esc)">
          <Minimize2 size={14} />Exit full screen<kbd>esc</kbd>
        </button>
      </div>
    </div>,
    document.body,
  )
}
