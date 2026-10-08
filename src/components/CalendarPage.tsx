import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Flag, Plus, Timer, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { compareByDue, sortFocusDay } from '../data'
import { dateKey, dayKeyOf, formatDayKey, formatDue, isForToday, isOverdue, todayDate, todayKey } from '../format'
import { useTags } from './Tags'
import { TimeSpentPicker } from './TimeSpentPicker'
import { isBreakTask } from '../tags'
import { daySeconds, formatSpent, hasTime, isRunning, trackDays } from '../time'
import { useNow } from '../useNow'
import type { FocusStatus, Task, TaskList, TimeTrack } from '../types'

interface CalendarPageProps {
  tasks: Task[]
  lists: TaskList[]
  stopwatch: TimeTrack // the open stopwatch, so its time counts in day totals
  onOpenTask: (taskId: string) => void
  onRenameTask: (taskId: string, title: string) => void
  onSetTimeSpent: (taskId: string, seconds: number, day?: string) => void
  onStopwatch: (taskId: string) => void
  onPlaceTasks: (items: DragItem[], day: string, beforeTaskId: string | null) => void
  onCopyTasks: (taskIds: string[], day: string, beforeTaskId: string | null) => void
  onRemoveFocusDate: (taskId: string, day: string) => void
  onSetFocusStatus: (taskId: string, day: string, status: FocusStatus | null) => void
  onAddTaskOnDay: (day: string, title: string) => void
  onAddTask: (title: string, listId?: string, extras?: Partial<Task>) => void
}

type CalView = 'month' | 'week' | 'day' | 'year'

interface DragItem {
  taskId: string
  fromDay: string | null // null when dragging from the tray or a deadline chip: drop adds a focus day
}

interface DragInfo {
  items: DragItem[] // the chip grabbed, or every selected chip when it was one of them
}

interface DropHint {
  target: string // day key, or 'tray'
  beforeTaskId: string | null // the planned task the drop lands above; null means the end of the day
  copying: boolean // ⌥ held: the drop makes new copies, so the originals stay where they are
}

interface ChipRef {
  taskId: string
  day: string
  kind: 'focus' | 'due'
}

const chipSlot = (chip: ChipRef) => `${chip.day}:${chip.kind}:${chip.taskId}`

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const YEAR_MONTHS_BACK = 12
const YEAR_MONTHS_FORWARD = 24
const OPEN_DELAY_MS = 220
const monthYear = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const longDay = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
const monthDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const dayOnly = new Intl.DateTimeFormat(undefined, { day: 'numeric' })

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

