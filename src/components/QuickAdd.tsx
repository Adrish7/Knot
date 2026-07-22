import { CalendarPlus, CornerDownLeft, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export function QuickAdd({ expanded, onExpand, onAdd, onCancel }: { expanded: boolean; onExpand: () => void; onAdd: (title: string, openDetails?: boolean) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const timer = expanded ? window.setTimeout(() => input.current?.focus(), 20) : null
    if (!expanded) setTitle('')
    return () => { if (timer !== null) window.clearTimeout(timer) }
  }, [expanded])

  const add = (openDetails = false) => {
    const trimmed = title.trim()
    if (!trimmed) return
    onAdd(trimmed, openDetails)
    setTitle('')
  }

  if (!expanded) return <button className="add-task-button" onClick={onExpand}><Plus size={16} />Add a task</button>

  return (
    <form className="quick-add" onSubmit={(event) => { event.preventDefault(); add() }}>
      <span className="quick-add-dot" />
      <input ref={input} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="New task" onKeyDown={(event) => { if (event.key === 'Escape') onCancel() }} />
      <button type="button" className="quick-date" title="Create and add details" aria-label="Create task and add details" disabled={!title.trim()} onClick={() => add(true)}><CalendarPlus size={15} /></button>
      <button type="submit" className="quick-submit" aria-label="Add task" disabled={!title.trim()}><CornerDownLeft size={14} /></button>
    </form>
  )
}
