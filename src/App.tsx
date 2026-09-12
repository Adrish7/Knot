import { CalendarDays, CheckCircle2, FolderOpen, Inbox, Pencil, Search, Star, Sun, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Board } from './components/Board'
import { CalendarPage } from './components/CalendarPage'
import { Completed } from './components/Completed'
import { Header } from './components/Header'
import { ConfirmModal, CreateListModal, RenameListModal } from './components/Modal'
import { Sidebar } from './components/Sidebar'
import { TaskPanel } from './components/TaskPanel'
import { ListRing, listProgress } from './components/ListRing'
import { Trash } from './components/Trash'
import { createSeedData, createTask, nextOccurrence, normalizeData, palette, sortFocusDay, sortStarred, uid } from './data'
import { isForToday, todayKey } from './format'
import type { DeletedTask, FocusStatus, KnotData, Task, TaskList, ThemeMode, ViewId } from './types'

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

function makeTrashEntry(task: Task, lists: TaskList[]): DeletedTask {
  return { task, listName: task.listId === null ? 'Calendar only' : lists.find((list) => list.id === task.listId)?.name ?? 'Untitled list', deletedAt: new Date().toISOString() }
}

function App() {
  const [data, setData] = useState<KnotData>(() => createSeedData())
  const [hydrated, setHydrated] = useState(false)
  const [selectedView, setSelectedView] = useState<ViewId>('all')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [quickAddListId, setQuickAddListId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [createListOpen, setCreateListOpen] = useState(false)
  const [renameList, setRenameList] = useState<TaskList | null>(null)
  const [listMenu, setListMenu] = useState<{ list: TaskList; x: number; y: number } | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; confirmLabel: string; run: () => void } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  // Bumped once a minute so day-relative views (Today, due labels) roll over at midnight.
  const [clockTick, setClockTick] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast((current) => current === message ? null : current), 2600)
  }

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const loaded = window.knot ? await window.knot.load() : JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
        const normalized = normalizeData(loaded)
        if (active && normalized) {
          setData(normalized)
        } else if (active && loaded) {
          showToast('Saved data was not in a supported format. A fresh workspace is ready.')
        }
      } catch {
        showToast('Could not open saved data. A fresh workspace is ready.')
      } finally {
        if (active) setHydrated(true)
      }
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!hydrated) return
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
    if (!hydrated) return
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
        if (selectedView === 'completed' || selectedView === 'trash' || selectedView === 'calendar') return
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
  const selectedTask = data.tasks.find((task) => task.id === selectedTaskId) ?? null

  const displayedTasks = useMemo(() => {
    const needle = query.trim().toLowerCase()
    let tasks = data.tasks.filter((task) => task.listId !== null)
    if (needle) return tasks.filter((task) => `${task.title} ${task.notes} ${task.subtasks.map((item) => item.title).join(' ')}`.toLowerCase().includes(needle))
    tasks = tasks.filter((task) => !task.completed)
    if (selectedView === 'today') tasks = sortFocusDay(tasks.filter(isForToday), todayKey())
    else if (selectedView === 'starred') tasks = sortStarred(tasks.filter((task) => task.starred))
    else if (selectedView.startsWith('list:')) tasks = tasks.filter((task) => task.listId === selectedView.slice(5))
    return tasks
  }, [clockTick, data.tasks, query, selectedView])

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
    if (selectedView === 'today') return { title: 'Today', icon: <Sun />, color: 'var(--c-today)', subline: longDate.format(new Date()), mode: 'smart' }
    if (selectedView === 'calendar') return { title: 'Calendar', icon: <CalendarDays />, color: 'var(--c-calendar)', subline: openTasksLabel(data.tasks.filter((task) => !task.completed).length), mode: 'smart' }
    if (selectedView === 'starred') return { title: 'Starred', icon: <Star fill="currentColor" />, color: 'var(--c-starred)', mode: 'smart' }
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

  const updateTask = (taskId: string, patch: Partial<Task>) => setData((current) => ({
    ...current,
    tasks: current.tasks.flatMap((task) => {
      if (task.id !== taskId) return [task]
      const next = { ...task, ...patch }
      if (next.listId === null && next.focusDates.length === 0) return []
      if (patch.focusDates && !patch.focusStatus) {
        next.focusStatus = Object.fromEntries(Object.entries(next.focusStatus).filter(([day]) => next.focusDates.includes(day)))
      }
      if (patch.starred === false) next.starredOrder = null
      return [next]
    }),
  }))

  const toggleStar = (taskId: string) => {
    const task = data.tasks.find((item) => item.id === taskId)
    if (task) updateTask(taskId, { starred: !task.starred })
  }

  // Puts a task on `day` (adding it, or moving it there from `fromDay`) at the position in that
  // day's list given by `beforeTaskId` — null appends, undefined keeps the task's current slot.
  // Every task planned on that day then gets an explicit position so the order sticks.
  const placeFocus = (taskId: string, day: string, fromDay: string | null, beforeTaskId: string | null | undefined) => setData((current) => {
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
  })
  const addFocusDate = (taskId: string, day: string, beforeTaskId?: string | null) => placeFocus(taskId, day, null, beforeTaskId)
  const moveFocusDate = (taskId: string, fromDay: string, toDay: string, beforeTaskId?: string | null) => placeFocus(taskId, toDay, fromDay, beforeTaskId)

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

  const removeFocusDate = (taskId: string, day: string) => setData((current) => ({
    ...current,
    tasks: current.tasks.flatMap((task) => {
      if (task.id !== taskId) return [task]
      const focusDates = task.focusDates.filter((item) => item !== day)
      if (task.listId === null && focusDates.length === 0) return []
      const { [day]: _removedStatus, ...focusStatus } = task.focusStatus
      const { [day]: _removedOrder, ...focusOrder } = task.focusOrder
      return [{ ...task, focusDates, focusStatus, focusOrder }]
    }),
  }))

  const setFocusStatus = (taskId: string, day: string, status: FocusStatus | null) => setData((current) => ({
    ...current,
    tasks: current.tasks.map((task) => {
      if (task.id !== taskId) return task
      const { [day]: _removed, ...focusStatus } = task.focusStatus
      return { ...task, focusStatus: status ? { ...focusStatus, [day]: status } : focusStatus }
    }),
  }))

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
      const tasks = current.tasks.map((task) => task.id === taskId ? { ...task, completed, completedAt: completed ? new Date().toISOString() : null } : task)
      if (completed && !source.completed && source.recurrence !== 'none' && source.dueAt) {
        const nextDue = nextOccurrence(source.dueAt, source.recurrence)
        const nextReminder = source.reminderAt ? nextOccurrence(source.reminderAt, source.recurrence) : null
        const alreadyCreated = tasks.some((task) => task.id !== source.id && !task.completed && task.listId === source.listId && task.dueAt === nextDue && task.title === source.title && task.recurrence === source.recurrence)
        if (!alreadyCreated) {
          const next: Task = { ...source, id: uid('task'), dueAt: nextDue, focusDates: [], focusStatus: {}, focusOrder: {}, reminderAt: nextReminder, completed: false, completedAt: null, createdAt: new Date().toISOString(), sortOrder: tasks.filter((task) => task.listId === source.listId).length, subtasks: source.subtasks.map((item) => ({ ...item, id: uid('subtask'), completed: false })) }
          tasks.push(next)
        }
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
      let listId = entry.task.listId
      if (listId !== null && !lists.some((list) => list.id === listId)) {
        const revived: TaskList = { id: uid('list'), name: entry.listName, color: palette[lists.length % palette.length], createdAt: new Date().toISOString(), sortOrder: lists.length }
        lists.push(revived)
        listId = revived.id
      }
      const restored: Task = { ...entry.task, listId, sortOrder: current.tasks.filter((task) => task.listId === listId).length }
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
    const count = data.tasks.filter((task) => task.completed).length
    if (count === 0) return
    setConfirmAction({
      title: 'Clear completed',
      message: `${count} completed ${count === 1 ? 'task moves' : 'tasks move'} to Recently deleted.`,
      confirmLabel: 'Clear',
      run: () => {
        setData((current) => ({
          ...current,
          tasks: current.tasks.filter((task) => !task.completed),
          trash: [...current.tasks.filter((task) => task.completed).map((task) => makeTrashEntry(task, current.lists)), ...current.trash],
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
    <div
      className={`app-shell ${data.preferences.sidebarCollapsed ? 'sidebar-collapsed' : ''} ${activeList ? 'is-accented' : ''}`}
      style={activeList ? { '--list-accent': activeList.color } as React.CSSProperties : undefined}
      onMouseDown={() => listMenu && setListMenu(null)}
    >
      <Sidebar
        collapsed={data.preferences.sidebarCollapsed}
        lists={sortedLists}
        tasks={data.tasks}
        selectedView={selectedView}
        completedCount={completedTasks.length}
        trashCount={data.trash.length}
        launchAtLogin={data.preferences.launchAtLogin}
        thread={data.preferences.sidebarThread}
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
        onThread={(sidebarThread) => updatePreferences({ sidebarThread })}
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
        {selectedView === 'completed' ? <Completed tasks={completedTasks} lists={sortedLists} onOpen={setSelectedTaskId} onReopen={(taskId) => completeTask(taskId, false)} onDelete={deleteTask} onClear={clearCompleted} />
          : selectedView === 'trash' ? <Trash entries={data.trash} onRestore={restoreTask} onPurge={purgeTask} onEmpty={emptyTrash} />
          : selectedView === 'calendar' && !searching ? <CalendarPage
            tasks={data.tasks}
            lists={sortedLists}
            onOpenTask={setSelectedTaskId}
            onAddFocusDate={addFocusDate}
            onMoveFocusDate={moveFocusDate}
            onRemoveFocusDate={removeFocusDate}
            onSetFocusStatus={setFocusStatus}
            onAddTaskOnDay={addTaskOnDay}
            onAddTask={(title, listId) => { const target = listId ?? sortedLists[0]?.id; if (target) addTask(target, title); else setCreateListOpen(true) }}
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
            onRenameTask={(taskId, title) => updateTask(taskId, { title })}
            onRenameList={renameListById}
            onListMenu={openListMenu}
            onMoveTask={moveTask}
            onReorderTask={searching ? undefined : selectedView === 'today' ? reorderToday : selectedView === 'starred' ? reorderStarred : undefined}
            onMoveList={moveList}
            onCreateList={() => setCreateListOpen(true)}
          />}
      </section>

      {selectedTask && <><button className="panel-scrim" onClick={() => setSelectedTaskId(null)} aria-label="Close details" /><TaskPanel task={selectedTask} lists={sortedLists} onUpdate={(patch) => {
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
  )
}

export default App
