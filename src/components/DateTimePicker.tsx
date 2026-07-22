import { ChevronLeft, ChevronRight, Clock3, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { dateKey, formatDue } from '../format'

interface DateTimePickerProps {
  value: string | null
  placeholder: string
  onChange: (iso: string | null) => void
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function FocusDayPicker({ dates, onChange }: { dates: string[]; onChange: (dates: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => monthStart(new Date()))
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const fieldRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const field = fieldRef.current
    const popover = popoverRef.current
    if (!field || !popover) return
    const rect = field.getBoundingClientRect()
    const left = Math.max(12, Math.min(rect.right - popover.offsetWidth, window.innerWidth - popover.offsetWidth - 12))
    let top = rect.bottom + 8
    if (top + popover.offsetHeight > window.innerHeight - 12) top = Math.max(12, rect.top - popover.offsetHeight - 8)
    setCoords({ top, left })
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
      setOpen(false)
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

  const toggleDay = (day: Date) => {
    const key = dateKey(day)
    onChange(dates.includes(key) ? dates.filter((item) => item !== key) : [...dates, key].sort())
  }

  const firstWeekday = (viewMonth.getDay() + 6) % 7
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate()
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7
  const cells = Array.from({ length: cellCount }, (_, index) => new Date(viewMonth.getFullYear(), viewMonth.getMonth(), index - firstWeekday + 1))
  const today = new Date()
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(viewMonth)

  return (
    <div className="picker-field" ref={fieldRef}>
      <button type="button" className={`picker-trigger ${open ? 'is-open' : ''}`} onClick={() => { if (open) { setOpen(false); return } setViewMonth(monthStart(new Date())); setOpen(true) }}>
        Add a day
      </button>
      {open && (
        <div className="date-popover" ref={popoverRef} role="dialog" aria-label="Choose focus days" style={{ top: coords.top, left: coords.left }}>
          <div className="date-popover-head">
            <span>{monthLabel}</span>
            <div>
              <button type="button" aria-label="Previous month" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}><ChevronLeft size={15} /></button>
              <button type="button" aria-label="Next month" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}><ChevronRight size={15} /></button>
            </div>
          </div>
          <div className="date-grid">
            {WEEKDAYS.map((label) => <span key={label} className="date-weekday">{label}</span>)}
            {cells.map((day) => (
              <button
                type="button"
                key={day.toISOString()}
                className={`date-cell ${day.getMonth() !== viewMonth.getMonth() ? 'is-outside' : ''} ${sameDay(day, today) ? 'is-today' : ''} ${dates.includes(dateKey(day)) ? 'is-selected' : ''}`}
                onClick={() => toggleDay(day)}
              >
                {day.getDate()}
              </button>
            ))}
          </div>
          <div className="date-popover-foot">
            <div className="date-shortcuts">
              <button type="button" onClick={() => toggleDay(new Date())}>Today</button>
              <button type="button" onClick={() => { const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); toggleDay(tomorrow) }}>Tomorrow</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function DateTimePicker({ value, placeholder, onChange }: DateTimePickerProps) {
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => monthStart(new Date()))
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const fieldRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const selected = value ? new Date(value) : null

  const openPicker = () => {
    setViewMonth(monthStart(selected ?? new Date()))
    setOpen(true)
  }

  useLayoutEffect(() => {
    if (!open) return
    const field = fieldRef.current
    const popover = popoverRef.current
    if (!field || !popover) return
    const rect = field.getBoundingClientRect()
    const left = Math.max(12, Math.min(rect.right - popover.offsetWidth, window.innerWidth - popover.offsetWidth - 12))
    let top = rect.bottom + 8
    if (top + popover.offsetHeight > window.innerHeight - 12) top = Math.max(12, rect.top - popover.offsetHeight - 8)
    setCoords({ top, left })
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
      setOpen(false)
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

  const commitDay = (day: Date) => {
    const next = new Date(day)
    if (selected) next.setHours(selected.getHours(), selected.getMinutes(), 0, 0)
    else next.setHours(9, 0, 0, 0)
    onChange(next.toISOString())
  }

  const commitTime = (input: string) => {
    if (!input) return
    const [hours, minutes] = input.split(':').map(Number)
    const next = selected ? new Date(selected) : new Date()
    next.setHours(hours, minutes, 0, 0)
    onChange(next.toISOString())
  }

  const firstWeekday = (viewMonth.getDay() + 6) % 7
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate()
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7
  const cells = Array.from({ length: cellCount }, (_, index) => new Date(viewMonth.getFullYear(), viewMonth.getMonth(), index - firstWeekday + 1))
  const today = new Date()
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(viewMonth)
  const timeValue = selected
    ? `${String(selected.getHours()).padStart(2, '0')}:${String(selected.getMinutes()).padStart(2, '0')}`
    : '09:00'

  return (
    <div className="picker-field" ref={fieldRef}>
      <button type="button" className={`picker-trigger ${value ? 'has-value' : ''} ${open ? 'is-open' : ''}`} onClick={() => (open ? setOpen(false) : openPicker())}>
        {value ? formatDue(value) : placeholder}
      </button>
      {value && (
        <button type="button" className="picker-clear" aria-label="Clear date" onClick={() => { onChange(null); setOpen(false) }}>
          <X size={12} />
        </button>
      )}
      {open && (
        <div className="date-popover" ref={popoverRef} role="dialog" aria-label="Choose date and time" style={{ top: coords.top, left: coords.left }}>
          <div className="date-popover-head">
            <span>{monthLabel}</span>
            <div>
              <button type="button" aria-label="Previous month" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}><ChevronLeft size={15} /></button>
              <button type="button" aria-label="Next month" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}><ChevronRight size={15} /></button>
            </div>
          </div>
          <div className="date-grid">
            {WEEKDAYS.map((label) => <span key={label} className="date-weekday">{label}</span>)}
            {cells.map((day) => (
              <button
                type="button"
                key={day.toISOString()}
                className={`date-cell ${day.getMonth() !== viewMonth.getMonth() ? 'is-outside' : ''} ${sameDay(day, today) ? 'is-today' : ''} ${selected && sameDay(day, selected) ? 'is-selected' : ''}`}
                onClick={() => commitDay(day)}
              >
                {day.getDate()}
              </button>
            ))}
          </div>
          <div className="date-popover-foot">
            <div className="date-shortcuts">
              <button type="button" onClick={() => commitDay(new Date())}>Today</button>
              <button type="button" onClick={() => { const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); commitDay(tomorrow) }}>Tomorrow</button>
            </div>
            <label className="time-field">
              <Clock3 size={13} />
              <input type="time" value={timeValue} onChange={(event) => commitTime(event.target.value)} aria-label="Time" />
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
