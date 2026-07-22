import { Bell, Calendar, CalendarDays, Check, ChevronDown, ChevronRight, GripVertical, ListTree, Repeat2, Star, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { completedSubtasks, formatDayKey, formatDue, isOverdue, todayKey } from '../format'
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

  useEffect(() => {
    if (!editingTitle) setDraftTitle(task.title)
  }, [editingTitle, task.title])

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

  const draggable = Boolean(onDragStart) && !task.completed && !editingTitle && !suppressDrag

  return (
    <article
      className={`task-item ${task.completed ? 'is-completed' : ''} ${compact ? 'is-compact' : ''} ${draggable ? 'is-draggable' : ''} ${dragging ? 'is-dragging' : ''} ${dropEdge ? `drop-${dropEdge}` : ''}`}
      data-task-id={task.id}
      draggable={draggable}
      onMouseDownCapture={(event) => {
        // A press on a control must never start a row drag: the drag would swallow the click.
        setSuppressDrag(event.target instanceof Element && Boolean(event.target.closest('button, input, textarea, select')))
      }}
      onClick={(event) => {
        if (editingTitle || dragging) return
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
      <button className="task-check" onClick={(event) => { event.stopPropagation(); onComplete(task.id, !task.completed) }} aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}>
        <span>{task.completed && <Check size={13} strokeWidth={3} />}</span>
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
            {task.dueAt && <span className={isOverdue(task) ? 'overdue' : ''}><Calendar size={12} />{formatDue(task.dueAt)}</span>}
            {!task.completed && task.focusDates.length > 0 && (
              <span title={task.focusDates.length === 1 ? 'Focus day' : `${task.focusDates.length} focus days`}>
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
      {onSetDue && !task.completed && (
        <span className="task-date-field">
          <DateTimePicker iconTrigger value={task.dueAt} placeholder="Add a date" onChange={(dueAt) => onSetDue(task.id, dueAt)} />
        </span>
      )}
      <button className={`star-button ${task.starred ? 'is-starred' : ''}`} onClick={(event) => { event.stopPropagation(); onStar(task.id) }} aria-label={task.starred ? 'Remove star' : 'Add star'}>
        <Star size={15} fill={task.starred ? 'currentColor' : 'none'} />
      </button>
      <button className="delete-button" onClick={(event) => { event.stopPropagation(); onDelete(task.id) }} aria-label={`Delete ${task.title}`} title="Delete task">
        <Trash2 size={15} />
      </button>
      <button className="task-chevron" onClick={(event) => { event.stopPropagation(); onOpen(task.id) }} aria-label={`Open details for ${task.title}`}><ChevronRight size={15} /></button>
    </article>
  )
}
