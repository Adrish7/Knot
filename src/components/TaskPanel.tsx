import { Bell, CalendarClock, CalendarDays, Check, ChevronDown, Clock3, ListChecks, Plus, Repeat2, Star, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { uid } from '../data'
import { formatDayKey } from '../format'
import { DateTimePicker, FocusDayPicker } from './DateTimePicker'
import type { Recurrence, Task, TaskList } from '../types'

interface TaskPanelProps {
  task: Task
  lists: TaskList[]
  onUpdate: (patch: Partial<Task>) => void
  onComplete: (completed: boolean) => void
  onDelete: () => void
  onClose: () => void
}

export function TaskPanel({ task, lists, onUpdate, onComplete, onDelete, onClose }: TaskPanelProps) {
  const [newSubtask, setNewSubtask] = useState('')
  const listColor = lists.find((list) => list.id === task.listId)?.color
  const addSubtask = () => {
    if (!newSubtask.trim()) return
    onUpdate({ subtasks: [...task.subtasks, { id: uid('subtask'), title: newSubtask.trim(), completed: false }] })
    setNewSubtask('')
  }

  return (
    <aside className={`task-panel ${listColor ? 'is-accented' : ''}`} style={listColor ? { '--list-accent': listColor } as React.CSSProperties : undefined} aria-label="Task details">
      <div className="panel-topline">
        <button className={`panel-complete ${task.completed ? 'done' : ''}`} onClick={() => onComplete(!task.completed)}>
          <span>{task.completed && <Check size={14} strokeWidth={3} />}</span>{task.completed ? 'Completed' : 'Mark complete'}
        </button>
        <div>
          <button className={`icon-button ${task.starred ? 'is-starred' : ''}`} onClick={() => onUpdate({ starred: !task.starred })} aria-label="Star task"><Star size={17} fill={task.starred ? 'currentColor' : 'none'} /></button>
          <button className="icon-button" onClick={onClose} aria-label="Close details"><X size={18} /></button>
        </div>
      </div>

      <div className="panel-scroll">
        <textarea className="task-title-editor" value={task.title} rows={2} maxLength={500} onChange={(event) => onUpdate({ title: event.target.value })} onBlur={(event) => onUpdate({ title: event.currentTarget.value.trim() || 'Untitled task' })} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } }} aria-label="Task title" />
        <textarea className="task-notes-editor" value={task.notes} rows={4} maxLength={20_000} onChange={(event) => onUpdate({ notes: event.target.value })} placeholder="Add notes…" aria-label="Task notes" />

        <div className="detail-form">
          <label className="detail-row">
            <span><ListChecks size={16} />List</span>
            <span className="detail-input select-wrap"><select value={task.listId ?? ''} onChange={(event) => onUpdate({ listId: event.target.value || null })}>{task.listId === null && <option value="">Calendar only</option>}{lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select><ChevronDown size={14} /></span>
          </label>
          <div className="detail-row">
            <span><CalendarClock size={16} />Due</span>
            <DateTimePicker value={task.dueAt} placeholder="Add a date" onChange={(dueAt) => onUpdate({ dueAt })} />
          </div>
          <div className="detail-row">
            <span><CalendarDays size={16} />Focus days</span>
            <FocusDayPicker dates={task.focusDates} onChange={(focusDates) => onUpdate({ focusDates })} />
          </div>
          {task.focusDates.length > 0 && (
            <div className="focus-day-chips">
              {task.focusDates.map((day) => (
                <span className="focus-day-chip" key={day}>
                  {formatDayKey(day)}
                  <button onClick={() => onUpdate({ focusDates: task.focusDates.filter((item) => item !== day) })} aria-label={`Remove focus day ${formatDayKey(day)}`}><X size={11} /></button>
                </span>
              ))}
            </div>
          )}
          <div className="detail-row">
            <span><Bell size={16} />Remind me</span>
            <DateTimePicker value={task.reminderAt} placeholder="Add a reminder" onChange={(reminderAt) => onUpdate({ reminderAt })} />
          </div>
          <label className="detail-row">
            <span><Repeat2 size={16} />Repeat</span>
            <span className="detail-input select-wrap"><select value={task.recurrence} onChange={(event) => onUpdate({ recurrence: event.target.value as Recurrence })}><option value="none">Does not repeat</option><option value="daily">Every day</option><option value="weekdays">Every weekday</option><option value="weekly">Every week</option><option value="monthly">Every month</option><option value="yearly">Every year</option></select><ChevronDown size={14} /></span>
          </label>
        </div>

        <section className="subtasks-section">
          <div className="panel-section-title"><span>Subtasks</span><small>{task.subtasks.filter((item) => item.completed).length}/{task.subtasks.length}</small></div>
          <div className="subtask-list">
            {task.subtasks.map((subtask) => (
              <div className={`subtask ${subtask.completed ? 'done' : ''}`} key={subtask.id}>
                <button onClick={() => onUpdate({ subtasks: task.subtasks.map((item) => item.id === subtask.id ? { ...item, completed: !item.completed } : item) })} aria-label={subtask.completed ? `Mark ${subtask.title} incomplete` : `Complete ${subtask.title}`}><span>{subtask.completed && <Check size={11} strokeWidth={3} />}</span></button>
                <input value={subtask.title} aria-label="Subtask title" onChange={(event) => onUpdate({ subtasks: task.subtasks.map((item) => item.id === subtask.id ? { ...item, title: event.target.value } : item) })} onBlur={(event) => { if (!event.currentTarget.value.trim()) onUpdate({ subtasks: task.subtasks.filter((item) => item.id !== subtask.id) }) }} />
                <button className="subtask-delete" onClick={() => onUpdate({ subtasks: task.subtasks.filter((item) => item.id !== subtask.id) })} aria-label={`Delete ${subtask.title}`}><X size={13} /></button>
              </div>
            ))}
          </div>
          <form className="new-subtask" onSubmit={(event) => { event.preventDefault(); addSubtask() }}>
            <Plus size={15} /><input value={newSubtask} onChange={(event) => setNewSubtask(event.target.value)} placeholder="Add a subtask" aria-label="Add a subtask" />
          </form>
        </section>

        <div className="task-facts"><Clock3 size={13} />Created {new Date(task.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
      </div>

      <div className="panel-footer">
        <button className="delete-task" onClick={onDelete}><Trash2 size={15} />Delete task</button>
      </div>
    </aside>
  )
}
