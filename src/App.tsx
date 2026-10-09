import { CalendarDays, CheckCircle2, FolderOpen, Inbox, Pencil, Search, Star, Sun, Timer, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Board } from './components/Board'
import { CalendarPage } from './components/CalendarPage'
import { Completed } from './components/Completed'
import { Header } from './components/Header'
import { ConfirmModal, CreateListModal, RenameListModal } from './components/Modal'
import { Sidebar } from './components/Sidebar'
import { StopwatchPage } from './components/StopwatchPage'
import { TaskPanel } from './components/TaskPanel'
import { ListRing, listProgress } from './components/ListRing'
import { TagsContext, type TagsApi } from './components/Tags'
import { Trash } from './components/Trash'
import { createSeedData, createTask, nextOccurrence, normalizeData, palette, sortFocusDay, sortStarred, uid } from './data'
import { dateKey, dayKeyOf, isForToday, parseDateKey, todayDate, todayKey } from './format'
import { useNow } from './useNow'
import { useUpdate } from './useUpdate'
import { dayBalance, sortTags } from './tags'
import { emptyTrack, formatSpent, isRunning, mergeTracks, pauseTrack, setTotalSeconds, startTrack, totalSeconds } from './time'
import type { DeletedTask, FocusStatus, KnotData, Tag, Task, TaskList, ThemeMode, TimeTrack, ViewId } from './types'

const STORAGE_KEY = 'knot.desktop.data'
const longDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

interface Page {
  title: string
  icon: React.ReactNode
  color?: string
  subline?: string
  mode: 'board' | 'list' | 'smart'
}

function openTasksLabel(count: number) {
  return count === 0 ? 'All done' : `${count} open ${count === 1 ? 'task' : 'tasks'}`
}

function newTaskSortOrder(tasks: Task[], listId: string) {
  return tasks.reduce((order, task) => (
    task.listId === listId && !task.completed
      ? Math.min(order, task.sortOrder - 1)
      : order
  ), 0)
}

// Every route into the trash goes through here, so a running stopwatch is always stopped.
function makeTrashEntry(task: Task, lists: TaskList[]): DeletedTask {
  return { task: { ...task, time: pauseTrack(task.time) }, listName: task.listId === null ? 'Calendar only' : lists.find((list) => list.id === task.listId)?.name ?? 'Untitled list', deletedAt: new Date().toISOString() }
}

// The next position at the end of a list.
function endSortOrder(tasks: Task[], listId: string | null) {
  return tasks.reduce((order, task) => task.listId === listId ? Math.max(order, task.sortOrder + 1) : order, 0)
}

// Puts a task on `day` (adding it, or moving it there from `fromDay`) at the position in that
// day's list given by `beforeTaskId` — null appends, undefined keeps the task's current slot.
// Every task planned on that day then gets an explicit position so the order sticks.
function placeFocus(current: KnotData, taskId: string, day: string, fromDay: string | null, beforeTaskId: string | null | undefined): KnotData {
  const moving = current.tasks.find((task) => task.id === taskId)
  if (!moving) return current
  let placed = moving
  if (fromDay && fromDay !== day) {
    const { [fromDay]: status, ...focusStatus } = moving.focusStatus
    const { [fromDay]: _order, ...focusOrder } = moving.focusOrder
    placed = {
      ...moving,
      focusDates: [...new Set([...moving.focusDates.filter((item) => item !== fromDay), day])].sort(),
      focusStatus: status ? { ...focusStatus, [day]: status } : focusStatus,
      focusOrder,
    }
  } else if (!moving.focusDates.includes(day)) {
    placed = { ...moving, focusDates: [...moving.focusDates, day].sort() }
  }
  const ordered = sortFocusDay(current.tasks.filter((task) => task.focusDates.includes(day)), day)
  const currentIndex = ordered.findIndex((task) => task.id === taskId)
  const peers = ordered.filter((task) => task.id !== taskId)
  const rawIndex = beforeTaskId === undefined ? currentIndex : beforeTaskId === null ? peers.length : peers.findIndex((task) => task.id === beforeTaskId)
  peers.splice(rawIndex < 0 ? peers.length : rawIndex, 0, placed)
  const orderOf = new Map(peers.map((task, position) => [task.id, position]))
  return {
    ...current,
    tasks: current.tasks.map((task) => {
      const next = task.id === taskId ? placed : task
      const position = orderOf.get(next.id)
      return position === undefined ? next : { ...next, focusOrder: { ...next.focusOrder, [day]: position } }
    }),
  }
}

// The next occurrence of a repeating task that has just been completed, or null when it doesn't
// repeat. Tasks with a due date repeat by due date (and reminder, kept the same distance before it);
// tasks without one repeat by their latest planned day, or today. Occurrences already in the past
// are skipped, so finishing an overdue task schedules the next one ahead. `at` is when it was
// completed, so reopening later still finds the copy that completing made.
function nextRepeat(source: Task, at = Date.now()): Pick<Task, 'dueAt' | 'reminderAt' | 'focusDates'> | null {
  if (source.recurrence === 'none') return null
  if (source.dueAt) {
    let dueAt = nextOccurrence(source.dueAt, source.recurrence)
    while (dueAt && new Date(dueAt).getTime() <= at) dueAt = nextOccurrence(dueAt, source.recurrence)
    if (!dueAt) return null
    const reminderAt = source.reminderAt ? new Date(new Date(source.reminderAt).getTime() + new Date(dueAt).getTime() - new Date(source.dueAt).getTime()).toISOString() : null
    // A calendar-only task lives on its planned days, so the next one is planned for its due day.
    return { dueAt, reminderAt, focusDates: source.listId === null ? [dateKey(new Date(dueAt))] : [] }
  }
  const atDay = dayKeyOf(new Date(at))
  const anchor = parseDateKey([...source.focusDates].sort().pop() ?? atDay)
  anchor.setHours(12)
  let next = nextOccurrence(anchor.toISOString(), source.recurrence)
  while (next && dateKey(new Date(next)) <= atDay) next = nextOccurrence(next, source.recurrence)
  return next ? { dueAt: null, reminderAt: null, focusDates: [dateKey(new Date(next))] } : null
}

