import { Clock3, RotateCcw, Trash2, X } from 'lucide-react'
import { TRASH_RETENTION_DAYS } from '../data'
import { timeAgo } from '../format'
import type { DeletedTask } from '../types'

interface TrashProps {
  entries: DeletedTask[]
  onRestore: (taskId: string) => void
  onPurge: (taskId: string) => void
  onEmpty: () => void
}

export function Trash({ entries, onRestore, onPurge, onEmpty }: TrashProps) {
  const sorted = [...entries].sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime())

  return (
    <main className="content-area focus-scroll">
      <section className="focus-sheet">
        <div className="focus-summary">
          <div className="summary-mark is-danger"><Trash2 size={20} /></div>
          <div>
            <span>{sorted.length === 0 ? 'Nothing here' : `${sorted.length} deleted ${sorted.length === 1 ? 'task' : 'tasks'}`}</span>
            <p className="archive-note">Tasks are kept for {TRASH_RETENTION_DAYS} days, then removed for good.</p>
          </div>
          {sorted.length > 0 && <button className="sheet-action" onClick={onEmpty}>Empty now</button>}
        </div>

        {sorted.length === 0 ? (
          <div className="large-empty">
            <div className="empty-rings"><Trash2 /><Clock3 /></div>
            <h2>Recently deleted is empty</h2>
            <p>Tasks you delete land here first, so you can put them back.</p>
          </div>
        ) : (
          <div className="archive-list">
            {sorted.map((entry) => (
              <article className="archive-item" key={entry.task.id}>
                <div className="archive-body">
                  <span className="archive-title">{entry.task.title}</span>
                  <span className="task-meta">
                    <span className="task-list-label">{entry.listName}</span>
                    <span><Clock3 size={12} />{timeAgo(entry.deletedAt)}</span>
                  </span>
                </div>
                <button className="archive-action" onClick={() => onRestore(entry.task.id)} title="Put back"><RotateCcw size={15} />Restore</button>
                <button className="archive-action danger" onClick={() => onPurge(entry.task.id)} aria-label={`Delete ${entry.task.title} forever`} title="Delete forever"><X size={16} /></button>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
