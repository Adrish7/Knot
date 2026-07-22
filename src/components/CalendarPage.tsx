import { ChevronLeft, ChevronRight, Flag, Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { dateKey, formatDue, isOverdue, todayKey } from '../format'
import type { Task, TaskList } from '../types'

interface CalendarPageProps {
  tasks: Task[]
  lists: TaskList[]
  onOpenTask: (taskId: string) => void
  onAddFocusDate: (taskId: string, day: string) => void
  onMoveFocusDate: (taskId: string, fromDay: string, toDay: string) => void
  onRemoveFocusDate: (taskId: string, day: string) => void
  onAddTaskOnDay: (day: string, title: string) => void
  onAddTask: (title: string) => void
}

type CalView = 'month' | 'week'

interface DragInfo {
  taskId: string
  fromDay: string | null // null when dragging from the tray or a deadline chip: drop adds a focus day
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_MAX_CHIPS = 3

function startOfWeek(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  return start
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function CalendarPage({ tasks, lists, onOpenTask, onAddFocusDate, onMoveFocusDate, onRemoveFocusDate, onAddTaskOnDay, onAddTask }: CalendarPageProps) {
  const [view, setView] = useState<CalView>('month')
  const [cursor, setCursor] = useState(() => new Date())
  const [drag, setDrag] = useState<DragInfo | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null) // day key, or 'tray'
  const [quickAddDay, setQuickAddDay] = useState<string | null>(null)
  const [quickTitle, setQuickTitle] = useState('')
  const [trayTitle, setTrayTitle] = useState('')

  const today = todayKey()
  const listById = useMemo(() => new Map(lists.map((list) => [list.id, list])), [lists])

  const days = useMemo(() => {
    if (view === 'week') {
      const start = startOfWeek(cursor)
      return Array.from({ length: 7 }, (_, index) => addDays(start, index))
    }
    const start = startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1))
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    const span = Math.round((last.getTime() - start.getTime()) / 86_400_000) + 1
    return Array.from({ length: Math.ceil(span / 7) * 7 }, (_, index) => addDays(start, index))
  }, [view, cursor])

  const byDay = useMemo(() => {
    const map = new Map<string, { focus: Task[]; due: Task[] }>()
    const entry = (key: string) => {
      let value = map.get(key)
      if (!value) {
        value = { focus: [], due: [] }
        map.set(key, value)
      }
      return value
    }
    for (const task of tasks) {
      for (const key of task.focusDates) entry(key).focus.push(task)
      if (task.dueAt && !task.completed) {
        const key = dateKey(new Date(task.dueAt))
        if (!task.focusDates.includes(key)) entry(key).due.push(task)
      }
    }
    return map
  }, [tasks])

  const unplanned = useMemo(() => tasks
    .filter((task) => !task.completed && task.focusDates.length === 0)
    .sort((a, b) => {
      if (!a.dueAt && !b.dueAt) return a.sortOrder - b.sortOrder
      if (!a.dueAt) return 1
      if (!b.dueAt) return -1
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
    }), [tasks])

  const dragTask = drag ? tasks.find((task) => task.id === drag.taskId) : null
  const dragDueDay = dragTask?.dueAt ? dateKey(new Date(dragTask.dueAt)) : null

  const label = view === 'month'
    ? new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(cursor)
    : weekLabel(days[0], days[6])

  const shift = (direction: number) => setCursor((current) => view === 'month'
    ? new Date(current.getFullYear(), current.getMonth() + direction, 1)
    : addDays(current, direction * 7))

  const startDrag = (event: React.DragEvent, taskId: string, fromDay: string | null) => {
    event.dataTransfer.effectAllowed = 'copyMove'
    event.dataTransfer.setData('text/plain', taskId)
    setDrag({ taskId, fromDay })
  }

  const endDrag = () => {
    setDrag(null)
    setDragOver(null)
  }

  const dropOnDay = (event: React.DragEvent, day: string) => {
    event.preventDefault()
    if (!drag) return
    if (drag.fromDay === day) return endDrag()
    if (drag.fromDay && !event.altKey) onMoveFocusDate(drag.taskId, drag.fromDay, day)
    else onAddFocusDate(drag.taskId, day)
    endDrag()
  }

  const submitQuickAdd = () => {
    const title = quickTitle.trim()
    if (title && quickAddDay) onAddTaskOnDay(quickAddDay, title)
    setQuickTitle('')
    setQuickAddDay(null)
  }

  const renderChip = (task: Task, day: string, kind: 'focus' | 'due') => {
    const list = listById.get(task.listId)
    const dueHere = task.dueAt ? dateKey(new Date(task.dueAt)) === day : false
    const dragging = drag?.taskId === task.id && drag.fromDay === (kind === 'focus' ? day : null)
    return (
      <div
        key={`${task.id}:${kind}`}
        className={`cal-chip ${kind === 'due' ? 'is-due' : ''} ${task.completed ? 'is-done' : ''} ${dragging ? 'is-dragging' : ''}`}
        style={{ '--chip-color': list?.color ?? 'var(--sage)' } as React.CSSProperties}
        role="button"
        tabIndex={0}
        draggable={!task.completed}
        onDragStart={(event) => startDrag(event, task.id, kind === 'focus' ? day : null)}
        onDragEnd={endDrag}
        onClick={() => onOpenTask(task.id)}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenTask(task.id) } }}
        title={kind === 'due' ? `${task.title} — due, drag to plan a focus day` : task.title}
      >
        {dueHere ? <Flag size={9} strokeWidth={2.5} /> : <span className="cal-chip-dot" />}
        <span className="cal-chip-title">{task.title}</span>
        {kind === 'focus' && (
          <button
            className="cal-chip-remove"
            onClick={(event) => { event.stopPropagation(); onRemoveFocusDate(task.id, day) }}
            aria-label={`Remove this focus day from ${task.title}`}
            title="Remove from this day"
          ><X size={10} strokeWidth={2.5} /></button>
        )}
      </div>
    )
  }

  return (
    <main className="content-area calendar-area">
      <div className="cal-main">
        <div className="cal-toolbar">
          <strong className="cal-label">{label}</strong>
          <div className="cal-nav">
            <button className="icon-button small" onClick={() => shift(-1)} aria-label={`Previous ${view}`}><ChevronLeft size={15} /></button>
            <button className="cal-today-button" onClick={() => setCursor(new Date())}>Today</button>
            <button className="icon-button small" onClick={() => shift(1)} aria-label={`Next ${view}`}><ChevronRight size={15} /></button>
          </div>
          <div className="cal-switch" role="tablist" aria-label="Calendar view">
            <button role="tab" aria-selected={view === 'month'} className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Month</button>
            <button role="tab" aria-selected={view === 'week'} className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>Week</button>
          </div>
        </div>

        <div className="cal-weekday-row">
          {WEEKDAYS.map((name) => <span key={name}>{name}</span>)}
        </div>

        <div className={`cal-grid ${view === 'week' ? 'is-week' : ''}`}>
          {days.map((date) => {
            const key = dateKey(date)
            const cell = byDay.get(key)
            const chips = [
              ...(cell?.focus ?? []).map((task) => ({ task, kind: 'focus' as const })),
              ...(cell?.due ?? []).map((task) => ({ task, kind: 'due' as const })),
            ]
            const maxChips = view === 'month' ? MONTH_MAX_CHIPS : chips.length
            const outside = view === 'month' && date.getMonth() !== cursor.getMonth()
            return (
              <div
                key={key}
                className={`cal-cell ${outside ? 'is-outside' : ''} ${key === today ? 'is-today' : ''} ${dragOver === key ? 'is-drag-over' : ''} ${drag && dragDueDay === key ? 'is-due-day' : ''}`}
                onDragOver={(event) => {
                  if (!drag) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = drag.fromDay && !event.altKey ? 'move' : 'copy'
                  setDragOver(key)
                }}
                onDragLeave={() => setDragOver((current) => current === key ? null : current)}
                onDrop={(event) => dropOnDay(event, key)}
              >
                <div className="cal-cell-head">
                  <span className="cal-daynum">{date.getDate()}</span>
                  {drag && dragDueDay === key && <Flag size={10} className="cal-due-flag" />}
                  <button className="cal-add" onClick={() => { setQuickAddDay(key); setQuickTitle('') }} aria-label={`New task on ${key}`}><Plus size={13} /></button>
                </div>
                <div className="cal-chip-stack">
                  {chips.slice(0, maxChips).map(({ task, kind }) => renderChip(task, key, kind))}
                  {chips.length > maxChips && (
                    <button className="cal-more" onClick={() => { setCursor(date); setView('week') }}>+{chips.length - maxChips} more</button>
                  )}
                  {quickAddDay === key && (
                    <input
                      className="cal-quick"
                      value={quickTitle}
                      placeholder="New task"
                      maxLength={500}
                      autoFocus
                      aria-label={`New task on ${key}`}
                      onChange={(event) => setQuickTitle(event.target.value)}
                      onBlur={() => { setQuickAddDay(null); setQuickTitle('') }}
                      onKeyDown={(event) => {
                        event.stopPropagation()
                        if (event.key === 'Enter') submitQuickAdd()
                        if (event.key === 'Escape') { setQuickAddDay(null); setQuickTitle('') }
                      }}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <aside
        className={`cal-tray ${dragOver === 'tray' ? 'is-drag-over' : ''}`}
        aria-label="Unplanned tasks"
        onDragOver={(event) => {
          if (!drag?.fromDay) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          setDragOver('tray')
        }}
        onDragLeave={() => setDragOver((current) => current === 'tray' ? null : current)}
        onDrop={(event) => {
          event.preventDefault()
          if (drag?.fromDay) onRemoveFocusDate(drag.taskId, drag.fromDay)
          endDrag()
        }}
      >
        <div className="cal-tray-head"><span>Unplanned</span><small>{unplanned.length || ''}</small></div>
        <form className="cal-tray-add" onSubmit={(event) => {
          event.preventDefault()
          const title = trayTitle.trim()
          if (!title) return
          onAddTask(title)
          setTrayTitle('')
        }}>
          <Plus size={14} />
          <input value={trayTitle} onChange={(event) => setTrayTitle(event.target.value)} placeholder="Add a task" maxLength={500} aria-label="Add an unplanned task" />
        </form>
        <div className="cal-tray-list">
          {unplanned.map((task) => {
            const list = listById.get(task.listId)
            return (
              <div
                key={task.id}
                className={`cal-tray-item ${drag?.taskId === task.id ? 'is-dragging' : ''}`}
                role="button"
                tabIndex={0}
                draggable
                onDragStart={(event) => startDrag(event, task.id, null)}
                onDragEnd={endDrag}
                onClick={() => onOpenTask(task.id)}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenTask(task.id) } }}
              >
                <span className="cal-chip-dot" style={{ '--chip-color': list?.color ?? 'var(--sage)' } as React.CSSProperties} />
                <div className="cal-tray-item-body">
                  <span className="cal-tray-title">{task.title}</span>
                  {task.dueAt && <span className={`cal-tray-due ${isOverdue(task) ? 'overdue' : ''}`}>Due {formatDue(task.dueAt)}</span>}
                </div>
              </div>
            )
          })}
          {unplanned.length === 0 && <div className="cal-tray-empty">Every task has a focus day.</div>}
        </div>
        <p className="cal-tray-hint">Drag tasks onto a day. ⌥-drag a chip to add another day. Drop a chip here to unplan it.</p>
      </aside>
    </main>
  )
}

function weekLabel(start: Date, end: Date) {
  const monthDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
  const dayOnly = new Intl.DateTimeFormat(undefined, { day: 'numeric' })
  const range = start.getMonth() === end.getMonth() ? `${monthDay.format(start)} – ${dayOnly.format(end)}` : `${monthDay.format(start)} – ${monthDay.format(end)}`
  return `${range}, ${end.getFullYear()}`
}