function App() {
  const [data, setData] = useState<KnotData>(() => createSeedData())
  const [hydrated, setHydrated] = useState(false)
  // When saved data couldn't be read, the fresh workspace on screen is not saved over it (and over
  // its backups) until the user actually changes something.
  const unreadData = useRef<KnotData | null>(null)
  const [selectedView, setSelectedView] = useState<ViewId>('all')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  // Which stopwatch the Stopwatch page shows: a task id, or null for the open stopwatch.
  const [stopwatchTarget, setStopwatchTarget] = useState<string | null>(null)
  const [quickAddListId, setQuickAddListId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [createListOpen, setCreateListOpen] = useState(false)
  const [renameList, setRenameList] = useState<TaskList | null>(null)
  const [listMenu, setListMenu] = useState<{ list: TaskList; x: number; y: number } | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; confirmLabel: string; run: () => void | Promise<void> } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  // Bumped once a minute so day-relative views (Today, due labels) roll over when the day turns at 6 AM.
  const [clockTick, setClockTick] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast((current) => current === message ? null : current), 2600)
  }
  const updates = useUpdate(showToast)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const loaded = window.knot ? await window.knot.load() : JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
        const normalized = normalizeData(loaded)
        if (active && normalized) {
          setData(normalized)
        } else if (active && loaded) {
          unreadData.current = data
          showToast('Saved data was not in a supported format. A fresh workspace is ready.')
        }
      } catch {
        unreadData.current = data
        showToast('Could not open saved data. A fresh workspace is ready.')
      } finally {
        if (active) setHydrated(true)
      }
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    // A stopwatch left running when the app closed is still running; show it first.
    const running = data.tasks.find((task) => isRunning(task.time))
    if (running) setStopwatchTarget(running.id)
    // Only on first load: afterwards the target follows the user's choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  useEffect(() => {
    if (!hydrated || data === unreadData.current) return
    const timer = window.setTimeout(async () => {
      try {
        if (window.knot) await window.knot.save(data)
        else localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      } catch {
        showToast('Changes could not be saved.')
      }
    }, 220)
    return () => window.clearTimeout(timer)
  }, [data, hydrated])

  useEffect(() => {
    if (!hydrated || data === unreadData.current) return
    const saveBeforeClose = () => {
      try {
        if (window.knot) window.knot.saveSync(data)
        else localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      } catch {
        // The regular debounced save reports errors while the window is still interactive.
      }
    }
    window.addEventListener('beforeunload', saveBeforeClose)
    return () => window.removeEventListener('beforeunload', saveBeforeClose)
  }, [data, hydrated])

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((tick) => tick + 1), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      const mode = data.preferences.theme
      const resolved = mode === 'system' ? (media.matches ? 'dark' : 'light') : mode
      document.documentElement.dataset.theme = resolved
      document.documentElement.style.colorScheme = resolved
      window.knot?.setTheme(mode).catch(() => showToast('Could not update the app theme.'))
    }
    applyTheme()
    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [data.preferences.theme])

  const anyRunning = isRunning(data.stopwatch) || data.tasks.some((task) => isRunning(task.time))
  // Keeps the Stopwatch page's header total current while something runs.
  const headerNow = useNow(anyRunning && selectedView === 'stopwatch', 15_000)
  useEffect(() => {
    const awake = anyRunning && selectedView === 'stopwatch'
    window.knot?.keepAwake?.(awake).catch(() => {})
    return () => { if (awake) window.knot?.keepAwake?.(false).catch(() => {}) }
  }, [anyRunning, selectedView])

  useEffect(() => {
    if (!hydrated || !window.knot) return
    window.knot.setLaunchAtLogin(data.preferences.launchAtLogin).catch(() => showToast('Could not update the login item.'))
  }, [data.preferences.launchAtLogin, hydrated])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
      if (event.metaKey && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        if (selectedView === 'completed' || selectedView === 'trash' || selectedView === 'calendar' || selectedView === 'stopwatch') return
        const firstListId = [...data.lists].sort((a, b) => a.sortOrder - b.sortOrder)[0]?.id
        const selectedId = selectedView.startsWith('list:') ? selectedView.slice(5) : firstListId
        if (selectedId) setQuickAddListId(selectedId)
        else setCreateListOpen(true)
      }
      if (event.key === 'Escape') {
        if (createListOpen || renameList || confirmAction) return
        if (listMenu) { setListMenu(null); return }
        if (quickAddListId) { setQuickAddListId(null); return }
        setSelectedTaskId(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [confirmAction, createListOpen, data.lists, listMenu, quickAddListId, renameList, selectedView])

  const sortedLists = useMemo(() => [...data.lists].sort((a, b) => a.sortOrder - b.sortOrder), [data.lists])
  const sortedTags = useMemo(() => sortTags(data.tags), [data.tags])
  const selectedTask = data.tasks.find((task) => task.id === selectedTaskId) ?? null

  const displayedTasks = useMemo(() => {
    const needle = query.trim().toLowerCase()
    let tasks = data.tasks.filter((task) => task.listId !== null)
    const tagNames = (task: Task) => data.tags.filter((tag) => task.tagIds.includes(tag.id)).map((tag) => tag.name).join(' ')
    if (needle) return tasks.filter((task) => `${task.title} ${task.notes} ${task.subtasks.map((item) => item.title).join(' ')} ${tagNames(task)}`.toLowerCase().includes(needle))
    tasks = tasks.filter((task) => !task.completed)
    if (selectedView === 'today') tasks = sortFocusDay(tasks.filter(isForToday), todayKey())
    else if (selectedView === 'starred') tasks = sortStarred(tasks.filter((task) => task.starred))
    else if (selectedView.startsWith('list:')) tasks = tasks.filter((task) => task.listId === selectedView.slice(5))
    return tasks
  }, [clockTick, data.tasks, data.tags, query, selectedView])

  const completedTasks = useMemo(() => data.tasks.filter((task) => task.listId !== null && task.completed), [data.tasks])
  const doneCounts = useMemo(() => completedTasks.reduce<Record<string, number>>((counts, task) => { if (task.listId) counts[task.listId] = (counts[task.listId] ?? 0) + 1; return counts }, {}), [completedTasks])
  const searching = Boolean(query.trim())
  const activeListId = selectedView.startsWith('list:') ? selectedView.slice(5) : null
  const activeList = sortedLists.find((list) => list.id === activeListId)

  const describePage = (): Page => {
    if (selectedView === 'completed') return { title: 'Completed', icon: <CheckCircle2 />, color: 'var(--c-done)', mode: 'smart' }
    if (selectedView === 'trash') return { title: 'Recently deleted', icon: <Trash2 />, color: 'var(--c-trash)', mode: 'smart' }
    if (searching) return { title: 'Search', icon: <Search />, color: 'var(--text-2)', subline: `${displayedTasks.length} ${displayedTasks.length === 1 ? 'result' : 'results'} for “${query.trim()}”`, mode: 'smart' }
    if (selectedView === 'all') return { title: 'All tasks', icon: <Inbox />, color: 'var(--c-all)', mode: 'board' }
    if (selectedView === 'today') return { title: 'Today', icon: <Sun />, color: 'var(--c-today)', subline: longDate.format(todayDate()), mode: 'smart' }
    if (selectedView === 'calendar') return { title: 'Calendar', icon: <CalendarDays />, color: 'var(--c-calendar)', subline: openTasksLabel(data.tasks.filter((task) => !task.completed).length), mode: 'smart' }
    if (selectedView === 'starred') return { title: 'Starred', icon: <Star fill="currentColor" />, color: 'var(--c-starred)', mode: 'smart' }
    if (selectedView === 'stopwatch') {
      // Working time only; breaks (between sessions, and on break-tagged tasks) are given apart.
      const day = dayBalance(data.tasks, data.stopwatch, data.tags, todayKey(), headerNow)
      const subline = day.work < 60 && day.tasks === 0 && day.breaks < 60 && !anyRunning
        ? 'Nothing timed yet today'
        : `Today ${formatSpent(day.work)}${day.tasks > 0 ? ` across ${day.tasks} ${day.tasks === 1 ? 'task' : 'tasks'}` : ''}${day.breaks >= 60 ? ` · ${formatSpent(day.breaks)} on breaks` : ''}`
      return { title: 'Stopwatch', icon: <Timer />, color: 'var(--c-timer)', subline, mode: 'smart' }
    }
    const open = activeList ? data.tasks.filter((task) => task.listId === activeList.id && !task.completed).length : 0
    const done = activeList ? doneCounts[activeList.id] ?? 0 : 0
    return { title: activeList?.name ?? 'List', icon: <ListRing color={activeList?.color ?? 'var(--accent)'} progress={listProgress(open, done)} />, color: activeList?.color, subline: openTasksLabel(open), mode: 'list' }
  }
  const page = describePage()

  const updatePreferences = (patch: Partial<KnotData['preferences']>) => setData((current) => ({ ...current, preferences: { ...current.preferences, ...patch } }))

  const addList = (name: string, color: string) => {
    const id = uid('list')
    setData((current) => ({ ...current, lists: [...current.lists, { id, name, color, createdAt: new Date().toISOString(), sortOrder: current.lists.length }] }))
    setSelectedView(`list:${id}`)
    setCreateListOpen(false)
    showToast(`${name} created`)
  }

  const addTask = (listId: string, title: string, openDetails = false, extras: Partial<Task> = {}) => {
    const task = { ...createTask(listId, title, 0), ...extras }
    setData((current) => ({
      ...current,
      tasks: [...current.tasks, { ...task, sortOrder: newTaskSortOrder(current.tasks, listId) }],
    }))
    if (openDetails) {
      setSelectedTaskId(task.id)
      setQuickAddListId(null)
    }
    showToast('Task added')
  }

  // A calendar-only task exists only on its planned days, so losing the last one sends it to
  // Recently deleted, as it was before the change, so restoring brings its days back.
  const trashIfDayless = (current: KnotData, original: Task, next: Task): KnotData | null => {
    if (next.listId !== null || next.focusDates.length > 0) return null
    return { ...current, tasks: current.tasks.filter((task) => task.id !== original.id), trash: [makeTrashEntry(original, current.lists), ...current.trash] }
  }
  const announceIfDayless = (taskId: string, remainingDays: (task: Task) => number) => {
    const task = data.tasks.find((item) => item.id === taskId)
    if (!task || task.listId !== null || remainingDays(task) > 0) return
    setSelectedTaskId((current) => current === taskId ? null : current)
    showToast('Moved to Recently deleted')
  }

  const updateTask = (taskId: string, patch: Partial<Task>) => {
    if (patch.focusDates) announceIfDayless(taskId, () => patch.focusDates!.length)
    setData((current) => {
      const task = current.tasks.find((item) => item.id === taskId)
      if (!task) return current
      const next = { ...task, ...patch }
      const trashed = trashIfDayless(current, task, next)
      if (trashed) return trashed
      if (patch.focusDates && !patch.focusStatus) {
        next.focusStatus = Object.fromEntries(Object.entries(next.focusStatus).filter(([day]) => next.focusDates.includes(day)))
      }
      if (patch.starred === false) next.starredOrder = null
      return { ...current, tasks: current.tasks.map((item) => item.id === taskId ? next : item) }
    })
  }

  const toggleStar = (taskId: string) => {
    const task = data.tasks.find((item) => item.id === taskId)
    if (task) updateTask(taskId, { starred: !task.starred })
  }

  // ----- Tags. New ones take the first palette colour no tag has yet.
  const createTag = (name: string): Tag => {
    const used = new Set(data.tags.map((tag) => tag.color))
    const tag: Tag = {
      id: uid('tag'),
      name: name.trim() || 'Untitled tag',
      color: palette.find((color) => !used.has(color)) ?? palette[data.tags.length % palette.length],
      isBreak: false,
      sortOrder: data.tags.reduce((order, item) => Math.max(order, item.sortOrder + 1), 0),
    }
    setData((current) => ({ ...current, tags: [...current.tags, tag] }))
    return tag
  }
  const updateTag = (tagId: string, patch: Partial<Pick<Tag, 'name' | 'color'>>) => setData((current) => ({
    ...current,
    tags: current.tags.map((tag) => tag.id === tagId ? { ...tag, ...patch } : tag),
  }))
  // The break tag stays: without it nothing could be marked as break time.
  const removeTag = (tagId: string) => {
    const tag = data.tags.find((item) => item.id === tagId)
    if (!tag || tag.isBreak) return
    const strip = (task: Task) => task.tagIds.includes(tagId) ? { ...task, tagIds: task.tagIds.filter((id) => id !== tagId) } : task
    const run = () => {
      setData((current) => ({
        ...current,
        tags: current.tags.filter((item) => item.id !== tagId),
        tasks: current.tasks.map(strip),
        trash: current.trash.map((entry) => ({ ...entry, task: strip(entry.task) })),
      }))
      showToast(`${tag.name} deleted`)
    }
    const used = data.tasks.filter((task) => task.tagIds.includes(tagId)).length
    if (used === 0) return run()
    setConfirmAction({
      title: 'Delete tag',
      message: `“${tag.name}” will be removed from ${used} ${used === 1 ? 'task' : 'tasks'}. The tasks stay.`,
      confirmLabel: 'Delete',
      run,
    })
  }
  const tagsApi: TagsApi = { tags: sortedTags, create: createTag, update: updateTag, remove: removeTag }

  // ----- Stopwatches. A target is a task id, or null for the open stopwatch. Only one runs at a time.
  const trackOf = (current: KnotData, target: string | null) => target === null ? current.stopwatch : current.tasks.find((task) => task.id === target)?.time ?? null
  const withTrack = (current: KnotData, target: string | null, change: (track: TimeTrack) => TimeTrack): KnotData => {
    if (target === null) return { ...current, stopwatch: change(current.stopwatch) }
    return { ...current, tasks: current.tasks.map((task) => task.id === target ? { ...task, time: change(task.time) } : task) }
  }
  const pauseAll = (current: KnotData, now: number): KnotData => ({
    ...current,
    stopwatch: pauseTrack(current.stopwatch, now),
    tasks: current.tasks.map((task) => isRunning(task.time) ? { ...task, time: pauseTrack(task.time, now) } : task),
  })
  const stopwatchName = (target: string | null) => target === null ? 'the open stopwatch' : `“${data.tasks.find((task) => task.id === target)?.title ?? 'task'}”`

  const startStopwatch = (target: string | null) => {
    const now = Date.now()
    // Already running: leave the session alone rather than closing and reopening it.
    setData((current) => {
      const track = trackOf(current, target)
      if (!track || isRunning(track)) return current
      return withTrack(pauseAll(current, now), target, (running) => startTrack(running, now))
    })
    setStopwatchTarget(target)
  }
  const pauseStopwatch = (target: string | null) => {
    const now = Date.now()
    setData((current) => withTrack(current, target, (track) => pauseTrack(track, now)))
  }
  // Changes go on `day` (the calendar passes the day it was made from), never on a future day.
  const adjustStopwatch = (target: string | null, seconds: number, day = todayKey()) => {
    const now = Date.now()
    const onDay = day < todayKey() ? day : todayKey()
    setData((current) => withTrack(current, target, (track) => setTotalSeconds(track, seconds, onDay, now)))
  }
  const resetStopwatch = (target: string | null) => {
    const track = trackOf(data, target)
    if (!track) return
    const run = () => setData((current) => withTrack(current, target, () => emptyTrack()))
    if (totalSeconds(track) < 60) return run()
    setConfirmAction({
      title: 'Reset stopwatch',
      message: `${formatSpent(totalSeconds(track))} on ${stopwatchName(target)} will be cleared.`,
      confirmLabel: 'Reset',
      run: () => { run(); showToast('Stopwatch reset') },
    })
  }
  // Opens the Stopwatch page on a task and starts it (or keeps it running).
  const openStopwatchFor = (taskId: string) => {
    startStopwatch(taskId)
    setSelectedView('stopwatch')
    setQuery('')
    setSelectedTaskId(null)
    setQuickAddListId(null)
  }
  // A task made on the Stopwatch page is planned for today in the calendar and becomes what the
  // stopwatch shows, ready to start.
  const addStopwatchTask = (title: string, openDetails: boolean) => {
    const task = { ...createTask(null, title, 0), focusDates: [todayKey()] }
    setData((current) => ({ ...current, tasks: [...current.tasks, task] }))
    setStopwatchTarget(task.id)
    if (openDetails) setSelectedTaskId(task.id)
    showToast('Task added for today')
  }

  // Moves everything on the open stopwatch onto a task, then clears the open stopwatch.
  const moveOpenToTask = (taskId: string) => {
    const now = Date.now()
    const title = data.tasks.find((task) => task.id === taskId)?.title
    if (!title) return
    setData((current) => ({
      ...current,
      stopwatch: emptyTrack(),
      tasks: current.tasks.map((task) => task.id === taskId ? { ...task, time: mergeTracks(task.time, current.stopwatch, now) } : task),
    }))
    setStopwatchTarget(taskId)
    showToast(`Time moved to “${title}”`)
  }

  // Drops dragged calendar tasks on `day`, in order, at the spot `beforeTaskId` marks. Items
  // dragged from a day move off it; items from the tray or a deadline chip gain the day.
  const placeTasks = (items: { taskId: string; fromDay: string | null }[], day: string, beforeTaskId: string | null) => setData((current) => (
    items.reduce((next, item) => placeFocus(next, item.taskId, day, item.fromDay, beforeTaskId), current)
  ))

  // Copies tasks onto `day` as new, separate tasks: same title, list, tags and subtasks (unchecked),
  // nothing else, so time, notes and day outcomes stay with the originals.
  const copyTasksToDay = (taskIds: string[], day: string, beforeTaskId: string | null) => {
    const ids = [...new Set(taskIds)]
    setData((current) => ids.reduce((next, taskId) => {
      const source = next.tasks.find((task) => task.id === taskId)
      if (!source) return next
      const copy: Task = {
        ...createTask(source.listId, source.title, endSortOrder(next.tasks, source.listId)),
        tagIds: [...source.tagIds],
        subtasks: source.subtasks.map((item) => ({ ...item, id: uid('subtask'), completed: false })),
      }
      return placeFocus({ ...next, tasks: [...next.tasks, copy] }, copy.id, day, null, beforeTaskId)
    }, current))
    showToast(ids.length === 1 ? 'Task copied' : `${ids.length} tasks copied`)
  }

  // Drag-to-reorder on the Today and Starred pages. The moved task lands before `beforeTaskId`
  // (null appends) and every task on the page gets an explicit position so the order sticks.
  const reorderView = (
    taskId: string,
    beforeTaskId: string | null,
    members: (task: Task) => boolean,
    ordered: (tasks: Task[]) => Task[],
    place: (task: Task, position: number) => Task,
  ) => setData((current) => {
    const moving = current.tasks.find((task) => task.id === taskId)
    if (!moving || !members(moving)) return current
    const peers = ordered(current.tasks.filter((task) => task.listId !== null && !task.completed && members(task))).filter((task) => task.id !== taskId)
    const rawIndex = beforeTaskId === null ? peers.length : peers.findIndex((task) => task.id === beforeTaskId)
    peers.splice(rawIndex < 0 ? peers.length : rawIndex, 0, moving)
    const orderOf = new Map(peers.map((task, position) => [task.id, position]))
    return { ...current, tasks: current.tasks.map((task) => { const position = orderOf.get(task.id); return position === undefined ? task : place(task, position) }) }
  })
  const reorderToday = (taskId: string, beforeTaskId: string | null) => {
    const today = todayKey()
    reorderView(taskId, beforeTaskId, isForToday, (tasks) => sortFocusDay(tasks, today), (task, position) => ({ ...task, focusOrder: { ...task.focusOrder, [today]: position } }))
  }
  const reorderStarred = (taskId: string, beforeTaskId: string | null) => reorderView(taskId, beforeTaskId, (task) => task.starred, sortStarred, (task, position) => ({ ...task, starredOrder: position }))

  const removeFocusDate = (taskId: string, day: string) => {
    announceIfDayless(taskId, (task) => task.focusDates.filter((item) => item !== day).length)
    setData((current) => {
      const task = current.tasks.find((item) => item.id === taskId)
      if (!task) return current
      const focusDates = task.focusDates.filter((item) => item !== day)
      const trashed = trashIfDayless(current, task, { ...task, focusDates })
      if (trashed) return trashed
      const { [day]: _removedStatus, ...focusStatus } = task.focusStatus
      const { [day]: _removedOrder, ...focusOrder } = task.focusOrder
      return { ...current, tasks: current.tasks.map((item) => item.id === taskId ? { ...task, focusDates, focusStatus, focusOrder } : item) }
    })
  }

  const setFocusStatus = (taskId: string, day: string, status: FocusStatus | null) => setData((current) => ({
    ...current,
    tasks: current.tasks.map((task) => {
      if (task.id !== taskId) return task
      const { [day]: _removed, ...focusStatus } = task.focusStatus
      return { ...task, focusStatus: status ? { ...focusStatus, [day]: status } : focusStatus }
    }),
  }))

  // The Stopwatch page's check: done for today, the same as ticking the task's chip on today in
  // the calendar. A task timed today but not planned for today gets today as a focus day so the
  // mark has a day to live on. Unticking a task completed elsewhere reopens it.
  const setDoneToday = (taskId: string, done: boolean) => {
    const today = todayKey()
    const task = data.tasks.find((item) => item.id === taskId)
    if (!task) return
    if (!done && task.completed) completeTask(taskId, false)
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((item) => {
        if (item.id !== taskId) return item
        const { [today]: _removed, ...focusStatus } = item.focusStatus
        if (!done) return { ...item, focusStatus }
        const focusDates = item.focusDates.includes(today) ? item.focusDates : [...item.focusDates, today].sort()
        return { ...item, focusDates, focusStatus: { ...focusStatus, [today]: 'done' }, time: pauseTrack(item.time) }
      }),
    }))
  }

  // The Stopwatch page's Today list hands back its rows in their new order.
  const reorderStopwatch = (taskIds: string[]) => {
    const orderOf = new Map(taskIds.map((id, position) => [id, position]))
    setData((current) => ({ ...current, tasks: current.tasks.map((task) => { const position = orderOf.get(task.id); return position === undefined ? task : { ...task, stopwatchOrder: position } }) }))
  }

  const addTaskOnDay = (day: string, title: string) => {
    const task = { ...createTask(null, title, 0), focusDates: [day] }
    setData((current) => ({ ...current, tasks: [...current.tasks, task] }))
    showToast('Added to calendar only')
  }

  const renameListById = (listId: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setData((current) => ({ ...current, lists: current.lists.map((list) => list.id === listId ? { ...list, name: trimmed } : list) }))
  }

  const toggleSubtask = (taskId: string, subtaskId: string) => {
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id === taskId
        ? { ...task, subtasks: task.subtasks.map((subtask) => subtask.id === subtaskId ? { ...subtask, completed: !subtask.completed } : subtask) }
        : task),
    }))
  }

  const completeTask = (taskId: string, completed: boolean) => {
    setData((current) => {
      const source = current.tasks.find((task) => task.id === taskId)
      if (!source) return current
      let tasks = current.tasks.map((task) => task.id === taskId ? { ...task, completed, completedAt: completed ? new Date().toISOString() : null, time: completed ? pauseTrack(task.time) : task.time } : task)
      const repeat = nextRepeat(source, !completed && source.completedAt ? new Date(source.completedAt).getTime() : Date.now())
      const isNextCopy = (task: Task) => repeat !== null && task.id !== source.id && !task.completed && task.listId === source.listId && task.title === source.title && task.recurrence === source.recurrence && task.dueAt === repeat.dueAt && (repeat.dueAt !== null || task.focusDates.join() === repeat.focusDates.join())
      if (completed && !source.completed && repeat && !tasks.some(isNextCopy)) {
        tasks.push({ ...source, ...repeat, id: uid('task'), focusStatus: {}, focusOrder: {}, starredOrder: null, stopwatchOrder: null, completed: false, completedAt: null, createdAt: new Date().toISOString(), sortOrder: endSortOrder(tasks, source.listId), subtasks: source.subtasks.map((item) => ({ ...item, id: uid('subtask'), completed: false })), time: emptyTrack() })
      }
      // Reopening takes back the copy completing made, as long as nothing has been done with it.
      if (!completed && source.completed && repeat) {
        const untouched = (task: Task) => isNextCopy(task) && totalSeconds(task.time) === 0 && task.subtasks.every((item) => !item.completed) && task.createdAt >= (source.completedAt ?? '')
        tasks = tasks.filter((task) => !untouched(task))
      }
      return { ...current, tasks }
    })
    const calendarOnly = data.tasks.find((task) => task.id === taskId)?.listId === null
    showToast(completed ? (calendarOnly ? 'Task completed' : 'Moved to Completed') : 'Task reopened')
  }

  const deleteTask = (taskId: string) => {
    setData((current) => {
      const task = current.tasks.find((item) => item.id === taskId)
      if (!task) return current
      return {
        ...current,
        tasks: current.tasks.filter((item) => item.id !== taskId),
        trash: [makeTrashEntry(task, current.lists), ...current.trash],
      }
    })
    setSelectedTaskId((current) => current === taskId ? null : current)
    showToast('Moved to Recently deleted')
  }

  const restoreTask = (taskId: string) => {
    setData((current) => {
      const entry = current.trash.find((item) => item.task.id === taskId)
      if (!entry) return current
      const lists = [...current.lists]
      const listId = entry.task.listId
      if (listId !== null && !lists.some((list) => list.id === listId)) {
        // Revived under its old id, so restoring the list's other tasks puts them back in it too.
        const revived: TaskList = { id: listId, name: entry.listName, color: palette[lists.length % palette.length], createdAt: new Date().toISOString(), sortOrder: lists.length }
        lists.push(revived)
      }
      const restored: Task = { ...entry.task, listId, sortOrder: endSortOrder(current.tasks, listId) }
      return {
        ...current,
        lists,
        tasks: [...current.tasks, restored],
        trash: current.trash.filter((item) => item.task.id !== taskId),
      }
    })
    showToast('Task restored')
  }

  const purgeTask = (taskId: string) => {
    const entry = data.trash.find((item) => item.task.id === taskId)
    if (!entry) return
    setConfirmAction({
      title: 'Delete forever',
      message: `“${entry.task.title}” will be removed for good. This cannot be undone.`,
      confirmLabel: 'Delete forever',
      run: () => {
        setData((current) => ({ ...current, trash: current.trash.filter((item) => item.task.id !== taskId) }))
        showToast('Task deleted forever')
      },
    })
  }

  const clearCompleted = () => {
    // Only what the Completed page shows; finished calendar-only tasks stay on the calendar.
    const cleared = (task: Task) => task.completed && task.listId !== null
    const count = data.tasks.filter(cleared).length
    if (count === 0) return
    setConfirmAction({
      title: 'Clear completed',
      message: `${count} completed ${count === 1 ? 'task moves' : 'tasks move'} to Recently deleted.`,
      confirmLabel: 'Clear',
      run: () => {
        setData((current) => ({
          ...current,
          tasks: current.tasks.filter((task) => !cleared(task)),
          trash: [...current.tasks.filter(cleared).map((task) => makeTrashEntry(task, current.lists)), ...current.trash],
        }))
        showToast('Completed tasks cleared')
      },
    })
  }

  const emptyTrash = () => {
    if (data.trash.length === 0) return
    setConfirmAction({
      title: 'Empty Recently deleted',
      message: `${data.trash.length} ${data.trash.length === 1 ? 'task' : 'tasks'} will be removed for good. This cannot be undone.`,
      confirmLabel: 'Empty',
      run: () => {
        setData((current) => ({ ...current, trash: [] }))
        showToast('Recently deleted is empty')
      },
    })
  }

  // Moves a task into `targetListId` ahead of `beforeTaskId` (or to the end), then renumbers
  // the open/completed peers of both lists so every position is explicit.
  const moveTask = (taskId: string, targetListId: string, beforeTaskId?: string) => {
    setData((current) => {
      const moving = current.tasks.find((task) => task.id === taskId)
      if (!moving) return current
      const peersOf = (listId: string | null) => current.tasks
        .filter((task) => task.listId === listId && task.completed === moving.completed && task.id !== taskId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
      const targetPeers = peersOf(targetListId)
      const rawIndex = beforeTaskId ? targetPeers.findIndex((task) => task.id === beforeTaskId) : targetPeers.length
      targetPeers.splice(rawIndex < 0 ? targetPeers.length : rawIndex, 0, moving)
      const sourcePeers = moving.listId === targetListId ? [] : peersOf(moving.listId)

      const orderOf = new Map<string, number>()
      targetPeers.forEach((task, position) => orderOf.set(task.id, position))
      sourcePeers.forEach((task, position) => orderOf.set(task.id, position))
      return {
        ...current,
        tasks: current.tasks.map((task) => {
          const position = orderOf.get(task.id)
          if (position === undefined) return task
          return task.id === taskId ? { ...task, listId: targetListId, sortOrder: position } : { ...task, sortOrder: position }
        }),
      }
    })
  }

  const moveList = (listId: string, beforeListId?: string) => {
    setData((current) => {
      const moving = current.lists.find((list) => list.id === listId)
      if (!moving) return current
      const ordered = [...current.lists].sort((a, b) => a.sortOrder - b.sortOrder).filter((list) => list.id !== listId)
      const rawIndex = beforeListId ? ordered.findIndex((list) => list.id === beforeListId) : ordered.length
      ordered.splice(rawIndex < 0 ? ordered.length : rawIndex, 0, moving)
      const orderOf = new Map(ordered.map((list, position) => [list.id, position]))
      return { ...current, lists: current.lists.map((list) => ({ ...list, sortOrder: orderOf.get(list.id) ?? list.sortOrder })) }
    })
  }

  const deleteList = (list: TaskList) => {
    setListMenu(null)
    setConfirmAction({
      title: 'Delete list',
      message: `“${list.name}” will be deleted. Its tasks move to Recently deleted.`,
      confirmLabel: 'Delete',
      run: () => {
        setData((current) => ({
          ...current,
          lists: current.lists.filter((item) => item.id !== list.id),
          tasks: current.tasks.filter((task) => task.listId !== list.id),
          trash: [...current.tasks.filter((task) => task.listId === list.id).map((task) => makeTrashEntry(task, current.lists)), ...current.trash],
        }))
        if (selectedView === `list:${list.id}`) setSelectedView('all')
        if (selectedTask?.listId === list.id) setSelectedTaskId(null)
        showToast(`${list.name} deleted`)
      },
    })
  }

  const setTheme = (theme: ThemeMode) => {
    if (theme === data.preferences.theme) return
    updatePreferences({ theme })
    showToast(theme === 'system' ? 'Appearance follows your Mac' : theme === 'light' ? 'Light appearance' : 'Dark appearance')
  }

  const exportData = async () => {
    try {
      if (await window.knot?.exportData(data)) showToast('Data exported')
    } catch {
      showToast('Could not export data.')
    }
  }

  const importData = async () => {
    let imported: KnotData | null
    try {
      const file = await window.knot?.importData()
      if (file == null) return
      // Only Knot's own export format; the current preferences (appearance, login item) stay.
      const isExport = typeof file === 'object' && (file as { version?: unknown }).version === 1 && Array.isArray((file as { tasks?: unknown }).tasks)
      const normalized = isExport ? normalizeData(file) : null
      imported = normalized && { ...normalized, preferences: data.preferences }
    } catch {
      imported = null
    }
    if (!imported) {
      showToast('That file is not a Knot backup.')
      return
    }
    const next = imported
    setConfirmAction({
      title: 'Import data',
      message: `Your lists and tasks will be replaced by the ${next.tasks.length} ${next.tasks.length === 1 ? 'task' : 'tasks'} in this file. A copy of your current data is kept in Knot’s Backups folder.`,
      confirmLabel: 'Replace',
      run: async () => {
        try {
          await window.knot?.snapshotBeforeImport()
        } catch {
          showToast('Could not back up current data, so nothing was imported.')
          return
        }
        setData(next)
        setStopwatchTarget(next.tasks.find((task) => isRunning(task.time))?.id ?? null)
        setSelectedView('all')
        setSelectedTaskId(null)
        showToast('Data imported')
      },
    })
  }

  const openListMenu = (list: TaskList, anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect()
    const width = 172
    const height = 132
    const x = Math.max(8, Math.min(rect.right + 4, window.innerWidth - width - 8))
    const y = Math.max(8, Math.min(rect.top, window.innerHeight - height - 8))
    setListMenu((current) => current?.list.id === list.id ? null : { list, x, y })
  }

  const openList = (listId: string) => {
    setSelectedView(`list:${listId}`)
    setQuery('')
    setQuickAddListId(null)
  }

  if (!hydrated) return <div className="splash"><img src="./icon.png" alt="" /><span>Loading Knot</span></div>

  return (
    <TagsContext.Provider value={tagsApi}>
      <div
        className={`app-shell ${data.preferences.sidebarCollapsed ? 'sidebar-collapsed' : ''} ${activeList ? 'is-accented' : ''}`}
        style={activeList ? { '--list-accent': activeList.color } as React.CSSProperties : undefined}
        onMouseDown={() => listMenu && setListMenu(null)}
      >
        <Sidebar
          collapsed={data.preferences.sidebarCollapsed}
          lists={sortedLists}
          tasks={data.tasks}
          stopwatch={data.stopwatch}
          selectedView={selectedView}
          completedCount={completedTasks.length}
          trashCount={data.trash.length}
          launchAtLogin={data.preferences.launchAtLogin}
          theme={data.preferences.theme}
          query={query}
          searchRef={searchRef}
          onQuery={(value) => { setQuery(value); if (value.trim() && (selectedView === 'trash' || selectedView === 'completed')) setSelectedView('all') }}
          onSelect={(view) => { setSelectedView(view); setQuery(''); setQuickAddListId(null) }}
          onCreateList={() => setCreateListOpen(true)}
          onListMenu={openListMenu}
          onRenameList={renameListById}
          onToggle={() => updatePreferences({ sidebarCollapsed: !data.preferences.sidebarCollapsed })}
          onLaunchAtLogin={(launchAtLogin) => { updatePreferences({ launchAtLogin }); showToast(launchAtLogin ? 'Knot will open when you log in' : 'Open at login turned off') }}
          onTheme={setTheme}
          onExport={window.knot ? exportData : undefined}
          onImport={window.knot ? importData : undefined}
          updates={updates}
        />
        <section className="workspace">
          <Header
            title={page.title}
            subline={page.subline}
            icon={page.icon}
            color={page.color}
            sortMode={data.preferences.sortMode}
            showSort={page.mode !== 'smart' || selectedView === 'today' || selectedView === 'starred'}
            onSort={(sortMode) => updatePreferences({ sortMode })}
            onRenameTitle={!searching && activeList ? (name) => renameListById(activeList.id, name) : undefined}
          />
          {selectedView === 'completed' ? <Completed tasks={completedTasks} lists={sortedLists} onOpen={setSelectedTaskId} onReopen={(taskId) => completeTask(taskId, false)} onDelete={deleteTask} onSetTimeSpent={adjustStopwatch} onStopwatch={openStopwatchFor} onClear={clearCompleted} />
            : selectedView === 'trash' ? <Trash entries={data.trash} onRestore={restoreTask} onPurge={purgeTask} onEmpty={emptyTrash} />
            : selectedView === 'stopwatch' && !searching ? <StopwatchPage
              tasks={data.tasks}
              lists={sortedLists}
              open={data.stopwatch}
              target={stopwatchTarget}
              onTarget={setStopwatchTarget}
              onStart={startStopwatch}
              onPause={pauseStopwatch}
              onReset={resetStopwatch}
              onAdjust={adjustStopwatch}
              onMoveOpenToTask={moveOpenToTask}
              onOpenTask={setSelectedTaskId}
              onAddTask={addStopwatchTask}
              onSetTags={(taskId, tagIds) => updateTask(taskId, { tagIds })}
              onSetDone={setDoneToday}
              onReorder={reorderStopwatch}
            />
            : selectedView === 'calendar' && !searching ? <CalendarPage
              tasks={data.tasks}
              lists={sortedLists}
              stopwatch={data.stopwatch}
              onOpenTask={setSelectedTaskId}
              onRenameTask={(taskId, title) => updateTask(taskId, { title })}
              onSetTimeSpent={adjustStopwatch}
              onStopwatch={openStopwatchFor}
              onPlaceTasks={placeTasks}
              onCopyTasks={copyTasksToDay}
              onRemoveFocusDate={removeFocusDate}
              onSetFocusStatus={setFocusStatus}
              onAddTaskOnDay={addTaskOnDay}
              onAddTask={(title, listId, extras) => { const target = listId ?? sortedLists[0]?.id; if (target) addTask(target, title, false, extras); else setCreateListOpen(true) }}
            /> : <Board
              mode={page.mode}
              lists={sortedLists}
              tasks={displayedTasks}
              activeListId={activeListId}
              doneCounts={doneCounts}
              emptyIcon={page.icon}
              sortMode={data.preferences.sortMode}
              quickAddListId={quickAddListId}
              quickAddEnabled={page.mode === 'list' || (!searching && (selectedView === 'today' || selectedView === 'starred'))}
              onQuickAddList={setQuickAddListId}
              onAddTask={(listId, title, openDetails) => addTask(listId, title, openDetails,
                selectedView === 'today' ? { focusDates: [todayKey()] }
                  : selectedView === 'starred' ? { starred: true }
                  : {})}
              onOpenTask={setSelectedTaskId}
              onCompleteTask={completeTask}
              onToggleSubtask={toggleSubtask}
              onStarTask={toggleStar}
              onDeleteTask={deleteTask}
              onSetDueTask={(taskId, dueAt) => updateTask(taskId, { dueAt })}
              onSetTimeSpentTask={adjustStopwatch}
              onStopwatchTask={openStopwatchFor}
              onRenameTask={(taskId, title) => updateTask(taskId, { title })}
              onRenameList={renameListById}
              onListMenu={openListMenu}
              onMoveTask={moveTask}
              onReorderTask={searching ? undefined : selectedView === 'today' ? reorderToday : selectedView === 'starred' ? reorderStarred : undefined}
              onMoveList={moveList}
              onCreateList={() => setCreateListOpen(true)}
            />}
        </section>

        {selectedTask && <><button className="panel-scrim" onClick={() => setSelectedTaskId(null)} aria-label="Close details" /><TaskPanel task={selectedTask} lists={sortedLists} onStopwatch={() => openStopwatchFor(selectedTask.id)} onSetTimeSpent={(seconds) => adjustStopwatch(selectedTask.id, seconds)} onUpdate={(patch) => {
          if (patch.listId && patch.listId !== selectedTask.listId) moveTask(selectedTask.id, patch.listId)
          else updateTask(selectedTask.id, patch)
        }} onComplete={(completed) => completeTask(selectedTask.id, completed)} onDelete={() => deleteTask(selectedTask.id)} onClose={() => setSelectedTaskId(null)} /></>}

        {createListOpen && <CreateListModal onClose={() => setCreateListOpen(false)} onCreate={addList} />}
        {confirmAction && <ConfirmModal title={confirmAction.title} message={confirmAction.message} confirmLabel={confirmAction.confirmLabel} onCancel={() => setConfirmAction(null)} onConfirm={() => { confirmAction.run(); setConfirmAction(null) }} />}
        {renameList && <RenameListModal initialName={renameList.name} onClose={() => setRenameList(null)} onRename={(name) => { renameListById(renameList.id, name); setRenameList(null); showToast('List renamed') }} />}

        {listMenu && (
          <div className="context-menu" role="menu" aria-label={`Options for ${listMenu.list.name}`} style={{ left: listMenu.x, top: listMenu.y }} onMouseDown={(event) => event.stopPropagation()}>
            <button role="menuitem" autoFocus onClick={() => { setRenameList(listMenu.list); setListMenu(null) }}><Pencil size={14} />Rename</button>
            <button role="menuitem" onClick={() => { openList(listMenu.list.id); setListMenu(null) }}><FolderOpen size={14} />Open list</button>
            <span />
            <button role="menuitem" className="danger" onClick={() => deleteList(listMenu.list)}><Trash2 size={14} />Delete list</button>
          </div>
        )}

        {toast && <div className="toast"><CheckCircle2 size={16} />{toast}</div>}
      </div>
    </TagsContext.Provider>
  )
}

export default App
