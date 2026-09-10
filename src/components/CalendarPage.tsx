import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Flag, Plus, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { sortFocusDay } from '../data'
import { dateKey, formatDayKey, formatDue, isOverdue, isToday, todayKey } from '../format'
import type { FocusStatus, Task, TaskList } from '../types'

interface CalendarPageProps {
  tasks: Task[]
  lists: TaskList[]
  onOpenTask: (taskId: string) => void
  onAddFocusDate: (taskId: string, day: string, beforeTaskId: string | null) => void
  onMoveFocusDate: (taskId: string, fromDay: string, toDay: string, beforeTaskId: string | null) => void
  onRemoveFocusDate: (taskId: string, day: string) => void
  onSetFocusStatus: (taskId: string, day: string, status: FocusStatus | null) => void
  onAddTaskOnDay: (day: string, title: string) => void
  onAddTask: (title: string, listId?: string) => void
}

type CalView = 'month' | 'week' | 'day' | 'year'

interface DragInfo {
  taskId: string
  fromDay: string | null // null when dragging from the tray or a deadline chip: drop adds a focus day
}

interface DropHint {
  target: string // day key, or 'tray'
  beforeTaskId: string | null // the planned task the drop lands above; null means the end of the day
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const YEAR_MONTHS_BACK = 12
const YEAR_MONTHS_FORWARD = 24

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

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthGridDays(monthDate: Date) {
  const start = startOfWeek(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1))
  const last = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
  const span = Math.round((last.getTime() - start.getTime()) / 86_400_000) + 1
  return Array.from({ length: Math.ceil(span / 7) * 7 }, (_, index) => addDays(start, index))
}

