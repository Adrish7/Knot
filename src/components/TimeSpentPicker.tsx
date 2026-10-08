import { Play, Timer, X } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { formatDayKey, todayKey } from '../format'
import { formatClock, formatSpent, isRunning, totalSeconds } from '../time'
import { useNow } from '../useNow'
import { usePopover } from './DateTimePicker'
import type { TimeTrack } from '../types'

// How the control is drawn where it sits: a hover icon in a task row's actions, a label in a
// row's meta line, a small chip on a calendar chip, a labelled field in the details panel, an
// action on the Completed page, or a plain button on the Stopwatch page.
type Variant = 'icon' | 'meta' | 'chip' | 'field' | 'archive' | 'button'

interface TimeSpentPickerProps {
  track: TimeTrack
  onChange: (seconds: number) => void // sets the total; 0 clears it
  onStopwatch?: () => void // opens the stopwatch for this task
  variant: Variant
  taskTitle?: string
  buttonLabel?: React.ReactNode
  day?: string // the day changes count toward; today when not given
}

const MAX_HOURS = 999
const PRESETS: { label: string; minutes: number }[] = [
  { label: '+15m', minutes: 15 },
  { label: '+30m', minutes: 30 },
  { label: '+1h', minutes: 60 },
]

function clampInt(raw: string, max: number) {
  const parsed = Math.floor(Number(raw))
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.min(parsed, max)
}

