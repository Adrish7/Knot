import { CheckCircle2, FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Board } from './components/Board'
import { Completed } from './components/Completed'
import { Header } from './components/Header'
import { ConfirmModal, CreateListModal, RenameListModal } from './components/Modal'
import { Sidebar } from './components/Sidebar'
import { TaskPanel } from './components/TaskPanel'
import { Trash } from './components/Trash'
import { createSeedData, createTask, nextOccurrence, normalizeData, palette, uid } from './data'
import { isToday } from './format'
import type { DeletedTask, KnotData, Task, TaskList, ThemeMode, ViewId } from './types'

const STORAGE_KEY = 'knot.desktop.data'

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
  const [updating, setUpdating] = useState(false)
  const [clockTick, setClockTick] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)

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
    const applyTheme = () => {
      const mode = data.preferences.theme
      const resolved = mode === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode
      document.documentElement.dataset.theme = resolved
      document.documentElement.style.colorScheme = resolved
      window.knot?.setTheme(mode).catch(() => showToast('Could not update the app theme.'))
    }
    applyTheme()
    const media = matchMedia('(prefers-color-scheme: dark)')
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
        const selectedId = selectedView.startsWith('list:') ? selectedView.slice(5) : data.lists[0]?.id
        if (selectedId) setQuickAddListId(selectedId)
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

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast((current) => current === message ? null : current), 2600)
  }

  const sortedLists = useMemo(() => [...data.lists].sort((a, b) => a.sortOrder - b.sortOrder), [data.lists])
  const selectedTask = data.tasks.find((task) => task.id === selectedTaskId) ?? null

  const displayedTasks = useMemo(() => {
    const needle = query.trim().toLowerCase()
    let tasks = data.tasks
    if (needle) return tasks.filter((task) => `${task.title} ${task.notes} ${task.subtasks.map((item) => item.title).join(' ')}`.toLowerCase().includes(needle))
    tasks = tasks.filter((task) => !task.completed)
    if (selectedView === 'today') tasks = tasks.filter((task) => isToday(task.dueAt))
    else if (selectedView === 'starred') tasks = tasks.filter((task) => task.starred)
    else if (selectedView.startsWith('list:')) tasks = tasks.filter((task) => task.listId === selectedView.slice(5))
    return tasks
  }, [clockTick, data.tasks, query, selectedView])

  const completedTasks = useMemo(() => data.tasks.filter((task) => task.completed), [data.tasks])
  const searching = Boolean(query.trim())
  const activeListId = selectedView.startsWith('list:') ? selectedView.slice(5) : null
  const activeList = sortedLists.find((list) => list.id === activeListId)
  const openDisplayed = displayedTasks.filter((task) => !task.completed).length
  const openCountLabel = openDisplayed === 0 ? 'All done' : `${openDisplayed} open ${openDisplayed === 1 ? 'task' : 'tasks'}`
  const page = selectedView === 'completed'
    ? { title: 'Completed', eyebrow: `${completedTasks.length} ${completedTasks.length === 1 ? 'task' : 'tasks'}`, mode: 'smart' as const }
    : selectedView === 'trash'
    ? { title: 'Recently deleted', eyebrow: `${data.trash.length} ${data.trash.length === 1 ? 'task' : 'tasks'}`, mode: 'smart' as const }
    : searching
    ? { title: 'Search', eyebrow: `${displayedTasks.length} ${displayedTasks.length === 1 ? 'result' : 'results'}`, mode: 'smart' as const }
    : selectedView === 'all'
      ? { title: 'All tasks', eyebrow: greeting(), mode: 'board' as const }
      : selectedView === 'today'
        ? { title: 'Today', eyebrow: new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()), mode: 'smart' as const }
        : selectedView === 'starred'
          ? { title: 'Starred', eyebrow: openCountLabel, mode: 'smart' as const }
          : { title: activeList?.name ?? 'List', eyebrow: openCountLabel, mode: 'list' as const }

  const updatePreferences = (patch: Partial<KnotData['preferences']>) => setData((current) => ({ ...current, preferences: { ...current.preferences, ...patch } }))

  const addList = (name: string, color: string) => {
    const list: TaskList = { id: uid('list'), name, color, createdAt: new Date().toISOString(), sortOrder: data.lists.length }
    setData((current) => ({ ...current, lists: [...current.lists, list] }))
    setSelectedView(`list:${list.id}`)
    setCreateListOpen(false)
    showToast(`${name} created`)
  }

  const addTask = (listId: string, title: string, openDetails = false) => {
    const order = data.tasks.filter((task) => task.listId === listId).length
    const task = createTask(listId, title, order)
    setData((current) => ({ ...current, tasks: [...current.tasks, task] }))
    if (openDetails) {
      setSelectedTaskId(task.id)
      setQuickAddListId(null)
    }
    showToast('Task added')
  }

  const updateTask = (taskId: string, patch: Partial<Task>) => setData((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === taskId ? { ...task, ...patch } : task) }))

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

  const installUpdate = async () => {
    if (!window.knot?.installUpdate) {
      showToast('Updates are available from the installed Mac app.')
      return
    }
    setUpdating(true)
    try {
      const result = await window.knot.installUpdate()
      showToast(result.message)
      if (!result.ok) setUpdating(false)
    } catch {
      setUpdating(false)
      showToast('The update could not be installed.')
    }
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
          const next: Task = { ...source, id: uid('task'), dueAt: nextDue, reminderAt: nextReminder, completed: false, completedAt: null, createdAt: new Date().toISOString(), sortOrder: tasks.filter((task) => task.listId === source.listId).length, subtasks: source.subtasks.map((item) => ({ ...item, id: uid('subtask'), completed: false })) }
          tasks.push(next)
        }
      }
      return { ...current, tasks }
    })
    showToast(completed ? 'Moved to Completed' : 'Task reopened')
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
      if (!lists.some((list) => list.id === listId)) {
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

  const moveTask = (taskId: string, targetListId: string, beforeTaskId?: string) => {
    setData((current) => {
      const moving = current.tasks.find((task) => task.id === taskId)
      if (!moving) return current
      const sourceListId = moving.listId
      const targetPeers = current.tasks
        .filter((task) => task.listId === targetListId && task.completed === moving.completed && task.id !== taskId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
      const rawIndex = beforeTaskId ? targetPeers.findIndex((task) => task.id === beforeTaskId) : targetPeers.length
      const index = rawIndex < 0 ? targetPeers.length : rawIndex
      targetPeers.splice(index, 0, { ...moving, listId: targetListId })

      const targetOrder = new Map(targetPeers.map((task, position) => [task.id, position]))
      const sourcePeers = sourceListId === targetListId
        ? []
        : current.tasks.filter((task) => task.listId === sourceListId && task.completed === moving.completed && task.id !== taskId).sort((a, b) => a.sortOrder - b.sortOrder)
      const sourceOrder = new Map(sourcePeers.map((task, position) => [task.id, position]))

      return {
        ...current,
        tasks: current.tasks.map((task) => {
          if (task.id === taskId) return { ...task, listId: targetListId, sortOrder: targetOrder.get(task.id) ?? index }
          if (task.completed === moving.completed && task.listId === targetListId) return { ...task, sortOrder: targetOrder.get(task.id) ?? task.sortOrder }
          if (task.completed === moving.completed && sourceListId !== targetListId && task.listId === sourceListId) return { ...task, sortOrder: sourceOrder.get(task.id) ?? task.sortOrder }
          return task
        }),
      }
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

  const cycleTheme = () => {
    const order: ThemeMode[] = ['system', 'light', 'dark']
    const next = order[(order.indexOf(data.preferences.theme) + 1) % order.length]
    updatePreferences({ theme: next })
    showToast(next === 'system' ? 'Theme follows your Mac' : `${next[0].toUpperCase()}${next.slice(1)} theme`)
  }

  const openListMenu = (list: TaskList, anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect()
    const width = 172
    const height = 132
    const x = Math.max(8, Math.min(rect.right + 4, window.innerWidth - width - 8))
    const y = Math.max(8, Math.min(rect.top, window.innerHeight - height - 8))
    setListMenu((current) => current?.list.id === list.id ? null : { list, x, y })
  }

  if (!hydrated) return <div className="splash"><img src="./icon.png" alt="Knot" /><span>Loading…</span></div>

  return (
    <div className={`app-shell ${data.preferences.sidebarCollapsed ? 'sidebar-collapsed' : ''}`} onMouseDown={() => listMenu && setListMenu(null)}>
      <Sidebar
        collapsed={data.preferences.sidebarCollapsed}
        lists={sortedLists}
        tasks={data.tasks}
        selectedView={selectedView}
        completedCount={completedTasks.length}
        trashCount={data.trash.length}
        launchAtLogin={data.preferences.launchAtLogin}
        onSelect={(view) => { setSelectedView(view); setQuery(''); setQuickAddListId(null) }}
        onCreateList={() => setCreateListOpen(true)}
        onListMenu={openListMenu}
        onRenameList={renameListById}
        onToggle={() => updatePreferences({ sidebarCollapsed: !data.preferences.sidebarCollapsed })}
        onLaunchAtLogin={(launchAtLogin) => { updatePreferences({ launchAtLogin }); showToast(launchAtLogin ? 'Knot will open when you log in' : 'Open at login turned off') }}
        onUpdate={installUpdate}
        updating={updating}
      />
      <section className="workspace">
        <Header title={page.title} eyebrow={page.eyebrow} query={query} sortMode={data.preferences.sortMode} theme={data.preferences.theme} onQuery={(value) => { setQuery(value); if (value.trim() && (selectedView === 'trash' || selectedView === 'completed')) setSelectedView('all') }} onSort={(sortMode) => updatePreferences({ sortMode })} onTheme={cycleTheme} onRenameTitle={!searching && activeList ? (name) => renameListById(activeList.id, name) : undefined} searchRef={searchRef} />
        {selectedView === 'completed' ? <Completed tasks={completedTasks} lists={sortedLists} onOpen={setSelectedTaskId} onReopen={(taskId) => completeTask(taskId, false)} onDelete={deleteTask} onClear={clearCompleted} />
          : selectedView === 'trash' ? <Trash entries={data.trash} onRestore={restoreTask} onPurge={purgeTask} onEmpty={emptyTrash} /> : <Board
          mode={page.mode}
          lists={sortedLists}
          tasks={displayedTasks}
          activeListId={activeListId}
          sortMode={data.preferences.sortMode}
          quickAddListId={quickAddListId}
          onQuickAddList={setQuickAddListId}
          onAddTask={addTask}
          onOpenTask={setSelectedTaskId}
          onCompleteTask={completeTask}
          onToggleSubtask={toggleSubtask}
          onStarTask={(taskId) => { const task = data.tasks.find((item) => item.id === taskId); if (task) updateTask(taskId, { starred: !task.starred }) }}
          onDeleteTask={deleteTask}
          onRenameTask={(taskId, title) => updateTask(taskId, { title })}
          onRenameList={renameListById}
          onListMenu={openListMenu}
          onMoveTask={moveTask}
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
          <button role="menuitem" onClick={() => { setSelectedView(`list:${listMenu.list.id}`); setQuery(''); setQuickAddListId(null); setListMenu(null) }}><FolderOpen size={14} />Open list</button>
          <span />
          <button role="menuitem" className="danger" onClick={() => deleteList(listMenu.list)}><Trash2 size={14} />Delete list</button>
        </div>
      )}

      {toast && <div className="toast"><CheckCircle2 size={16} />{toast}</div>}
      {selectedView !== 'trash' && selectedView !== 'completed' && <button className="floating-add" onClick={() => { const listId = activeListId ?? sortedLists[0]?.id; if (listId) setQuickAddListId(listId); else setCreateListOpen(true) }}><Plus size={20} /><span>New task</span><kbd>⌘N</kbd></button>}
    </div>
  )
}

function makeTrashEntry(task: Task, lists: TaskList[]): DeletedTask {
  return { task, listName: lists.find((list) => list.id === task.listId)?.name ?? 'Untitled list', deletedAt: new Date().toISOString() }
}

function greeting() {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

export default App
