import { ArrowDownUp, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { SortMode } from '../types'

interface HeaderProps {
  title: string
  subline?: string
  icon: React.ReactNode
  color?: string
  sortMode: SortMode
  showSort: boolean
  onSort: (value: SortMode) => void
  onRenameTitle?: (title: string) => void
}

const sortLabels: Record<SortMode, string> = { manual: 'My order', date: 'Due date', starred: 'Starred first' }

export function Header({ title, subline, icon, color, sortMode, showSort, onSort, onRenameTitle }: HeaderProps) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')

  const beginTitleEdit = () => {
    if (!onRenameTitle) return
    setDraftTitle(title)
    setEditingTitle(true)
  }

  const finishTitleEdit = () => {
    const nextTitle = draftTitle.trim()
    setEditingTitle(false)
    if (nextTitle && nextTitle !== title) onRenameTitle?.(nextTitle)
  }

  return (
    <header className="topbar">
      <div className="page-identity">
        <div className="page-heading">
          <span className="page-icon" style={color ? { '--page-color': color } as React.CSSProperties : undefined} aria-hidden="true">{icon}</span>
          {editingTitle ? (
            <input
              className="page-title-input"
              value={draftTitle}
              maxLength={120}
              autoFocus
              aria-label="List name"
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setDraftTitle(event.target.value)}
              onBlur={finishTitleEdit}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Enter') finishTitleEdit()
                if (event.key === 'Escape') setEditingTitle(false)
              }}
            />
          ) : (
            <h1 className={onRenameTitle ? 'is-editable' : ''} onDoubleClick={beginTitleEdit} title={onRenameTitle ? 'Double-click to rename' : undefined}>{title}</h1>
          )}
        </div>
        {subline && <span className="page-subline">{subline}</span>}
      </div>

      {showSort && (
        <div className="topbar-actions">
          <label className="select-control" title="Sort">
            <ArrowDownUp size={14} />
            <span>{sortLabels[sortMode]}</span>
            <ChevronDown />
            <select value={sortMode} onChange={(event) => onSort(event.target.value as SortMode)} aria-label="Sort tasks">
              {Object.entries(sortLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
      )}
    </header>
  )
}
