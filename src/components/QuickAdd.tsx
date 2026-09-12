import { CornerDownLeft, PanelRightOpen, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export function QuickAdd({ expanded, onExpand, onAdd, onCancel }: { expanded: boolean; onExpand: () => void; onAdd: (title: string, openDetails?: boolean) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!expanded) {
      setTitle('')
      return
    }
    const timer = window.setTimeout(() => input.current?.focus(), 20)
    return () => window.clearTimeout(timer)
  }, [expanded])

  const add = (openDetails = false) => {
    const trimmed = title.trim()
    if (!trimmed) return
    onAdd(trimmed, openDetails)
    setTitle('')
  }

  if (!expanded) return <button className="add-task-button" onClick={onExpand}><Plus size={16} />New task</button>

  return (
    <form className="quick-add" onSubmit={(event) => { event.preventDefault(); add() }}>
      <span className="quick-add-dot" aria-hidden="true" />
      <input ref={input} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="New task" maxLength={500} aria-label="New task title" onKeyDown={(event) => { if (event.key === 'Escape') onCancel() }} />
      <button type="button" className="quick-date" title="Add and open details" aria-label="Add task and open details" disabled={!title.trim()} onClick={() => add(true)}><PanelRightOpen size={15} /></button>
      <button type="submit" className="quick-submit" title="Add task" aria-label="Add task" disabled={!title.trim()}><CornerDownLeft size={14} /></button>
    </form>
  )
}