export function CalendarPage({ tasks, lists, stopwatch, onOpenTask, onRenameTask, onSetTimeSpent, onStopwatch, onPlaceTasks, onCopyTasks, onRemoveFocusDate, onSetFocusStatus, onAddTaskOnDay, onAddTask }: CalendarPageProps) {
  const [view, setView] = useState<CalView>('month')
  const [cursor, setCursor] = useState(() => todayDate())
  const [drag, setDrag] = useState<DragInfo | null>(null)
  const [selection, setSelection] = useState<ChipRef[]>([]) // chips picked with Shift-click, dragged together
  const [dropHint, setDropHint] = useState<DropHint | null>(null)
  const [quickAddDay, setQuickAddDay] = useState<string | null>(null)
  const [quickTitle, setQuickTitle] = useState('')
  const [trayTitle, setTrayTitle] = useState('')
  const [trayList, setTrayList] = useState('all')
  const [renaming, setRenaming] = useState<string | null>(null) // the slot being renamed: `${day}:${kind}:${taskId}` or `tray:${taskId}`
  const [draftTitle, setDraftTitle] = useState('')
  const yearRef = useRef<HTMLDivElement>(null)
  const openTimer = useRef(0)

  useEffect(() => () => window.clearTimeout(openTimer.current), [])

  // A plain click anywhere but a chip, or Escape, lets go of the selection.
  useEffect(() => {
    if (selection.length === 0) return
    const onPointerDown = (event: MouseEvent) => {
      if (!event.shiftKey && !(event.target instanceof Element && event.target.closest('.cal-chip'))) setSelection([])
    }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelection([]) }
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [selection.length])

  const today = todayKey()
  const listById = useMemo(() => new Map(lists.map((list) => [list.id, list])), [lists])
  const { tags } = useTags()

  // Time spent per day, across every task and the open stopwatch. Refreshed once a minute
  // while a stopwatch runs, so today's figure keeps up.
  const anyRunning = isRunning(stopwatch) || tasks.some((task) => isRunning(task.time))
  // With nothing running every session is closed, so the time doesn't matter; a fixed value keeps
  // the memo from recounting on every render.
  const liveNow = useNow(anyRunning, 15_000)
  const minuteNow = anyRunning ? liveNow : 0
  const timeByDay = useMemo(() => {
    const days = new Set<string>()
    const collect = (track: TimeTrack) => { for (const day of trackDays(track, minuteNow)) days.add(day) }
    collect(stopwatch)
    for (const task of tasks) collect(task.time)
    // `total` is working time; time on break-tagged tasks is listed but kept out of it.
    const map = new Map<string, { total: number; breaks: number; open: number; entries: { task: Task; seconds: number; isBreak: boolean }[] }>()
    for (const day of days) {
      const entries = tasks
        .map((task) => ({ task, seconds: daySeconds(task.time, day, minuteNow), isBreak: isBreakTask(task, tags) }))
        .filter((entry) => entry.seconds >= 1)
        .sort((a, b) => Number(a.isBreak) - Number(b.isBreak) || b.seconds - a.seconds)
      const open = daySeconds(stopwatch, day, minuteNow)
      const total = entries.reduce((sum, entry) => entry.isBreak ? sum : sum + entry.seconds, 0) + open
      const breaks = entries.reduce((sum, entry) => entry.isBreak ? sum + entry.seconds : sum, 0)
      if (total + breaks >= 1) map.set(day, { total, breaks, open, entries })
    }
    return map
  }, [tasks, stopwatch, tags, minuteNow])

  const days = useMemo(() => {
    if (view === 'day') return [new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())]
    if (view === 'week') {
      const start = startOfWeek(cursor)
      return Array.from({ length: 7 }, (_, index) => addDays(start, index))
    }
    return monthGridDays(cursor)
  }, [view, cursor])

  const yearMonths = useMemo(() => {
    const base = todayDate()
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
        const key = dayKeyOf(new Date(task.dueAt))
        if (!task.focusDates.includes(key)) entry(key).due.push(task)
      }
    }
    for (const [key, value] of map) value.focus = sortFocusDay(value.focus, key)
    return map
  }, [tasks])

  const trayTasks = useMemo(() => tasks
    .filter((task) => task.listId !== null && !task.completed && (
      trayList === 'all' || (trayList === 'today' ? isForToday(task) : task.listId === trayList)
    ))
    .sort(compareByDue), [tasks, trayList, today])

  const selectedSlots = useMemo(() => new Set(selection.map(chipSlot)), [selection])
  const dragTasks = drag ? drag.items.flatMap((item) => tasks.find((task) => task.id === item.taskId) ?? []) : []
  const dragIds = new Set(drag?.items.map((item) => item.taskId))
  const dragDueDay = dragTasks.length === 1 && dragTasks[0].dueAt ? dayKeyOf(new Date(dragTasks[0].dueAt)) : null
  const dragListId = dragTasks.every((task) => task.listId === dragTasks[0]?.listId) ? dragTasks[0]?.listId : null
  const dragListColor = dragListId ? listById.get(dragListId)?.color : undefined
  const trayListColor = trayList === 'all' || trayList === 'today' ? undefined : listById.get(trayList)?.color

  const label = view === 'month' || view === 'year'
    ? monthYear.format(cursor)
    : view === 'week'
      ? weekLabel(days[0], days[6])
      : longDay.format(cursor)

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
    setCursor(todayDate())
    if (view === 'year') scrollToMonth(todayDate())
  }

  const openDay = (date: Date) => {
    setCursor(date)
    setView('day')
  }

  // Where a chip sits on the calendar, so a selection drops in the order it reads.
  const chipRank = (chip: ChipRef) => {
    const cell = byDay.get(chip.day)
    const index = chip.kind === 'focus'
      ? cell?.focus.findIndex((task) => task.id === chip.taskId) ?? -1
      : (cell?.focus.length ?? 0) + (cell?.due.findIndex((task) => task.id === chip.taskId) ?? -1)
    return `${chip.day}:${String(index).padStart(4, '0')}`
  }

  const toDragItem = (chip: ChipRef): DragItem => ({ taskId: chip.taskId, fromDay: chip.kind === 'focus' ? chip.day : null })

  const chipShown = (chip: ChipRef) => Boolean(byDay.get(chip.day)?.[chip.kind].some((task) => task.id === chip.taskId))

  // Grabbing a selected chip carries the whole selection (less any chip since removed from the
  // calendar); grabbing any other chip carries just it.
  const startChipDrag = (event: React.DragEvent, chip: ChipRef) => {
    const chips = selectedSlots.has(chipSlot(chip)) ? selection.filter(chipShown) : []
    if (chips.length > 1) {
      chips.sort((a, b) => chipRank(a).localeCompare(chipRank(b)))
      startDrag(event, chips.map(toDragItem))
      const ghost = document.createElement('div')
      ghost.className = 'cal-drag-ghost'
      ghost.textContent = `${chips.length} tasks`
      document.body.appendChild(ghost)
      event.dataTransfer.setDragImage(ghost, 14, 12)
      window.setTimeout(() => ghost.remove())
      return
    }
    setSelection([])
    startDrag(event, [toDragItem(chip)])
  }

  const startDrag = (event: React.DragEvent, items: DragItem[]) => {
    event.dataTransfer.effectAllowed = 'copyMove'
    event.dataTransfer.setData('text/plain', items.map((item) => item.taskId).join('\n'))
    setDrag({ items })
  }

  const endDrag = () => {
    setDrag(null)
    setDropHint(null)
  }

  // The planned chip the cursor would insert above: the first one (skipping the tasks being moved)
  // whose vertical midpoint is below the cursor. Null means "after the last one".
  const findBeforeTask = (cell: HTMLElement, clientY: number, skip: Set<string>) => {
    for (const chip of cell.querySelectorAll<HTMLElement>('.cal-chip[data-focus-task]')) {
      const id = chip.dataset.focusTask
      if (!id || skip.has(id)) continue
      const bounds = chip.getBoundingClientRect()
      if (clientY < bounds.top + bounds.height / 2) return id
    }
    return null
  }

  const dragOverDay = (event: React.DragEvent, day: string) => {
    if (!drag) return
    event.preventDefault()
    const copying = event.altKey
    event.dataTransfer.dropEffect = copying || drag.items.every((item) => !item.fromDay) ? 'copy' : 'move'
    const beforeTaskId = findBeforeTask(event.currentTarget as HTMLElement, event.clientY, copying ? new Set() : dragIds)
    setDropHint((current) => current?.target === day && current.beforeTaskId === beforeTaskId && current.copying === copying ? current : { target: day, beforeTaskId, copying })
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
    // ⌥ makes new, separate tasks; a plain drop moves the originals.
    const copying = event.altKey
    const beforeTaskId = findBeforeTask(event.currentTarget as HTMLElement, event.clientY, copying ? new Set() : dragIds)
    if (copying) onCopyTasks(drag.items.map((item) => item.taskId), day, beforeTaskId)
    else onPlaceTasks(drag.items, day, beforeTaskId)
    setSelection([])
    endDrag()
  }

  const submitQuickAdd = () => {
    const title = quickTitle.trim()
    if (title && quickAddDay) onAddTaskOnDay(quickAddDay, title)
    setQuickTitle('')
    setQuickAddDay(null)
  }

  // A click opens the task after a short wait, so the second click of a double-click can rename
  // it in place instead of landing on the details panel's scrim.
  const clickTask = (event: React.MouseEvent, taskId: string) => {
    window.clearTimeout(openTimer.current)
    setSelection([])
    if (event.detail > 1) return
    openTimer.current = window.setTimeout(() => onOpenTask(taskId), OPEN_DELAY_MS)
  }

  const beginRename = (event: React.MouseEvent, task: Task, slot: string) => {
    if (event.target instanceof Element && event.target.closest('button')) return
    window.clearTimeout(openTimer.current)
    setDraftTitle(task.title)
    setRenaming(slot)
  }

  const finishRename = (task: Task) => {
    const title = draftTitle.trim()
    setRenaming(null)
    if (title && title !== task.title) onRenameTask(task.id, title)
  }

  const renderTitle = (task: Task, slot: string, className: string, inputClassName: string) => renaming === slot ? (
    <input
      className={inputClassName}
      value={draftTitle}
      maxLength={500}
      autoFocus
      aria-label="Task title"
      onFocus={(event) => event.currentTarget.select()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraftTitle(event.target.value)}
      onBlur={() => finishRename(task)}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') { event.preventDefault(); finishRename(task) }
        if (event.key === 'Escape') { event.preventDefault(); setRenaming(null) }
      }}
    />
  ) : <span className={className}>{task.title}</span>

  const renderChip =(task: Task, day: string, kind: 'focus' | 'due', dropEdge: 'before' | 'after' | null) => {
    const list = task.listId ? listById.get(task.listId) : undefined
    const dueHere = task.dueAt ? dayKeyOf(new Date(task.dueAt)) === day : false
    const chip: ChipRef = { taskId: task.id, day, kind }
    const dragging = Boolean(drag?.items.some((item) => item.taskId === task.id && item.fromDay === (kind === 'focus' ? day : null)))
    const slot = chipSlot(chip)
    const selected = selectedSlots.has(slot)
    const status = kind === 'focus' ? task.focusStatus[day] : undefined
    const nextStatus: FocusStatus | null = status === 'done' ? 'missed' : status === 'missed' ? null : 'done'
    const statusHint = status === 'done' ? 'Done this day — click to mark not done' : status === 'missed' ? 'Not done — click to clear' : 'Mark done for this day'
    const editing = renaming === slot
    return (
      <div
        key={`${task.id}:${kind}`}
        className={`cal-chip ${kind === 'due' ? 'is-due' : ''} ${task.completed ? 'is-done' : ''} ${status === 'done' ? 'is-day-done' : ''} ${status === 'missed' ? 'is-day-missed' : ''} ${dragging ? 'is-dragging' : ''} ${dropEdge ? `drop-${dropEdge}` : ''} ${editing ? 'is-editing' : ''} ${selected ? 'is-selected' : ''}`}
        style={{ '--chip-color': list?.color ?? 'var(--accent)' } as React.CSSProperties}
        data-focus-task={kind === 'focus' ? task.id : undefined}
        role="button"
        tabIndex={0}
        aria-pressed={selection.length > 0 ? selected : undefined}
        draggable={!editing}
        onDragStart={(event) => startChipDrag(event, chip)}
        onDragEnd={endDrag}
        onClick={(event) => {
          if (event.shiftKey) {
            window.clearTimeout(openTimer.current)
            setSelection((current) => selected ? current.filter((item) => chipSlot(item) !== slot) : [...current, chip])
          } else clickTask(event, task.id)
        }}
        onDoubleClick={(event) => beginRename(event, task, slot)}
        onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpenTask(task.id) } }}
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
        ) : task.completed ? <Check size={10} strokeWidth={3} /> : dueHere ? <Flag size={9} strokeWidth={2.5} /> : <span className="cal-chip-dot" />}
        {renderTitle(task, slot, 'cal-chip-title', 'cal-chip-input')}
        {!editing && <TimeSpentPicker variant="chip" track={task.time} taskTitle={task.title} day={day} onChange={(seconds) => onSetTimeSpent(task.id, seconds, day)} onStopwatch={() => onStopwatch(task.id)} />}
        {kind === 'focus' && !editing && (
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
    const reordering = Boolean(hint && !hint.copying && drag?.items.every((item) => item.fromDay === key))
    const time = timeByDay.get(key)
    // Which edge of a planned chip the guide line sits on: above the chip the drop lands before,
    // or below the last chip (other than the ones being moved) when it lands at the end.
    const lastOther = hint && hint.beforeTaskId === null ? focus.findLast((task) => hint.copying || !dragIds.has(task.id)) : undefined
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
          {time && time.total >= 60 && (
            <span className="cal-day-time" title={`${formatSpent(time.total)} spent on this day`}>
              <Timer />{options.dayView || time.total < 36_000 ? formatSpent(time.total) : `${Math.floor(time.total / 3600)}h`}
            </span>
          )}
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
        {options.dayView && time && (
          <div className="cal-day-time-list" aria-label="Time spent on this day">
            <div className="cal-day-time-head">
              <span><Timer size={12} />Time spent</span>
              <span title={time.breaks >= 60 ? `Not counting ${formatSpent(time.breaks)} on break-tagged tasks` : undefined}>{formatSpent(time.total)}</span>
            </div>
            {time.entries.map(({ task, seconds, isBreak }) => {
              const list = task.listId ? listById.get(task.listId) : undefined
              return (
                <button
                  key={task.id}
                  className={`cal-day-time-row ${isRunning(task.time) && key === today ? 'is-running' : ''} ${task.completed ? 'is-done' : ''} ${isBreak ? 'is-break' : ''}`}
                  onClick={() => onOpenTask(task.id)}
                  title={`Open ${task.title}`}
                >
                  <span className="cal-chip-dot" style={{ '--chip-color': list?.color ?? 'var(--accent)' } as React.CSSProperties} />
                  <span className="cal-day-time-title">{task.title}</span>
                  {isBreak && <span className="cal-day-time-break">Break</span>}
                  <span className="cal-day-time-value">{formatSpent(seconds)}</span>
                </button>
              )
            })}
            {time.open >= 1 && (
              <div className={`cal-day-time-row is-open ${isRunning(stopwatch) && key === today ? 'is-running' : ''}`}>
                <Timer size={11} className="cal-day-time-open-icon" />
                <span className="cal-day-time-title">Open stopwatch</span>
                <span className="cal-day-time-value">{formatSpent(time.open)}</span>
              </div>
            )}
          </div>
        )}
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
                <h3>{monthYear.format(monthDate)}</h3>
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
          if (!drag?.items.some((item) => item.fromDay)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          setDropHint((current) => current?.target === 'tray' ? current : { target: 'tray', beforeTaskId: null, copying: false })
        }}
        onDragLeave={() => setDropHint((current) => current?.target === 'tray' ? null : current)}
        onDrop={(event) => {
          event.preventDefault()
          for (const item of drag?.items ?? []) if (item.fromDay) onRemoveFocusDate(item.taskId, item.fromDay)
          setSelection([])
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
          // Planned for today in the first list, so it shows in the tray it was added from.
          if (trayList === 'today') onAddTask(title, undefined, { focusDates: [today] })
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
            const slot = `tray:${task.id}`
            return (
              <div
                key={task.id}
                className={`cal-tray-item ${dragIds.has(task.id) ? 'is-dragging' : ''}`}
                role="button"
                tabIndex={0}
                draggable={renaming !== slot}
                onDragStart={(event) => { setSelection([]); startDrag(event, [{ taskId: task.id, fromDay: null }]) }}
                onDragEnd={endDrag}
                onClick={(event) => clickTask(event, task.id)}
                onDoubleClick={(event) => beginRename(event, task, slot)}
                onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpenTask(task.id) } }}
              >
                <span className="cal-chip-dot" style={{ '--chip-color': list?.color ?? 'var(--accent)' } as React.CSSProperties} />
                <div className="cal-tray-item-body">
                  {renderTitle(task, slot, 'cal-tray-title', 'cal-quick cal-tray-input')}
                  {(task.dueAt || nextFocus || hasTime(task.time)) && (
                    <span className="cal-tray-meta">
                      {task.dueAt && <span className={`cal-tray-due ${isOverdue(task) ? 'overdue' : ''}`}>Due {formatDue(task.dueAt)}</span>}
                      {nextFocus && <span className="cal-tray-focus"><CalendarDays size={10} />{formatDayKey(nextFocus)}{task.focusDates.length > 1 && ` +${task.focusDates.length - 1}`}</span>}
                      {hasTime(task.time) && <TimeSpentPicker variant="meta" track={task.time} taskTitle={task.title} onChange={(seconds) => onSetTimeSpent(task.id, seconds)} onStopwatch={() => onStopwatch(task.id)} />}
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
        <p className="cal-tray-hint">Drag tasks onto a day, or up and down within it to reorder. Shift-click chips to select several and drag them together. ⌥-drag to copy as a new task. Drop a chip here to unplan it. Double-click a task to rename it.</p>
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
  const range = start.getMonth() === end.getMonth() ? `${monthDay.format(start)} – ${dayOnly.format(end)}` : `${monthDay.format(start)} – ${monthDay.format(end)}`
  return `${range}, ${end.getFullYear()}`
}