export function TimeSpentPicker({ track, onChange, onStopwatch, variant, taskTitle, buttonLabel, day }: TimeSpentPickerProps) {
  const [open, setOpen] = useState(false)
  const [hours, setHours] = useState(0)
  const [minutes, setMinutes] = useState(0)
  const [openedMinutes, setOpenedMinutes] = useState(0) // whole minutes shown when the popover opened

  const running = isRunning(track)
  const now = useNow(running)
  const seconds = totalSeconds(track, now)
  const hasValue = running || seconds >= 1
  const currentMinutes = Math.floor(seconds / 60)
  const draftTotal = hours * 60 + minutes

  const openPicker = () => {
    setOpenedMinutes(currentMinutes)
    setHours(Math.floor(currentMinutes / 60))
    setMinutes(currentMinutes % 60)
    setOpen(true)
  }

  // Closing by any route other than Escape keeps what was typed, so the knob behaves like a
  // setting rather than a form. Untouched fields write nothing. While the stopwatch runs the
  // change is applied as a difference, so seconds that passed meanwhile are kept; paused, the
  // typed value is taken exactly.
  const commit = () => {
    const change = draftTotal - openedMinutes
    if (change !== 0) onChange(running ? totalSeconds(track, Date.now()) + change * 60 : draftTotal * 60)
    setOpen(false)
  }

  const clear = () => {
    if (hasValue) onChange(0)
    setOpen(false)
  }

  const addMinutes = (amount: number) => {
    const total = Math.min(draftTotal + amount, MAX_HOURS * 60 + 59)
    setHours(Math.floor(total / 60))
    setMinutes(total % 60)
  }

  const { fieldRef, popoverRef, coords } = usePopover(open, (reason) => (reason === 'escape' ? setOpen(false) : commit()), undefined, variant === 'icon' || variant === 'chip' ? 'end' : 'start')

  const label = hasValue ? (running ? formatClock(seconds) : formatSpent(seconds)) : null
  const hint = running ? `Stopwatch running: ${label}` : label ? `Time spent: ${label}` : 'Log time spent'
  const ariaLabel = taskTitle ? `${hint} on ${taskTitle}` : hint
  const stateClass = `${hasValue ? 'has-value' : ''} ${running ? 'is-running' : ''} ${open ? 'is-open' : ''}`
  const toggle = (event: React.MouseEvent) => {
    event.stopPropagation()
    if (open) commit()
    else openPicker()
  }
  // Nothing in the popover may reach the row or chip it belongs to: those open the task,
  // start a rename, or begin a drag. Keys are swallowed too, so Escape is handled right here
  // (it cancels) instead of in the document listener the swallowing would starve.
  const swallow = (event: React.SyntheticEvent) => event.stopPropagation()
  const onPopoverKeyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    }
  }

  const onFieldKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
    }
  }

  const liveDot = running && <span className="run-dot" aria-hidden="true" />

  return (
    <div className={`picker-field time-spent-field is-${variant} ${stateClass}`} ref={fieldRef}>
      {variant === 'icon' && (
        <button type="button" className={`task-time-button ${stateClass}`} aria-label={ariaLabel} title={hint} onClick={toggle}>
          {running ? <span className="run-dot is-large" aria-hidden="true" /> : <Timer size={15} />}
        </button>
      )}
      {variant === 'meta' && (
        <button type="button" className={`time-spent-label ${stateClass}`} aria-label={ariaLabel} title={running ? 'Stopwatch running — click to adjust' : 'Time spent — click to change'} onClick={toggle}>
          {liveDot || <Timer size={12} />}{label ?? 'Time'}
        </button>
      )}
      {variant === 'chip' && (
        <button type="button" className={`cal-chip-time ${stateClass}`} aria-label={ariaLabel} title={hint} onClick={toggle} onDoubleClick={swallow}>
          {liveDot || <Timer size={10} strokeWidth={2.5} />}{label}
        </button>
      )}
      {variant === 'field' && (
        <>
          <button type="button" className={`picker-trigger ${stateClass}`} onClick={toggle}>
            {liveDot}{label ?? 'Add time'}
          </button>
          {hasValue && (
            <button type="button" className="picker-clear" aria-label="Clear time spent" onClick={clear}>
              <X size={12} />
            </button>
          )}
        </>
      )}
      {variant === 'archive' && (
        <button type="button" className={`archive-action ${stateClass}`} aria-label={ariaLabel} title={hint} onClick={toggle}>
          {liveDot || <Timer size={15} />}{label ?? 'Time spent'}
        </button>
      )}
      {variant === 'button' && (
        <button type="button" className={`secondary-button ${stateClass}`} aria-label={ariaLabel} title={hint} onClick={toggle}>
          {buttonLabel ?? 'Adjust time'}
        </button>
      )}
      {open && createPortal(
        <div
          className="date-popover time-popover"
          ref={popoverRef}
          role="dialog"
          aria-label="Time spent"
          style={coords}
          onClick={swallow}
          onMouseDown={swallow}
          onDoubleClick={swallow}
          onKeyDown={onPopoverKeyDown}
        >
          <div className="time-popover-head">
            <span>Time spent</span>
            {label && <small>{running && <span className="run-dot" aria-hidden="true" />}{label}</small>}
          </div>
          <div className="time-fields">
            <label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_HOURS}
                value={hours}
                autoFocus
                aria-label="Hours"
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setHours(clampInt(event.target.value, MAX_HOURS))}
                onKeyDown={onFieldKeyDown}
              />
              <span>h</span>
            </label>
            <label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={59}
                value={minutes}
                aria-label="Minutes"
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setMinutes(clampInt(event.target.value, 59))}
                onKeyDown={onFieldKeyDown}
              />
              <span>m</span>
            </label>
          </div>
          <div className="date-shortcuts time-presets">
            {PRESETS.map((preset) => <button type="button" key={preset.label} onClick={() => addMinutes(preset.minutes)}>{preset.label}</button>)}
          </div>
          {day && day < todayKey() && <p className="time-day-note">Changes count toward {formatDayKey(day)}</p>}
          <div className="date-popover-foot">
            {(hasValue || draftTotal > 0) && <button type="button" className="time-clear" onClick={clear}>Clear</button>}
            {onStopwatch && (
              <button type="button" className="time-stopwatch" onClick={() => { commit(); onStopwatch() }}>
                <Play size={12} strokeWidth={2.5} />{running ? 'Open stopwatch' : 'Start stopwatch'}
              </button>
            )}
            <button type="button" className="time-done" onClick={commit}>Done</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
