import { CheckCircle2, MoreHorizontal, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { SortMode, Task, TaskList } from '../types'
import { ListRing, listProgress } from './ListRing'
import { QuickAdd } from './QuickAdd'
import { TaskItem, type DropEdge } from './TaskItem'

interface BoardProps {
  mode: 'board' | 'list' | 'smart'
  lists: TaskList[]
  tasks: Task[]
  activeListId: string | null
  doneCounts: Record<string, number>
  emptyIcon?: React.ReactNode
  sortMode: SortMode
  quickAddListId: string | null
  quickAddEnabled: boolean
  onQuickAddList: (listId: string | null) => void
  onAddTask: (listId: string, title: string, openDetails?: boolean) => void
  onOpenTask: (taskId: string) => void
  onCompleteTask: (taskId: string, completed: boolean) => void
  onToggleSubtask: (taskId: string, subtaskId: string) => void
  onStarTask: (taskId: string) => void
  onDeleteTask: (taskId: string) => void
  onSetDueTask: (taskId: string, dueAt: string | null) => void
  onRenameTask: (taskId: string, title: string) => void
  onRenameList: (listId: string, name: string) => void
  onListMenu: (list: TaskList, anchor: HTMLElement) => void
  onMoveTask: (taskId: string, targetListId: string, beforeTaskId?: string) => void
  onReorderTask?: (taskId: string, beforeTaskId: string | null) => void // smart pages with their own manual order
  onMoveList: (listId: string, beforeListId?: string) => void
  onCreateList: () => void
}

// Drop-target key for smart pages (Today, Starred), which reorder within the page instead of a list.
const VIEW_DROP_KEY = 'view'

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
  const [dropHint, setDropHint] = useState<{ listId: string; beforeTaskId: string | null } | null>(null)
  const { mode, lists, tasks, activeListId, sortMode } = props

  const grouped = useMemo(() => new Map(lists.map((list) => [list.id, sortTasks(tasks.filter((task) => task.listId === list.id), sortMode)])), [lists, tasks, sortMode])

  const startDrag = (event: React.DragEvent, taskId: string) => {
    setDraggedTask(taskId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', taskId)
  }

  const finishDrag = () => {
    setDraggedTask(null)
    setDropHint(null)
  }

  // The task the cursor would insert before: the first task (skipping the dragged one)
  // whose vertical midpoint is below the cursor. Null means "append at the end".
  const findBeforeTask = (container: HTMLElement, clientY: number, taskId: string) => {
    for (const item of container.querySelectorAll<HTMLElement>('.task-item[data-task-id]')) {
      const id = item.dataset.taskId
      if (!id || id === taskId) continue
      const bounds = item.getBoundingClientRect()
      if (clientY < bounds.top + bounds.height / 2) return id
    }
    return null
  }

  const dragOverList = (event: React.DragEvent, listId: string) => {
    if (!draggedTask) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const beforeTaskId = findBeforeTask(event.currentTarget as HTMLElement, event.clientY, draggedTask)
    setDropHint((current) => current?.listId === listId && current.beforeTaskId === beforeTaskId ? current : { listId, beforeTaskId })
  }

  const dragLeaveList = (event: React.DragEvent, listId: string) => {
    const nextTarget = event.relatedTarget
    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
      setDropHint((current) => current?.listId === listId ? null : current)
    }
  }

  const dropOnList = (event: React.DragEvent, listId: string) => {
    event.preventDefault()
    const taskId = draggedTask || event.dataTransfer.getData('text/plain')
    if (taskId) {
      const beforeTaskId = findBeforeTask(event.currentTarget as HTMLElement, event.clientY, taskId)
      if (listId === VIEW_DROP_KEY) props.onReorderTask?.(taskId, beforeTaskId)
      else props.onMoveTask(taskId, listId, beforeTaskId ?? undefined)
    }
    finishDrag()
  }

  // Which edge of this task the guide line sits on, given the current drop hint.
  const edgeFor = (listId: string, open: Task[], task: Task): DropEdge | null => {
    if (!dropHint || dropHint.listId !== listId) return null
    if (dropHint.beforeTaskId === task.id) return 'before'
    if (dropHint.beforeTaskId === null) {
      const last = [...open].reverse().find((item) => item.id !== draggedTask)
      if (last?.id === task.id) return 'after'
    }
    return null
  }

  const showEmptyDropLine = (listId: string, open: Task[]) => dropHint?.listId === listId && open.every((task) => task.id === draggedTask)

  const [draggedList, setDraggedList] = useState<string | null>(null)
  const [listHint, setListHint] = useState<{ listId: string; edge: 'left' | 'right' } | null>(null)

  const finishListDrag = () => {
    setDraggedList(null)
    setListHint(null)
  }

  const startListDrag = (event: React.DragEvent, listId: string) => {
    // A press on the header's menu button or rename input must not pick up the column.
    if (event.target instanceof Element && event.target.closest('button, input')) {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/knot-list', listId)
    setDraggedList(listId)
  }

  const dragOverColumn = (event: React.DragEvent, listId: string) => {
    if (!draggedList) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (draggedList === listId) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const edge = event.clientX < bounds.left + bounds.width / 2 ? 'left' : 'right'
    setListHint((current) => current?.listId === listId && current.edge === edge ? current : { listId, edge })
  }

  const dragLeaveColumn = (event: React.DragEvent, listId: string) => {
    const nextTarget = event.relatedTarget
    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
      setListHint((current) => current?.listId === listId ? null : current)
    }
  }

  const dropOnColumn = (event: React.DragEvent, listId: string) => {
    if (!draggedList) return
    event.preventDefault()
    event.stopPropagation()
    const ordered = lists.filter((list) => list.id !== draggedList)
    const index = ordered.findIndex((list) => list.id === listId)
    if (index >= 0) {
      const bounds = event.currentTarget.getBoundingClientRect()
      const insertion = index + (event.clientX < bounds.left + bounds.width / 2 ? 0 : 1)
      props.onMoveList(draggedList, ordered[insertion]?.id)
    }
    finishListDrag()
  }

  const dropOnCanvas = (event: React.DragEvent) => {
    if (!draggedList) return
    event.preventDefault()
    const columns = [...event.currentTarget.querySelectorAll<HTMLElement>('.board-column')]
    const before = columns.find((column) => column.dataset.listId !== draggedList && event.clientX < column.getBoundingClientRect().left + column.getBoundingClientRect().width / 2)
    props.onMoveList(draggedList, before?.dataset.listId)
    finishListDrag()
  }

  if (mode === 'board') {
    return (
      <main className="content-area board-scroll">
        <div className="board-canvas" onDragOver={(event) => { if (draggedList) event.preventDefault() }} onDrop={dropOnCanvas}>
          {lists.map((list) => {
            const open = grouped.get(list.id) ?? []
            return (
              <div
                key={list.id}
                className={`board-column ${draggedList === list.id ? 'is-dragging-column' : ''} ${listHint?.listId === list.id ? `drop-${listHint.edge}` : ''}`}
                data-list-id={list.id}
                onDragOver={(event) => dragOverColumn(event, list.id)}
                onDragLeave={(event) => dragLeaveColumn(event, list.id)}
                onDrop={(event) => dropOnColumn(event, list.id)}
              >
              <section className={`list-card is-accented ${dropHint?.listId === list.id ? 'is-drop-target' : ''}`} style={{ '--list-accent': list.color } as React.CSSProperties} onDragOver={(event) => dragOverList(event, list.id)} onDragLeave={(event) => dragLeaveList(event, list.id)} onDrop={(event) => dropOnList(event, list.id)}>
                <header className="list-card-header" draggable={!draggedTask} onDragStart={(event) => startListDrag(event, list.id)} onDragEnd={finishListDrag}>
                  <div><ListRing color={list.color} progress={listProgress(open.length, props.doneCounts[list.id] ?? 0)} /><EditableListName list={list} onRename={props.onRenameList} /><span className="card-count">{open.length}</span></div>
                  <button className="icon-button small" aria-label={`Options for ${list.name}`} aria-haspopup="menu" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); props.onListMenu(list, event.currentTarget) }}><MoreHorizontal size={16} /></button>
                </header>
                <QuickAdd expanded={props.quickAddListId === list.id} onExpand={() => props.onQuickAddList(list.id)} onCancel={() => props.onQuickAddList(null)} onAdd={(title, openDetails) => props.onAddTask(list.id, title, openDetails)} />
                <div className="task-stack">
                  {open.map((task) => <TaskItem key={task.id} task={task} onOpen={props.onOpenTask} onComplete={props.onCompleteTask} onToggleSubtask={props.onToggleSubtask} onStar={props.onStarTask} onDelete={props.onDeleteTask} onSetDue={props.onSetDueTask} onRename={props.onRenameTask} onDragStart={sortMode === 'manual' ? startDrag : undefined} onDragEnd={finishDrag} dropEdge={edgeFor(list.id, open, task)} />)}
                  {showEmptyDropLine(list.id, open) && <div className="drop-line" />}
                  {open.length === 0 && <div className="mini-empty"><CheckCircle2 size={19} /><span>All clear</span></div>}
                </div>
              </section>
              </div>
            )
          })}
          <button className="new-list-card" onClick={props.onCreateList}><span><Plus size={16} /></span>New list</button>
        </div>
      </main>
    )
  }

  const activeList = activeListId ? lists.find((list) => list.id === activeListId) : null
  const reorderable = mode === 'smart' && Boolean(props.onReorderTask)
  // Smart pages arrive already in their own manual order; only re-sort them for the other modes.
  const selected = reorderable && sortMode === 'manual' ? tasks : sortTasks(tasks, sortMode)
  const open = selected.filter((task) => !task.completed)
  const complete = selected.filter((task) => task.completed)
  const defaultListId = activeList?.id ?? lists[0]?.id
  const dropKey = mode === 'list' ? defaultListId : reorderable ? VIEW_DROP_KEY : undefined
  const draggable = sortMode === 'manual' && (mode === 'list' || reorderable)

  return (
    <main className="content-area focus-scroll">
      <section className="focus-sheet">
        {defaultListId && props.quickAddEnabled && <QuickAdd expanded={props.quickAddListId === defaultListId} onExpand={() => props.onQuickAddList(defaultListId)} onCancel={() => props.onQuickAddList(null)} onAdd={(title, openDetails) => props.onAddTask(defaultListId, title, openDetails)} />}

        <div
          className="focus-tasks"
          onDragOver={(event) => dropKey && dragOverList(event, dropKey)}
          onDragLeave={(event) => dropKey && dragLeaveList(event, dropKey)}
          onDrop={(event) => dropKey && dropOnList(event, dropKey)}
        >
          {open.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              listName={mode === 'smart' ? lists.find((list) => list.id === task.listId)?.name : undefined}
              onOpen={props.onOpenTask}
              onComplete={props.onCompleteTask}
              onToggleSubtask={props.onToggleSubtask}
              onStar={props.onStarTask} onDelete={props.onDeleteTask}
              onSetDue={props.onSetDueTask}
              onRename={props.onRenameTask}
              onDragStart={draggable ? startDrag : undefined}
              onDragEnd={finishDrag}
              dropEdge={dropKey ? edgeFor(dropKey, open, task) : null}
            />
          ))}
        </div>

        {open.length === 0 && (
          <div className="large-empty">
            <div className="empty-mark">{props.emptyIcon ?? <CheckCircle2 />}</div>
            <h2>{mode === 'list' ? 'No open tasks' : 'All clear'}</h2>
            <p>{mode === 'list' ? 'Add a task to this list, or move one here from the board.' : 'Nothing here right now.'}</p>
            {props.quickAddEnabled && defaultListId && <button onClick={() => props.onQuickAddList(defaultListId)}><Plus size={16} />Add a task</button>}
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
