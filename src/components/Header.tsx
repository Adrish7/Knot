import { ArrowDownUp, Check, ChevronDown, Moon, Search, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { SortMode, ThemeMode } from '../types'

interface HeaderProps {
  title: string
  eyebrow: string
  query: string
  sortMode: SortMode
  theme: ThemeMode
  onQuery: (value: string) => void
  onSort: (value: SortMode) => void
  onTheme: () => void
  onRenameTitle?: (title: string) => void
  searchRef: React.RefObject<HTMLInputElement | null>
}

export function Header({ title, eyebrow, query, sortMode, theme, onQuery, onSort, onTheme, onRenameTitle, searchRef }: HeaderProps) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState(title)

  useEffect(() => {
    if (!editingTitle) setDraftTitle(title)
  }, [editingTitle, title])

  const finishTitleEdit = () => {
    const nextTitle = draftTitle.trim()
    setEditingTitle(false)
    setDraftTitle(nextTitle || title)
    if (nextTitle && nextTitle !== title) onRenameTitle?.(nextTitle)
  }

  return (
    <header className="topbar">
      <div className="page-identity">
        <span className="eyebrow">{eyebrow}</span>
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
              if (event.key === 'Escape') {
                setDraftTitle(title)
                setEditingTitle(false)
              }
            }}
          />
        ) : (
          <h1 className={onRenameTitle ? 'is-editable' : ''} onDoubleClick={() => onRenameTitle && setEditingTitle(true)} title={onRenameTitle ? 'Double-click to edit' : undefined}>{title}</h1>
        )}
      </div>

      <div className="topbar-actions">
        <label className={`search-box ${query ? 'has-value' : ''}`}>
          <Search size={17} />
          <input ref={searchRef} value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search tasks" aria-label="Search tasks" />
          <kbd>⌘K</kbd>
        </label>

        <div className="select-control">
          <ArrowDownUp size={16} />
          <select value={sortMode} onChange={(event) => onSort(event.target.value as SortMode)} aria-label="Sort tasks">
            <option value="manual">My order</option>
            <option value="date">Due date</option>
            <option value="starred">Starred first</option>
          </select>
          <ChevronDown size={14} />
        </div>

        <button className="theme-toggle" onClick={onTheme} aria-label={`Theme: ${theme}`} title={`Theme: ${theme}`}>
          <span className={theme === 'light' ? 'active' : ''}><Sun size={15} /></span>
          <span className={theme === 'dark' ? 'active' : ''}><Moon size={15} /></span>
          {theme === 'system' && <i><Check size={10} /></i>}
        </button>
      </div>
    </header>
  )
}
