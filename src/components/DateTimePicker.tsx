import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { dateKey, formatDue, sameDay } from '../format'

interface DateTimePickerProps {
  value: string | null
  placeholder: string
  onChange: (iso: string | null) => void
  iconTrigger?: boolean
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const monthYear = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function shiftMonth(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

// Anchors the popover under its field (or above it when there is no room), closes it on an
// outside press or Escape, and keeps it attached while anything else scrolls.
function usePopover(open: boolean, setOpen: (open: boolean) => void, viewMonth: Date) {
  const fieldRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState({ top: 0, left: 0 })

  const reposition = () => {
    const field = fieldRef.current
    const popover = popoverRef.current
    if (!field || !popover) return
    const rect = field.getBoundingClientRect()
    const left = Math.max(12, Math.min(rect.right - popover.offsetWidth, window.innerWidth - popover.offsetWidth - 12))
    let top = rect.bottom + 8
    if (top + popover.offsetHeight > window.innerHeight - 12) top = Math.max(12, rect.top - popover.offsetHeight - 8)
    setCoords({ top, left })
  }

  useLayoutEffect(() => {
    if (open) reposition()
  }, [open, viewMonth])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (popoverRef.current?.contains(target) || fieldRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && popoverRef.current?.contains(event.target)) return
      reposition()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  return { fieldRef, popoverRef, coords }
}

function MonthGrid({ viewMonth, onViewMonth, isSelected, onPick }: { viewMonth: Date; onViewMonth: (month: Date) => void; isSelected: (day: Date) => boolean; onPick: (day: Date) => void }) {
  const firstWeekday = (viewMonth.getDay() + 6) % 7
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate()
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7
  const cells = Array.from({ length: cellCount }, (_, index) => new Date(viewMonth.getFullYear(), viewMonth.getMonth(), index - firstWeekday + 1))
  const today = new Date()

  return (
    <>
      <div className="date-popover-head">
        <span>{monthYear.format(viewMonth)}</span>
        <div>
          <button type="button" aria-label="Previous month" onClick={() => onViewMonth(shiftMonth(viewMonth, -1))}><ChevronLeft size={15} /></button>
          <button type="button" aria-label="Next month" onClick={() => onViewMonth(shiftMonth(viewMonth, 1))}><ChevronRight size={15} /></button>
        </div>
      </div>
      <div className="date-grid">
        {WEEKDAYS.map((label) => <span key={label} className="date-weekday">{label}</span>)}
        {cells.map((day) => (
          <button
            type="button"
            key={day.toISOString()}
            className={`date-cell ${day.getMonth() !== viewMonth.getMonth() ? 'is-outside' : ''} ${sameDay(day, today) ? 'is-today' : ''} ${isSelected(day) ? 'is-selected' : ''}`}
            onClick={() => onPick(day)}
          >
            {day.getDate()}
          </button>
        ))}
      </div>
    </>
  )
}

export function FocusDayPicker({ dates, onChange }: { dates: string[]; onChange: (dates: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => monthStart(new Date()))
  const { fieldRef, popoverRef, coords } = usePopover(open, setOpen, viewMonth)

  const openPicker = () => {
    setViewMonth(monthStart(new Date()))
    setOpen(true)
  }

  const toggleDay = (day: Date) => {
    const key = dateKey(day)
    onChange(dates.includes(key) ? dates.filter((item) => item !== key) : [...dates, key].sort())
  }

  return (
    <div className="picker-field" ref={fieldRef}>
      <button type="button" className={`picker-trigger ${open ? 'is-open' : ''}`} onClick={() => (open ? setOpen(false) : openPicker())}>
        Add a day
      </button>
      {open && createPortal(
        <div className="date-popover" ref={popoverRef} role="dialog" aria-label="Choose focus days" style={coords}>
          <MonthGrid viewMonth={viewMonth} onViewMonth={setViewMonth} isSelected={(day) => dates.includes(dateKey(day))} onPick={toggleDay} />
          <div className="date-popover-foot">
            <div className="date-shortcuts">
              <button type="button" onClick={() => toggleDay(new Date())}>Today</button>
              <button type="button" onClick={() => { const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); toggleDay(tomorrow) }}>Tomorrow</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

export function DateTimePicker({ value, placeholder, onChange, iconTrigger }: DateTimePickerProps) {
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => monthStart(new Date()))
  const { fieldRef, popoverRef, coords } = usePopover(open, setOpen, viewMonth)
  const selected = value ? new Date(value) : null

  const openPicker = () => {
    setViewMonth(monthStart(selected ?? new Date()))
    setOpen(true)
  }

  const clear = () => {
    onChange(null)
    setOpen(false)
  }

  const commitDay = (day: Date) => {
    const next = new Date(day)
    if (selected) next.setHours(selected.getHours(), selected.getMinutes(), 0, 0)
    else next.setHours(8, 0, 0, 0)
    onChange(next.toISOString())
  }

  const commitTime = (input: string) => {
    if (!input) return
    const [hours, minutes] = input.split(':').map(Number)
    const next = selected ? new Date(selected) : new Date()
    next.setHours(hours, minutes, 0, 0)
    onChange(next.toISOString())
  }

  const timeValue = selected
    ? `${String(selected.getHours()).padStart(2, '0')}:${String(selected.getMinutes()).padStart(2, '0')}`
    : '08:00'

  return (
    <div className={`picker-field ${iconTrigger ? 'is-icon-field' : ''}`} ref={fieldRef}>
      {iconTrigger ? (
        <button
          type="button"
          className={`task-date-button ${value ? 'has-value' : ''} ${open ? 'is-open' : ''}`}
          aria-label={value ? `Due ${formatDue(value)} — change date` : placeholder}
          title={value ? formatDue(value) : placeholder}
          onClick={(event) => { event.stopPropagation(); open ? setOpen(false) : openPicker() }}
        >
          <CalendarDays size={15} />
        </button>
      ) : (
        <button type="button" className={`picker-trigger ${value ? 'has-value' : ''} ${open ? 'is-open' : ''}`} onClick={() => (open ? setOpen(false) : openPicker())}>
          {value ? formatDue(value) : placeholder}
        </button>
      )}
      {value && !iconTrigger && (
        <button type="button" className="picker-clear" aria-label="Clear date" onClick={clear}>
          <X size={12} />
        </button>
      )}
      {open && createPortal(
        <div className="date-popover" ref={popoverRef} role="dialog" aria-label="Choose date and time" style={coords}>
          <MonthGrid viewMonth={viewMonth} onViewMonth={setViewMonth} isSelected={(day) => Boolean(selected && sameDay(day, selected))} onPick={commitDay} />
          <div className="date-popover-foot">
            <div className="date-shortcuts">
              {iconTrigger && value && <button type="button" onClick={clear}>Clear</button>}
            </div>
            <label className="time-field">
              <input type="time" value={timeValue} onChange={(event) => commitTime(event.target.value)} aria-label="Time" />
            </label>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