export function CalendarPage({ tasks, lists, onOpenTask, onAddFocusDate, onMoveFocusDate, onRemoveFocusDate, onSetFocusStatus, onAddTaskOnDay, onAddTask }: CalendarPageProps) {
  const [view, setView] = useState<CalView>('month')
  const [cursor, setCursor] = useState(() => new Date())
  const [drag, setDrag] = useState<DragInfo | null>(null)
  const [dropHint, setDropHint] = useState<DropHint | null>(null)
  const [quickAddDay, setQuickAddDay] = useState<string | null>(null)
  const [quickTitle, setQuickTitle] = useState('')
  const [trayTitle, setTrayTitle] = useState('')
  const [trayList, setTrayList] = useState('all')
  const yearRef = useRef<HTMLDivElement>(null)

  const today = todayKey()
  const listById = useMemo(() => new Map(lists.map((list) => [list.id, list])), [lists])

  const days = useMemo(() => {
    if (view === 'day') return [new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())]
    if (view === 'week') {
      const start = startOfWeek(cursor)
      return Array.from({ length: 7 }, (_, index) => addDays(start, index))
    }
    return monthGridDays(cursor)
  }, [view, cursor])

  const yearMonths = useMemo(() => {
    const base = new Date()
    return Array.from(
      { length: YEAR_MONTHS_BACK + YEAR_MONTHS_FORWARD + 1 },
      (_, index) => new Date(base.getFullYear(), base.getMonth() - YEAR_MONTHS_BACK + index, 1),
    )
  }, [])

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
    for (const [key, value] of map) value.focus = sortFocusDay(value.focus, key)
    return map
  }, [tasks])

  const trayTasks = useMemo(() => tasks
    .filter((task) => task.listId !== null && !task.completed && (
      trayList === 'all'
      || (trayList === 'today'
        ? isToday(task.dueAt) || task.focusDates.includes(today)
        : task.listId === trayList)
    ))
    .sort((a, b) => {
      if (!a.dueAt && !b.dueAt) return a.sortOrder - b.sortOrder
      if (!a.dueAt) return 1
      if (!b.dueAt) return -1
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
    }), [tasks, trayList, today])

  const dragTask = drag ? tasks.find((task) => task.id === drag.taskId) : null
  const dragDueDay = dragTask?.dueAt ? dateKey(new Date(dragTask.dueAt)) : null
  const dragListColor = dragTask?.listId ? listById.get(dragTask.listId)?.color : undefined
  const trayListColor = trayList === 'all' || trayList === 'today' ? undefined : listById.get(trayList)?.color

  const label = view === 'month' || view === 'year'
    ? new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(cursor)
    : view === 'week'
    ? weekLabel(days[0], days[6])
    : new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(cursor)

  const scrollToMonth = (date: Date, smooth = true) => {
    const container = yearRef.current
    const block = container?.querySelector<HTMLElement>(`[data-month="${monthKey(date)}"]`)
    if (container && block) container.scrollTo({ top: block.offsetTop, behavior: smooth ? 'smooth' : 'auto' })
  }

  useLayoutEffect(() => {
    if (view === 'year') scrollToMonth(cursor, false)
    // Runs on view change only: while in year view, scrolling itself moves the cursor.
  }, [view])

  const onYearScroll = () => {
    const container = yearRef.current
    if (!container) return
    const anchor = container.scrollTop + 70
    let current: HTMLElement | null = null
    for (const block of container.querySelectorAll<HTMLElement>('.cal-year-month')) {
      if (block.offsetTop <= anchor) current = block
      else break
    }
    const key = current?.dataset.month
    if (!key) return
    const [year, month] = key.split('-').map(Number)
    setCursor((prev) => prev.getFullYear() === year && prev.getMonth() === month - 1 ? prev : new Date(year, month - 1, 1))
  }

  const shift = (direction: number) => {
    if (view === 'year') {
      scrollToMonth(new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1))
      return
    }
    setCursor((current) => view === 'month'
      ? new Date(current.getFullYear(), current.getMonth() + direction, 1)
      : addDays(current, direction * (view === 'week' ? 7 : 1)))
  }

  const goToday = () => {
    setCursor(new Date())
    if (view === 'year') scrollToMonth(new Date())
  }

  const openDay = (date: Date) => {
    setCursor(date)
    setView('day')
  }

  const startDrag = (event: React.DragEvent, taskId: string, fromDay: string | null) => {
    event.dataTransfer.effectAllowed = 'copyMove'
    event.dataTransfer.setData('text/plain', taskId)
    setDrag({ taskId, fromDay })
  }

  const endDrag = () => {
    setDrag(null)
    setDropHint(null)
  }

  // The planned chip the cursor would insert above: the first one (skipping the dragged task)
  // whose vertical midpoint is below the cursor. Null means "after the last one".
  const findBeforeTask = (cell: HTMLElement, clientY: number, taskId: string) => {
    for (const chip of cell.querySelectorAll<HTMLElement>('.cal-chip[data-focus-task]')) {
      const id = chip.dataset.focusTask
      if (!id || id === taskId) continue
      const bounds = chip.getBoundingClientRect()
      if (clientY < bounds.top + bounds.height / 2) return id
    }
    return null
  }

  const dragOverDay = (event: React.DragEvent, day: string) => {
    if (!drag) return
    event.preventDefault()
    event.dataTransfer.dropEffect = drag.fromDay && !event.altKey ? 'move' : 'copy'
    const beforeTaskId = findBeforeTask(event.currentTarget as HTMLElement, event.clientY, drag.taskId)
    setDropHint((current) => current?.target === day && current.beforeTaskId === beforeTaskId ? current : { target: day, beforeTaskId })
  }

  const dragLeaveDay = (event: React.DragEvent, day: string) => {
    const nextTarget = event.relatedTarget
    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
      setDropHint((current) => current?.target === day ? null : current)
    }
  }

  const dropOnDay = (event: React.DragEvent, day: string) => {
    event.preventDefault()
    if (!drag) return
    const beforeTaskId = findBeforeTask(event.currentTarget as HTMLElement, event.clientY, drag.taskId)
    if (drag.fromDay && (drag.fromDay === day || !event.altKey)) onMoveFocusDate(drag.taskId, drag.fromDay, day, beforeTaskId)
    else onAddFocusDate(drag.taskId, day, beforeTaskId)
    endDrag()
  }

  const submitQuickAdd = () => {
    const title = quickTitle.trim()
    if (title && quickAddDay) onAddTaskOnDay(quickAddDay, title)
    setQuickTitle('')
    setQuickAddDay(null)
  }

  const renderChip = (task: Task, day: string, kind: 'focus' | 'due', dropEdge: 'before' | 'after' | null) => {
    const list = task.listId ? listById.get(task.listId) : undefined
    const dueHere = task.dueAt ? dateKey(new Date(task.dueAt)) === day : false
    const dragging = drag?.taskId === task.id && drag.fromDay === (kind === 'focus' ? day : null)
    const status = kind === 'focus' ? task.focusStatus[day] : undefined
    const nextStatus: FocusStatus | null = status === 'done' ? 'missed' : status === 'missed' ? null : 'done'
    const statusHint = status === 'done' ? 'Done this day — click to mark not done' : status === 'missed' ? 'Not done — click to clear' : 'Mark done for this day'
    return (
      <div
        key={`${task.id}:${kind}`}
        className={`cal-chip ${kind === 'due' ? 'is-due' : ''} ${task.completed ? 'is-done' : ''} ${status === 'done' ? 'is-day-done' : ''} ${status === 'missed' ? 'is-day-missed' : ''} ${dragging ? 'is-dragging' : ''} ${dropEdge ? `drop-${dropEdge}` : ''}`}
        style={{ '--chip-color': list?.color ?? 'var(--accent)' } as React.CSSProperties}
        data-focus-task={kind === 'focus' ? task.id : undefined}
        role="button"
        tabIndex={0}
        draggable={!task.completed}
        onDragStart={(event) => startDrag(event, task.id, kind === 'focus' ? day : null)}
        onDragEnd={endDrag}
        onClick={() => onOpenTask(task.id)}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenTask(task.id) } }}
        title={kind === 'due' ? `${task.title} — due, drag to plan a focus day` : task.title}
      >
        {kind === 'focus' && !task.completed ? (
          <button
            className="cal-chip-state"
            onClick={(event) => { event.stopPropagation(); onSetFocusStatus(task.id, day, nextStatus) }}
            aria-label={`${task.title}: ${statusHint}`}
            title={statusHint}
          >
            {status === 'done' ? <Check size={10} strokeWidth={3} />
              : status === 'missed' ? <X size={10} strokeWidth={3} />
              : dueHere ? <Flag size={9} strokeWidth={2.5} />
              : <span className="cal-chip-dot" />}
          </button>
        ) : dueHere ? <Flag size={9} strokeWidth={2.5} /> : <span className="cal-chip-dot" />}
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

  const renderDayCell = (date: Date, options: { outside?: boolean; blank?: boolean; dayView?: boolean }) => {
    const key = dateKey(date)
    if (options.blank) return <div key={`blank-${key}`} className="cal-cell is-blank" />
    const cell = byDay.get(key)
    const focus = cell?.focus ?? []
    const chips = [
      ...focus.map((task) => ({ task, kind: 'focus' as const })),
      ...(cell?.due ?? []).map((task) => ({ task, kind: 'due' as const })),
    ]
    const hint = dropHint?.target === key ? dropHint : null
    const reordering = Boolean(hint && drag?.fromDay === key)
    // Which edge of a planned chip the guide line sits on: above the chip the drop lands before,
    // or below the last chip (other than the dragged one) when it lands at the end.
    const lastOther = hint && hint.beforeTaskId === null ? [...focus].reverse().find((task) => task.id !== drag?.taskId) : undefined
    const edgeFor = (task: Task, kind: 'focus' | 'due') => {
      if (!hint || kind !== 'focus') return null
      if (hint.beforeTaskId === task.id) return 'before' as const
      if (lastOther?.id === task.id) return 'after' as const
      return null
    }
    return (
      <div
        key={key}
        className={`cal-cell ${options.outside ? 'is-outside' : ''} ${key === today ? 'is-today' : ''} ${hint && !reordering ? 'is-drag-over' : ''} ${drag && dragDueDay === key ? 'is-due-day' : ''}`}
        onDragOver={(event) => dragOverDay(event, key)}
        onDragLeave={(event) => dragLeaveDay(event, key)}
        onDrop={(event) => dropOnDay(event, key)}
      >
        <div className="cal-cell-head">
          {options.dayView
            ? <span className="cal-daynum">{date.getDate()}</span>
            : <button className="cal-daynum is-clickable" onClick={() => openDay(date)} title="Open day view">{date.getDate()}</button>}
          {drag && dragDueDay === key && <Flag size={10} className="cal-due-flag" />}
          <button className="cal-add" onClick={() => { setQuickAddDay(key); setQuickTitle('') }} aria-label={`New task on ${key}`}><Plus size={13} /></button>
        </div>
        <div className="cal-chip-stack">
          {chips.map(({ task, kind }) => renderChip(task, key, kind, edgeFor(task, kind)))}
          {options.dayView && chips.length === 0 && quickAddDay !== key && (
            <div className="cal-day-empty">Nothing planned. Drag a task here, or press the plus to add one.</div>
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
  }

  return (
    <main className={`content-area calendar-area ${dragListColor ? 'is-accented' : ''}`} style={dragListColor ? { '--list-accent': dragListColor } as React.CSSProperties : undefined}>
      <div className="cal-main">
        <div className="cal-toolbar">
          <strong className="cal-label">{label}</strong>
          <div className="cal-nav">
            <button className="icon-button small" onClick={() => shift(-1)} aria-label={`Previous ${view === 'year' ? 'month' : view}`}><ChevronLeft size={15} /></button>
            <button className="cal-today-button" onClick={goToday}>Today</button>
            <button className="icon-button small" onClick={() => shift(1)} aria-label={`Next ${view === 'year' ? 'month' : view}`}><ChevronRight size={15} /></button>
          </div>
          <div className="cal-switch" role="tablist" aria-label="Calendar view">
            <button role="tab" aria-selected={view === 'month'} className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Month</button>
            <button role="tab" aria-selected={view === 'week'} className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>Week</button>
            <button role="tab" aria-selected={view === 'day'} className={view === 'day' ? 'active' : ''} onClick={() => setView('day')}>Day</button>
            <button role="tab" aria-selected={view === 'year'} className={view === 'year' ? 'active' : ''} onClick={() => setView('year')}>Year</button>
          </div>
        </div>

        {(view === 'month' || view === 'week') && (
          <div className="cal-weekday-row">
            {WEEKDAYS.map((name) => <span key={name}>{name}</span>)}
          </div>
        )}

        {view === 'year' ? (
          <div className="cal-year-scroll" ref={yearRef} onScroll={onYearScroll}>
            {yearMonths.map((monthDate) => (
              <section key={monthKey(monthDate)} data-month={monthKey(monthDate)} className="cal-year-month">
                <h3>{new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(monthDate)}</h3>
                <div className="cal-weekday-row">
                  {WEEKDAYS.map((name) => <span key={name}>{name}</span>)}
                </div>
                <div className="cal-grid is-month-block">
                  {monthGridDays(monthDate).map((date) => renderDayCell(date, {
                    blank: date.getMonth() !== monthDate.getMonth(),
                  }))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className={`cal-grid ${view === 'week' ? 'is-week' : ''} ${view === 'day' ? 'is-day' : ''}`}>
            {days.map((date) => renderDayCell(date, {
              outside: view === 'month' && date.getMonth() !== cursor.getMonth(),
              dayView: view === 'day',
            }))}
          </div>
        )}
      </div>

      <aside
        className={`cal-tray ${dropHint?.target === 'tray' ? 'is-drag-over' : ''} ${trayListColor ? 'is-accented' : ''}`}
        style={trayListColor ? { '--list-accent': trayListColor } as React.CSSProperties : undefined}
        aria-label="Tasks"
        onDragOver={(event) => {
          if (!drag?.fromDay) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          setDropHint((current) => current?.target === 'tray' ? current : { target: 'tray', beforeTaskId: null })
        }}
        onDragLeave={() => setDropHint((current) => current?.target === 'tray' ? null : current)}
        onDrop={(event) => {
          event.preventDefault()
          if (drag?.fromDay) onRemoveFocusDate(drag.taskId, drag.fromDay)
          endDrag()
        }}
      >
        <div className="cal-tray-head">
          <TrayFilter value={trayList} lists={lists} onChange={setTrayList} />
          <small>{trayTasks.length || ''}</small>
        </div>
        <form className="cal-tray-add" onSubmit={(event) => {
          event.preventDefault()
          const title = trayTitle.trim()
          if (!title) return
          if (trayList === 'today') onAddTaskOnDay(today, title)
          else onAddTask(title, trayList === 'all' ? undefined : trayList)
          setTrayTitle('')
        }}>
          <Plus size={14} />
          <input value={trayTitle} onChange={(event) => setTrayTitle(event.target.value)} placeholder="Add a task" maxLength={500} aria-label="Add a task" />
        </form>
        <div className="cal-tray-list">
          {trayTasks.map((task) => {
            const list = task.listId ? listById.get(task.listId) : undefined
            const nextFocus = task.focusDates.find((day) => day >= today) ?? task.focusDates[task.focusDates.length - 1]
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
                <span className="cal-chip-dot" style={{ '--chip-color': list?.color ?? 'var(--accent)' } as React.CSSProperties} />
                <div className="cal-tray-item-body">
                  <span className="cal-tray-title">{task.title}</span>
                  {(task.dueAt || nextFocus) && (
                    <span className="cal-tray-meta">
                      {task.dueAt && <span className={`cal-tray-due ${isOverdue(task) ? 'overdue' : ''}`}>Due {formatDue(task.dueAt)}</span>}
                      {nextFocus && <span className="cal-tray-focus"><CalendarDays size={10} />{formatDayKey(nextFocus)}{task.focusDates.length > 1 && ` +${task.focusDates.length - 1}`}</span>}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
          {trayTasks.length === 0 && (
            <div className="cal-tray-empty">
              {trayList === 'all' ? 'No open tasks.' : trayList === 'today' ? 'No open tasks today.' : 'No open tasks in this list.'}
            </div>
          )}
        </div>
        <p className="cal-tray-hint">Drag tasks onto a day, or up and down within it to reorder. ⌥-drag a chip to add another day. Drop a chip here to unplan it.</p>
      </aside>
    </main>
  )
}

function TrayFilter({ value, lists, onChange }: { value: string; lists: TaskList[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (event.target instanceof Node && !wrapRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const currentName = value === 'all' ? 'All tasks' : value === 'today' ? 'Today' : lists.find((list) => list.id === value)?.name ?? 'All tasks'
  const pick = (next: string) => {
    onChange(next)
    setOpen(false)
  }

  return (
    <div className="cal-tray-filter" ref={wrapRef}>
      <button type="button" className={`cal-tray-filter-trigger ${open ? 'is-open' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span>{currentName}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="cal-filter-menu" role="menu" aria-label="Show tasks from">
          <button role="menuitemradio" aria-checked={value === 'all'} className={value === 'all' ? 'active' : ''} onClick={() => pick('all')}>
            <span className="cal-filter-dot is-all" />All tasks{value === 'all' && <Check size={13} />}
          </button>
          <button role="menuitemradio" aria-checked={value === 'today'} className={value === 'today' ? 'active' : ''} onClick={() => pick('today')}>
            <span className="cal-filter-dot is-all" />Today{value === 'today' && <Check size={13} />}
          </button>
          {lists.map((list) => (
            <button key={list.id} role="menuitemradio" aria-checked={value === list.id} className={value === list.id ? 'active' : ''} onClick={() => pick(list.id)}>
              <span className="cal-filter-dot" style={{ background: list.color }} />{list.name}{value === list.id && <Check size={13} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function weekLabel(start: Date, end: Date) {
  const monthDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
  const dayOnly = new Intl.DateTimeFormat(undefined, { day: 'numeric' })
  const range = start.getMonth() === end.getMonth() ? `${monthDay.format(start)} – ${dayOnly.format(end)}` : `${monthDay.format(start)} – ${monthDay.format(end)}`
  return `${range}, ${end.getFullYear()}`
}
