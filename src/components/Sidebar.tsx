import { CalendarDays, CheckCircle2, ChevronLeft, Ellipsis, Inbox, PanelLeft, Plus, Power, Search, Settings2, Star, Sun, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { isForToday } from '../format'
import type { Task, TaskList, ThemeMode, ViewId } from '../types'
import { ListRing, listProgress } from './ListRing'

interface SidebarProps {
  collapsed: boolean
  lists: TaskList[]
  tasks: Task[]
  selectedView: ViewId
  completedCount: number
  trashCount: number
  launchAtLogin: boolean
  theme: ThemeMode
  query: string
  searchRef: React.RefObject<HTMLInputElement | null>
  onQuery: (value: string) => void
  onSelect: (view: ViewId) => void
  onCreateList: () => void
  onListMenu: (list: TaskList, anchor: HTMLElement) => void
  onRenameList: (listId: string, name: string) => void
  onToggle: () => void
  onLaunchAtLogin: (enabled: boolean) => void
  onTheme: (theme: ThemeMode) => void
}

export function Sidebar({ collapsed, lists, tasks, selectedView, completedCount, trashCount, launchAtLogin, theme, query, searchRef, onQuery, onSelect, onCreateList, onListMenu, onRenameList, onToggle, onLaunchAtLogin, onTheme }: SidebarProps) {
  const [editingListId, setEditingListId] = useState<string | null>(null)
  const [draftListName, setDraftListName] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const footerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!settingsOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (event.target instanceof Node && !footerRef.current?.contains(event.target)) setSettingsOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setSettingsOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [settingsOpen])

  const openTasks = tasks.filter((task) => task.listId !== null && !task.completed)
  const todayCount = openTasks.filter(isForToday).length
  const starredCount = openTasks.filter((task) => task.starred).length

  return (
    <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="sidebar-top">
        <button className="icon-button" onClick={onToggle} aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'} title={collapsed ? 'Show sidebar' : 'Hide sidebar'}>
          {collapsed ? <PanelLeft size={17} /> : <ChevronLeft size={17} />}
        </button>
      </div>

      <label className="sidebar-search">
        <Search size={14} />
        <input ref={searchRef} value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search" aria-label="Search tasks" />
        {query ? <button type="button" className="search-clear" onClick={() => onQuery('')} aria-label="Clear search"><X size={10} strokeWidth={3} /></button> : <kbd>⌘K</kbd>}
      </label>

      <nav className="primary-nav" aria-label="Task views">
        <SidebarLink collapsed={collapsed} active={selectedView === 'all'} color="var(--c-all)" icon={<Inbox />} label="All tasks" count={openTasks.length} onClick={() => onSelect('all')} />
        <SidebarLink collapsed={collapsed} active={selectedView === 'today'} color="var(--c-today)" icon={<Sun />} label="Today" count={todayCount} onClick={() => onSelect('today')} />
        <SidebarLink collapsed={collapsed} active={selectedView === 'calendar'} color="var(--c-calendar)" icon={<CalendarDays />} label="Calendar" count={0} onClick={() => onSelect('calendar')} />
        <SidebarLink collapsed={collapsed} active={selectedView === 'starred'} color="var(--c-starred)" icon={<Star fill="currentColor" />} label="Starred" count={starredCount} onClick={() => onSelect('starred')} />
      </nav>
      <nav className="secondary-nav" aria-label="Archive">
        <SidebarLink collapsed={collapsed} active={selectedView === 'completed'} color="var(--c-done)" icon={<CheckCircle2 />} label="Completed" count={completedCount} onClick={() => onSelect('completed')} />
        <SidebarLink collapsed={collapsed} active={selectedView === 'trash'} color="var(--c-trash)" icon={<Trash2 />} label="Recently deleted" count={trashCount} onClick={() => onSelect('trash')} />
      </nav>

      <div className="sidebar-divider" />

      <div className="list-nav" aria-label="Lists">
        {lists.map((list) => {
          const open = tasks.filter((task) => task.listId === list.id && !task.completed).length
          const done = tasks.filter((task) => task.listId === list.id && task.completed).length
          const editing = editingListId === list.id
          const finishEdit = () => {
            const name = draftListName.trim()
            setEditingListId(null)
            if (name && name !== list.name) onRenameList(list.id, name)
          }
          return (
            <div className={`list-nav-row ${selectedView === `list:${list.id}` ? 'active' : ''}`} key={list.id}>
              <div className="list-nav-main" role="button" tabIndex={editing ? -1 : 0} title={collapsed ? list.name : undefined} onClick={() => !editing && onSelect(`list:${list.id}`)} onKeyDown={(event) => {
                if (!editing && (event.key === 'Enter' || event.key === ' ')) onSelect(`list:${list.id}`)
              }}>
                <ListRing color={list.color} progress={listProgress(open, done)} />
                {!collapsed && (editing ? (
                  <input
                    className="sidebar-list-name-input"
                    value={draftListName}
                    maxLength={120}
                    autoFocus
                    aria-label="List name"
                    onFocus={(event) => event.currentTarget.select()}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => setDraftListName(event.target.value)}
                    onBlur={finishEdit}
                    onKeyDown={(event) => {
                      event.stopPropagation()
                      if (event.key === 'Enter') finishEdit()
                      if (event.key === 'Escape') setEditingListId(null)
                    }}
                  />
                ) : (
                  <span className="list-name" onDoubleClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setDraftListName(list.name)
                    setEditingListId(list.id)
                  }} title="Double-click to rename">{list.name}</span>
                ))}
                {!collapsed && <span className="nav-count">{open || ''}</span>}
              </div>
              <button className="list-more" aria-label={`More options for ${list.name}`} aria-haspopup="menu" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onListMenu(list, event.currentTarget) }}><Ellipsis size={15} /></button>
            </div>
          )
        })}
      </div>

      <div className="sidebar-divider" />

      <div className="sidebar-footer" ref={footerRef}>
        <button className="new-list-button" onClick={onCreateList} title="New list"><Plus size={16} />{!collapsed && <span>New list</span>}</button>
        <button className={`icon-button settings-button ${settingsOpen ? 'is-open' : ''}`} onClick={() => setSettingsOpen((open) => !open)} aria-label="Settings" aria-expanded={settingsOpen} aria-haspopup="dialog" title="Settings"><Settings2 size={16} /></button>
        {settingsOpen && (
          <div className="settings-popover" role="dialog" aria-label="Settings">
            <div className="settings-label">Appearance</div>
            <div className="settings-row is-segmented">
              <div className="segmented" role="radiogroup" aria-label="Appearance">
                {(['system', 'light', 'dark'] as ThemeMode[]).map((mode) => (
                  <button key={mode} role="radio" aria-checked={theme === mode} className={theme === mode ? 'active' : ''} onClick={() => onTheme(mode)}>
                    {mode === 'system' ? 'Auto' : mode === 'light' ? 'Light' : 'Dark'}
                  </button>
                ))}
              </div>
            </div>
            <button className="settings-row settings-action" role="switch" aria-checked={launchAtLogin} onClick={() => onLaunchAtLogin(!launchAtLogin)}>
              <span><Power size={15} />Open at login</span>
              <span className={`switch ${launchAtLogin ? 'on' : ''}`} />
            </button>
            <div className="settings-divider" />
            <div className="settings-shortcuts">
              <span><span>Search</span><b><kbd>⌘</kbd><kbd>K</kbd></b></span>
              <span><span>New task</span><b><kbd>⌘</kbd><kbd>N</kbd></b></span>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

function SidebarLink({ collapsed, active, color, icon, label, count, onClick }: { collapsed: boolean; active: boolean; color: string; icon: React.ReactNode; label: string; count: number; onClick: () => void }) {
  return (
    <button className={`sidebar-link ${active ? 'active' : ''}`} style={{ '--view-color': color } as React.CSSProperties} onClick={onClick} title={collapsed ? label : undefined} aria-current={active ? 'page' : undefined}>
      {icon}
      {!collapsed && <><span>{label}</span><span className="nav-count">{count || ''}</span></>}
    </button>
  )
}
