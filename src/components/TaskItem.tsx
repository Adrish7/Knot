import { Bell, Calendar, CalendarDays, Check, ChevronDown, ChevronRight, GripVertical, ListTree, Repeat2, Star, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { completedSubtasks, formatDayKey, formatDue, isOverdue, isToday, todayKey } from '../format'
import { DateTimePicker } from './DateTimePicker'
import type { Task } from '../types'

export type DropEdge = 'before' | 'after'

interface TaskItemProps {
  task: Task
  compact?: boolean
  listName?: string
  onOpen: (taskId: string) => void
  onComplete: (taskId: string, completed: boolean) => void
  onToggleSubtask: (taskId: string, subtaskId: string) => void
  onStar: (taskId: string) => void
  onDelete: (taskId: string) => void
  onSetDue?: (taskId: string, dueAt: string | null) => void
  onRename?: (taskId: string, title: string) => void
  onDragStart?: (event: React.DragEvent, taskId: string) => void
  onDragEnd?: () => void
  dropEdge?: DropEdge | null
}

export function TaskItem({ task, compact, listName, onOpen, onComplete, onToggleSubtask, onStar, onDelete, onSetDue, onRename, onDragStart, onDragEnd, dropEdge }: TaskItemProps) {
  const subtaskCount = task.subtasks.length
  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState(task.title)
  const [dragging, setDragging] = useState(false)
  const [suppressDrag, setSuppressDrag] = useState(false)
  const [subtasksOpen, setSubtasksOpen] = useState(true)
  // Ticking a task animates in place (check pop, strike-through, row collapse) before the
  // state change removes the row. 'checking' plays the tick; 'vanishing' collapses the row.
  const [completePhase, setCompletePhase] = useState<'idle' | 'checking' | 'vanishing'>('idle')
  const [rowHeight, setRowHeight] = useState(0)
  const completeTimers = useRef<number[]>([])
  const rowRef = useRef<HTMLElement>(null)

  useEffect(() => () => completeTimers.current.forEach(clearTimeout), [])

  useEffect(() => {
    if (!editingTitle) setDraftTitle(task.title)
  }, [editingTitle, task.title])

  const toggleComplete = () => {
    if (task.completed) return onComplete(task.id, false)
    if (completePhase !== 'idle') {
      // Second click while animating: cancel before the change lands.
      completeTimers.current.forEach(clearTimeout)
      completeTimers.current = []
      setCompletePhase('idle')
      return
    }
    setRowHeight(rowRef.current?.offsetHeight ?? 0)
    setCompletePhase('checking')
    completeTimers.current = [
      window.setTimeout(() => setCompletePhase('vanishing'), 480),
      window.setTimeout(() => {
        setCompletePhase('idle')
        onComplete(task.id, true)
      }, 760),
    ]
  }

  const beginTitleEdit = (event: React.MouseEvent) => {
    if (!onRename) return
    event.preventDefault()
    event.stopPropagation()
    setDraftTitle(task.title)
    setEditingTitle(true)
  }

  const finishTitleEdit = () => {
    const title = draftTitle.trim()
    setEditingTitle(false)
    setDraftTitle(title || task.title)
    if (title && title !== task.title) onRename?.(task.id, title)
  }

  const draggable = Boolean(onDragStart) && !task.completed && !editingTitle && !suppressDrag && completePhase === 'idle'

  return (
    <article
      ref={rowRef}
      className={`task-item ${task.completed ? 'is-completed' : ''} ${completePhase !== 'idle' ? 'is-completing' : ''} ${completePhase === 'vanishing' ? 'is-vanishing' : ''} ${compact ? 'is-compact' : ''} ${draggable ? 'is-draggable' : ''} ${dragging ? 'is-dragging' : ''} ${dropEdge ? `drop-${dropEdge}` : ''}`}
      style={completePhase !== 'idle' ? { '--row-h': `${rowHeight}px` } as React.CSSProperties : undefined}
      data-task-id={task.id}
      draggable={draggable}
      onMouseDownCapture={(event) => {
        // A press on a control must never start a row drag: the drag would swallow the click.
        setSuppressDrag(event.target instanceof Element && Boolean(event.target.closest('button, input, textarea, select')))
      }}
      onClick={(event) => {
        if (editingTitle || dragging || completePhase !== 'idle') return
        if (event.target instanceof Element && event.target.closest('button, input, textarea, select')) return
        onOpen(task.id)
      }}
      onDragStart={(event) => {
        setDragging(true)
        onDragStart?.(event, task.id)
      }}
      onDragEnd={() => {
        setDragging(false)
        onDragEnd?.()
      }}
    >
      <GripVertical size={14} className="drag-handle" />
      <button className="task-check" onClick={(event) => { event.stopPropagation(); toggleComplete() }} aria-label={task.completed ? 'Mark incomplete' : completePhase !== 'idle' ? 'Cancel completing' : 'Mark complete'}>
        <span>{(task.completed || completePhase !== 'idle') && <Check size={13} strokeWidth={3} />}</span>
      </button>
      <div className="task-content">
        <div
          className="task-body"
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onOpen(task.id)
            }
          }}
        >
          {editingTitle ? (
            <input
              className="task-title-input"
              value={draftTitle}
              maxLength={500}
              autoFocus
              aria-label="Task title"
              onFocus={(event) => event.currentTarget.select()}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onChange={(event) => setDraftTitle(event.target.value)}
              onBlur={finishTitleEdit}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Enter') {
                  event.preventDefault()
                  finishTitleEdit()
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setDraftTitle(task.title)
                  setEditingTitle(false)
                }
              }}
            />
          ) : (
            <span className="task-title" onDoubleClick={beginTitleEdit} title={onRename ? 'Double-click to edit' : undefined}>{task.title}</span>
          )}
          {!compact && task.notes && <span className="task-notes">{task.notes}</span>}
          <span className="task-meta">
            {task.dueAt && <span className={isOverdue(task) ? 'overdue' : isToday(task.dueAt) ? 'is-due-today' : ''}><Calendar size={12} />{formatDue(task.dueAt)}</span>}
            {!task.completed && task.focusDates.length > 0 && (
              <span className="is-focus" title={task.focusDates.length === 1 ? 'Planned day' : `${task.focusDates.length} planned days`}>
                <CalendarDays size={12} />
                {formatDayKey(task.focusDates.find((day) => day >= todayKey()) ?? task.focusDates[task.focusDates.length - 1])}
                {task.focusDates.length > 1 && ` +${task.focusDates.length - 1}`}
              </span>
            )}
            {task.reminderAt && <span title="Reminder set"><Bell size={12} /></span>}
            {task.recurrence !== 'none' && <span title={`Repeats ${task.recurrence}`}><Repeat2 size={12} />{task.recurrence}</span>}
            {subtaskCount > 0 && (
              <button
                className="subtask-toggle"
                aria-expanded={subtasksOpen}
                aria-label={`${subtasksOpen ? 'Hide' : 'Show'} subtasks for ${task.title}`}
                title={subtasksOpen ? 'Hide subtasks' : 'Show subtasks'}
                onClick={(event) => { event.stopPropagation(); setSubtasksOpen((open) => !open) }}
              >
                <ListTree size={12} />{completedSubtasks(task)}/{subtaskCount}
                {subtasksOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              </button>
            )}
            {listName && <span className="task-list-label">{listName}</span>}
          </span>
        </div>
        {subtaskCount > 0 && subtasksOpen && (
          <div className="inline-subtasks" aria-label={`Subtasks for ${task.title}`}>
            {task.subtasks.map((subtask) => (
              <button
                className={`inline-subtask ${subtask.completed ? 'is-done' : ''}`}
                key={subtask.id}
                aria-pressed={subtask.completed}
                onClick={(event) => { event.stopPropagation(); onToggleSubtask(task.id, subtask.id) }}
              >
                <span className="inline-subtask-check">{subtask.completed && <Check size={9} strokeWidth={3} />}</span>
                <span>{subtask.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="task-actions">
        {onSetDue && !task.completed && (
          <DateTimePicker iconTrigger value={task.dueAt} placeholder="Set a due date" onChange={(dueAt) => onSetDue(task.id, dueAt)} />
        )}
        <button className={`star-button ${task.starred ? 'is-starred' : ''}`} onClick={(event) => { event.stopPropagation(); onStar(task.id) }} aria-label={task.starred ? 'Remove star' : 'Star task'} title={task.starred ? 'Remove star' : 'Star'}>
          <Star size={15} fill={task.starred ? 'currentColor' : 'none'} />
        </button>
        <button className="delete-button" onClick={(event) => { event.stopPropagation(); onDelete(task.id) }} aria-label={`Delete ${task.title}`} title="Delete">
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  )
}
