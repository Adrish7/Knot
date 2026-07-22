import { CheckCircle2, ChevronLeft, Ellipsis, Inbox, ListChecks, Menu, Plus, Power, RefreshCw, Sun, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { Task, TaskList, ViewId } from '../types'

interface SidebarProps {
  collapsed: boolean
  lists: TaskList[]
  tasks: Task[]
  selectedView: ViewId
  completedCount: number
  trashCount: number
  launchAtLogin: boolean
  onSelect: (view: ViewId) => void
  onCreateList: () => void
  onListMenu: (list: TaskList, anchor: HTMLElement) => void
  onRenameList: (listId: string, name: string) => void
  onToggle: () => void
  onLaunchAtLogin: (enabled: boolean) => void
  onUpdate: () => void
  updating: boolean
}

export function Sidebar({ collapsed, lists, tasks, selectedView, completedCount, trashCount, launchAtLogin, onSelect, onCreateList, onListMenu, onRenameList, onToggle, onLaunchAtLogin, onUpdate, updating }: SidebarProps) {
  const [editingListId, setEditingListId] = useState<string | null>(null)
  const [draftListName, setDraftListName] = useState('')
  const openCount = tasks.filter((task) => !task.completed).length
  const today = new Date().toDateString()
  const todayCount = tasks.filter((task) => !task.completed && task.dueAt && new Date(task.dueAt).toDateString() === today).length
  const starredCount = tasks.filter((task) => !task.completed && task.starred).length

  return (
    <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="traffic-light-space" />
      <div className="brand-row">
        <img src="./icon.png" alt="" className="brand-icon" />
        {!collapsed && (
          <div className="brand-copy">
            <strong>Knot</strong>
          </div>
        )}
        <button className="icon-button sidebar-toggle" onClick={onToggle} aria-label={collapsed ? 'Open sidebar' : 'Close sidebar'}>
          {collapsed ? <Menu size={17} /> : <ChevronLeft size={17} />}
        </button>
      </div>

      <nav className="primary-nav" aria-label="Task views">
        <SidebarLink collapsed={collapsed} active={selectedView === 'all'} icon={<Inbox />} label="All tasks" count={openCount} onClick={() => onSelect('all')} />
        <SidebarLink collapsed={collapsed} active={selectedView === 'today'} icon={<Sun />} label="Today" count={todayCount} onClick={() => onSelect('today')} />
        <SidebarLink collapsed={collapsed} active={selectedView === 'starred'} icon={<Star />} label="Starred" count={starredCount} onClick={() => onSelect('starred')} />
      </nav>

      {!collapsed && (
        <>
          <div className="sidebar-section-heading">
            <span>Lists</span>
            <button className="icon-button small" onClick={onCreateList} aria-label="Create list"><Plus size={15} /></button>
          </div>
          <div className="list-nav">
            {lists.map((list) => {
              const count = tasks.filter((task) => task.listId === list.id && !task.completed).length
              const editing = editingListId === list.id
              const finishEdit = () => {
                const name = draftListName.trim()
                setEditingListId(null)
                if (name && name !== list.name) onRenameList(list.id, name)
              }
              return (
                <div className={`list-nav-row ${selectedView === `list:${list.id}` ? 'active' : ''}`} key={list.id}>
                  <div className="list-nav-main" role="button" tabIndex={editing ? -1 : 0} onClick={() => !editing && onSelect(`list:${list.id}`)} onKeyDown={(event) => {
                    if (!editing && (event.key === 'Enter' || event.key === ' ')) onSelect(`list:${list.id}`)
                  }}>
                    <span className="list-color" style={{ '--list-color': list.color } as React.CSSProperties}><ListChecks size={15} /></span>
                    {editing ? (
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
                      }} title="Double-click to edit">{list.name}</span>
                    )}
                    <span className="nav-count">{count || ''}</span>
                  </div>
                  <button className="list-more" aria-label={`More options for ${list.name}`} aria-haspopup="menu" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onListMenu(list, event.currentTarget) }}><Ellipsis size={15} /></button>
                </div>
              )
            })}
            <button className="create-list-row" onClick={onCreateList}><Plus size={16} />Create new list</button>
          </div>
        </>
      )}

      <nav className="secondary-nav" aria-label="Archive">
        <SidebarLink collapsed={collapsed} active={selectedView === 'completed'} icon={<CheckCircle2 />} label="Completed" count={completedCount} onClick={() => onSelect('completed')} />
        <SidebarLink collapsed={collapsed} active={selectedView === 'trash'} icon={<Trash2 />} label="Recently deleted" count={trashCount} onClick={() => onSelect('trash')} />
      </nav>

      <div className="sidebar-footer">
        <button className="update-item-row" onClick={onUpdate} disabled={updating} title={collapsed ? 'Update Knot' : undefined}>
          <RefreshCw size={14} className={updating ? 'is-spinning' : ''} />
          {!collapsed && <span>{updating ? 'Installing update…' : 'Update Knot'}</span>}
        </button>
        <button className={`login-item-row ${launchAtLogin ? 'active' : ''}`} aria-pressed={launchAtLogin} onClick={() => onLaunchAtLogin(!launchAtLogin)} title={collapsed ? 'Open at login' : undefined}>
          <Power size={14} />
          {!collapsed && <><span>Open at login</span><i><b /></i></>}
        </button>
        {!collapsed && <span className="keyboard-hint"><kbd>⌘</kbd><kbd>K</kbd> search</span>}
      </div>
    </aside>
  )
}

function SidebarLink({ collapsed, active, icon, label, count, onClick }: { collapsed: boolean; active: boolean; icon: React.ReactNode; label: string; count: number; onClick: () => void }) {
  return (
    <button className={`sidebar-link ${active ? 'active' : ''}`} onClick={onClick} title={collapsed ? label : undefined} aria-current={active ? 'page' : undefined}>
      {icon}
      {!collapsed && <><span>{label}</span><span className="nav-count">{count || ''}</span></>}
    </button>
  )
}
