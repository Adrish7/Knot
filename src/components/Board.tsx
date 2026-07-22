import { CheckCircle2, CircleDashed, Inbox, MoreHorizontal, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { SortMode, Task, TaskList } from '../types'
import { QuickAdd } from './QuickAdd'
import { TaskItem, type DropEdge } from './TaskItem'

interface BoardProps {
  mode: 'board' | 'list' | 'smart'
  lists: TaskList[]
  tasks: Task[]
  activeListId: string | null
  sortMode: SortMode
  quickAddListId: string | null
  onQuickAddList: (listId: string | null) => void
  onAddTask: (listId: string, title: string, openDetails?: boolean) => void
  onOpenTask: (taskId: string) => void
  onCompleteTask: (taskId: string, completed: boolean) => void
  onToggleSubtask: (taskId: string, subtaskId: string) => void
  onStarTask: (taskId: string) => void
  onDeleteTask: (taskId: string) => void
  onRenameTask: (taskId: string, title: string) => void
  onRenameList: (listId: string, name: string) => void
  onListMenu: (list: TaskList, anchor: HTMLElement) => void
  onMoveTask: (taskId: string, targetListId: string, beforeTaskId?: string) => void
  onCreateList: () => void
}

function sortTasks(tasks: Task[], mode: SortMode) {
  return [...tasks].sort((a, b) => {
    if (mode === 'date') {
      if (!a.dueAt && !b.dueAt) return a.sortOrder - b.sortOrder
      if (!a.dueAt) return 1
      if (!b.dueAt) return -1
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
    }
    if (mode === 'starred' && a.starred !== b.starred) return a.starred ? -1 : 1
    return a.sortOrder - b.sortOrder
  })
}

export function Board(props: BoardProps) {
  const [draggedTask, setDraggedTask] = useState<string | null>(null)
  const { mode, lists, tasks, activeListId, sortMode } = props

  const grouped = useMemo(() => new Map(lists.map((list) => [list.id, sortTasks(tasks.filter((task) => task.listId === list.id), sortMode)])), [lists, tasks, sortMode])

  const startDrag = (event: React.DragEvent, taskId: string) => {
    setDraggedTask(taskId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', taskId)
  }

  const finishDrag = () => setDraggedTask(null)

  const dropAtTask = (event: React.DragEvent, targetTask: Task, edge: DropEdge) => {
    event.preventDefault()
    event.stopPropagation()
    const taskId = draggedTask || event.dataTransfer.getData('text/plain')
    if (!taskId || taskId === targetTask.id) {
      setDraggedTask(null)
      return
    }

    const targetTasks = sortTasks(
      tasks.filter((task) => task.listId === targetTask.listId && !task.completed && task.id !== taskId),
      'manual',
    )
    const targetIndex = targetTasks.findIndex((task) => task.id === targetTask.id)
    const insertionIndex = targetIndex + (edge === 'after' ? 1 : 0)
    const beforeTaskId = targetTasks[insertionIndex]?.id
    props.onMoveTask(taskId, targetTask.listId, beforeTaskId)
    setDraggedTask(null)
  }

  const dropInto = (event: React.DragEvent, listId: string, beforeTaskId?: string) => {
    event.preventDefault()
    const taskId = draggedTask || event.dataTransfer.getData('text/plain')
    if (taskId) props.onMoveTask(taskId, listId, beforeTaskId)
    setDraggedTask(null)
  }

  if (mode === 'board') {
    return (
      <main className="content-area board-scroll">
        <div className="board-canvas">
          {lists.map((list) => {
            const open = grouped.get(list.id) ?? []
            return (
              <section className={`list-card ${draggedTask ? 'is-drop-target' : ''}`} key={list.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropInto(event, list.id)}>
                <header className="list-card-header">
                  <div><span className="color-orb" style={{ background: list.color, color: list.color }} /><EditableListName list={list} onRename={props.onRenameList} /><span className="card-count">{open.length}</span></div>
                  <button className="icon-button small" aria-label={`Options for ${list.name}`} aria-haspopup="menu" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); props.onListMenu(list, event.currentTarget) }}><MoreHorizontal size={16} /></button>
                </header>
                <QuickAdd expanded={props.quickAddListId === list.id} onExpand={() => props.onQuickAddList(list.id)} onCancel={() => props.onQuickAddList(null)} onAdd={(title, openDetails) => props.onAddTask(list.id, title, openDetails)} />
                <div className="task-stack">
                  {open.map((task) => <TaskItem key={task.id} task={task} onOpen={props.onOpenTask} onComplete={props.onCompleteTask} onToggleSubtask={props.onToggleSubtask} onStar={props.onStarTask} onDelete={props.onDeleteTask} onRename={props.onRenameTask} onDragStart={sortMode === 'manual' ? startDrag : undefined} onDragEnd={finishDrag} dragActive={Boolean(draggedTask)} canDrop={Boolean(draggedTask && draggedTask !== task.id)} onDropAt={(event, _targetId, edge) => dropAtTask(event, task, edge)} />)}
                  {open.length === 0 && <div className="mini-empty"><CheckCircle2 size={19} /><span>All clear</span></div>}
                </div>
              </section>
            )
          })}
          <button className="new-list-card" onClick={props.onCreateList}><span><Plus size={20} /></span><strong>New list</strong></button>
        </div>
      </main>
    )
  }

  const activeList = activeListId ? lists.find((list) => list.id === activeListId) : null
  const selected = sortTasks(tasks, sortMode)
  const open = selected.filter((task) => !task.completed)
  const complete = selected.filter((task) => task.completed)
  const defaultListId = activeList?.id ?? lists[0]?.id

  return (
    <main className="content-area focus-scroll">
      <section className="focus-sheet">
        <div className="focus-summary">
          <div className="summary-mark" style={{ '--summary-color': activeList?.color ?? '#778b72' } as React.CSSProperties}><Inbox size={22} /></div>
          <div>
            <span>{open.length === 0 ? 'All done' : `${open.length} open ${open.length === 1 ? 'task' : 'tasks'}`}</span>
          </div>
        </div>

        {defaultListId && mode === 'list' && <QuickAdd expanded={props.quickAddListId === defaultListId} onExpand={() => props.onQuickAddList(defaultListId)} onCancel={() => props.onQuickAddList(null)} onAdd={(title, openDetails) => props.onAddTask(defaultListId, title, openDetails)} />}

        <div className="focus-tasks" onDragOver={(event) => event.preventDefault()} onDrop={(event) => defaultListId && dropInto(event, defaultListId)}>
          {open.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              listName={mode === 'smart' ? lists.find((list) => list.id === task.listId)?.name : undefined}
              onOpen={props.onOpenTask}
              onComplete={props.onCompleteTask}
              onToggleSubtask={props.onToggleSubtask}
              onStar={props.onStarTask} onDelete={props.onDeleteTask}
              onRename={props.onRenameTask}
              onDragStart={sortMode === 'manual' && mode === 'list' ? startDrag : undefined}
              onDragEnd={finishDrag}
              dragActive={Boolean(draggedTask)}
              canDrop={Boolean(draggedTask && draggedTask !== task.id)}
              onDropAt={(event, _targetId, edge) => dropAtTask(event, task, edge)}
            />
          ))}
        </div>

        {open.length === 0 && (
          <div className="large-empty">
            <div className="empty-rings"><CircleDashed /><CheckCircle2 /></div>
            <h2>All clear</h2>
            <p>{mode === 'list' ? 'No tasks in this list yet.' : 'No tasks match this view.'}</p>
            {mode === 'list' && defaultListId && <button onClick={() => props.onQuickAddList(defaultListId)}><Plus size={16} />Add a task</button>}
          </div>
        )}

        {complete.length > 0 && (
          <div className="focus-completed">
            <div className="focus-section-label"><span>Completed</span><span>{complete.length}</span></div>
            {complete.map((task) => <TaskItem compact key={task.id} task={task} listName={mode === 'smart' ? lists.find((list) => list.id === task.listId)?.name : undefined} onOpen={props.onOpenTask} onComplete={props.onCompleteTask} onToggleSubtask={props.onToggleSubtask} onStar={props.onStarTask} onDelete={props.onDeleteTask} onRename={props.onRenameTask} />)}
          </div>
        )}
      </section>
    </main>
  )
}

function EditableListName({ list, onRename }: { list: TaskList; onRename: (listId: string, name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(list.name)

  const finish = () => {
    const name = draft.trim()
    setEditing(false)
    setDraft(name || list.name)
    if (name && name !== list.name) onRename(list.id, name)
  }

  if (editing) {
    return (
      <input
        className="list-card-name-input"
        value={draft}
        maxLength={120}
        autoFocus
        aria-label="List name"
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={finish}
        onKeyDown={(event) => {
          if (event.key === 'Enter') finish()
          if (event.key === 'Escape') {
            setDraft(list.name)
            setEditing(false)
          }
        }}
      />
    )
  }

  return <h2 onDoubleClick={() => { setDraft(list.name); setEditing(true) }} title="Double-click to edit">{list.name}</h2>
}
