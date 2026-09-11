import { CheckCircle2, Clock3, RotateCcw, Trash2 } from 'lucide-react'
import { timeAgo } from '../format'
import type { Task, TaskList } from '../types'

interface CompletedProps {
  tasks: Task[]
  lists: TaskList[]
  onOpen: (taskId: string) => void
  onReopen: (taskId: string) => void
  onDelete: (taskId: string) => void
  onClear: () => void
}

export function Completed({ tasks, lists, onOpen, onReopen, onDelete, onClear }: CompletedProps) {
  const sorted = [...tasks].sort((a, b) => completedTime(b) - completedTime(a))

  return (
    <main className="content-area focus-scroll">
      <section className="focus-sheet">
        <div className="focus-summary">
          <div><p className="archive-note">Completed tasks leave their lists and land here. Reopen one to put it back.</p></div>
          {sorted.length > 0 && <button className="sheet-action" onClick={onClear}>Clear all</button>}
        </div>

        {sorted.length === 0 ? (
          <div className="large-empty">
            <div className="empty-mark" style={{ '--page-color': 'var(--c-done)' } as React.CSSProperties}><CheckCircle2 /></div>
            <h2>Nothing completed yet</h2>
            <p>Tick a task off and it will land here.</p>
          </div>
        ) : (
          <div className="archive-list">
            {sorted.map((task) => (
              <article className="archive-item" key={task.id}>
                <div
                  className="archive-body is-clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(task.id)}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(task.id) } }}
                >
                  <span className="archive-title is-done">{task.title}</span>
                  <span className="task-meta">
                    <span className="task-list-label">{lists.find((list) => list.id === task.listId)?.name ?? 'No list'}</span>
                    <span><Clock3 size={12} />{timeAgo(task.completedAt, 'Completed')}</span>
                  </span>
                </div>
                <button className="archive-action" onClick={() => onReopen(task.id)} title="Move back to its list"><RotateCcw size={15} />Reopen</button>
                <button className="archive-action danger" onClick={() => onDelete(task.id)} aria-label={`Delete ${task.title}`} title="Delete task"><Trash2 size={15} /></button>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

function completedTime(task: Task) {
  return task.completedAt ? new Date(task.completedAt).getTime() : 0
}
