import { Check, Pencil, Plus, Tag as TagIcon } from 'lucide-react'
import { createContext, useContext, useState } from 'react'
import { createPortal } from 'react-dom'
import { palette } from '../data'
import { sortTags } from '../tags'
import { usePopover } from './DateTimePicker'
import type { Tag } from '../types'

// The workspace's tags and what can be done to them, available anywhere a task is drawn.
export interface TagsApi {
  tags: Tag[] // in their order
  create: (name: string) => Tag
  update: (tagId: string, patch: Partial<Pick<Tag, 'name' | 'color'>>) => void
  remove: (tagId: string) => void
}

export const TagsContext = createContext<TagsApi>({ tags: [], create: () => { throw new Error('No tags provider') }, update: () => {}, remove: () => {} })

export const useTags = () => useContext(TagsContext)

export function tagsOf(tags: Tag[], tagIds: string[]) {
  return tags.filter((tag) => tagIds.includes(tag.id))
}

// A task's tags as small coloured labels, e.g. in a row's meta line.
export function TagChips({ tagIds }: { tagIds: string[] }) {
  const { tags } = useTags()
  return tagsOf(tags, tagIds).map((tag) => (
    <span key={tag.id} className="tag-chip" style={{ '--tag-color': tag.color } as React.CSSProperties}><i />{tag.name}</span>
  ))
}

interface TagPickerProps {
  selected: string[]
  onChange: (tagIds: string[]) => void
  variant: 'field' | 'button' // a value in the details panel, or a control under the stopwatch
  taskTitle?: string
}

// Choose a task's tags; typing a name that doesn't exist yet creates it. Each tag can be renamed
// and recoloured in place, and deleted, except the break tag.
export function TagPicker({ selected, onChange, variant, taskTitle }: TagPickerProps) {
  const { tags, create, update, remove } = useTags()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string; color: string } | null>(null)
  const close = () => { setOpen(false); setQuery(''); setEditing(null) }
  const { fieldRef, popoverRef, coords } = usePopover(open, close, tags.length + (editing ? 1 : 0), variant === 'field' ? 'end' : 'start')

  const chosen = tagsOf(tags, selected)
  const needle = query.trim().toLowerCase()
  const visible = needle ? tags.filter((tag) => tag.name.toLowerCase().includes(needle)) : tags
  const exact = tags.find((tag) => tag.name.toLowerCase() === needle)
  const toggle = (tag: Tag) => onChange(selected.includes(tag.id) ? selected.filter((id) => id !== tag.id) : sortTags(tagsOf(tags, [...selected, tag.id])).map((item) => item.id))
  const createFromQuery = () => {
    const tag = create(query)
    onChange([...selected, tag.id])
    setQuery('')
  }
  const saveEdit = () => {
    if (!editing) return
    if (editing.name.trim()) update(editing.id, { name: editing.name.trim(), color: editing.color })
    setEditing(null)
  }

  // Nothing in the popover reaches the row it was opened from; Escape steps back a level.
  const swallow = (event: React.SyntheticEvent) => event.stopPropagation()
  const onPopoverKeyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation()
    if (event.key !== 'Escape') return
    event.preventDefault()
    if (editing) setEditing(null)
    else close()
  }

  const label = chosen.length > 0 ? chosen.map((tag) => tag.name).join(', ') : 'No tags'
  return (
    <div className={`picker-field tag-field is-${variant} ${open ? 'is-open' : ''}`} ref={fieldRef}>
      <button
        type="button"
        className={variant === 'field' ? `picker-trigger tag-trigger ${chosen.length ? 'has-value' : ''} ${open ? 'is-open' : ''}` : `sw-link tag-trigger ${open ? 'is-open' : ''}`}
        aria-label={`Tags${taskTitle ? ` for ${taskTitle}` : ''}: ${label}`}
        aria-expanded={open}
        onClick={(event) => { event.stopPropagation(); if (open) close(); else setOpen(true) }}
      >
        {variant === 'button' && <TagIcon size={13} />}
        {chosen.length === 0 && (variant === 'field' ? 'Add tags' : 'Tag')}
        {/* Under the stopwatch, room is short: several tags show as their dots and a count. */}
        {variant === 'button' && chosen.length > 1
          ? <span className="tag-chip">{chosen.map((tag) => <i key={tag.id} style={{ '--tag-color': tag.color } as React.CSSProperties} />)}{chosen.length} tags</span>
          : chosen.map((tag) => <span key={tag.id} className="tag-chip" style={{ '--tag-color': tag.color } as React.CSSProperties}><i />{tag.name}</span>)}
      </button>
      {open && createPortal(
        <div
          className="date-popover tag-popover"
          ref={popoverRef}
          role="dialog"
          aria-label="Tags"
          style={coords}
          onClick={swallow}
          onMouseDown={swallow}
          onDoubleClick={swallow}
          onKeyDown={onPopoverKeyDown}
        >
          <input
            className="tag-filter"
            value={query}
            autoFocus
            maxLength={40}
            placeholder="Find or create a tag"
            aria-label="Find or create a tag"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              if (exact) { toggle(exact); setQuery('') }
              else if (needle) createFromQuery()
            }}
          />
          <div className="tag-options">
            {visible.map((tag) => editing?.id === tag.id
              ? (
                <div key={tag.id} className="tag-editor">
                  <input
                    value={editing.name}
                    autoFocus
                    maxLength={40}
                    aria-label="Tag name"
                    onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); saveEdit() } }}
                  />
                  <div className="tag-colors" role="radiogroup" aria-label="Tag colour">
                    {palette.map((color) => (
                      <button
                        key={color}
                        type="button"
                        role="radio"
                        aria-checked={editing.color === color}
                        aria-label={color}
                        className={editing.color === color ? 'is-on' : ''}
                        style={{ '--tag-color': color } as React.CSSProperties}
                        onClick={() => setEditing({ ...editing, color })}
                      />
                    ))}
                  </div>
                  {tag.isBreak && <p className="tag-note">Time on tasks with this tag counts as a break, the same as the time between sessions.</p>}
                  <div className="tag-editor-foot">
                    {!tag.isBreak && <button type="button" className="tag-delete" onClick={() => { setEditing(null); remove(tag.id) }}>Delete tag</button>}
                    <button type="button" className="time-done" onClick={saveEdit}>Done</button>
                  </div>
                </div>
              )
              : (
                <div key={tag.id} className="tag-option">
                  <button type="button" className="tag-option-main" role="checkbox" aria-checked={selected.includes(tag.id)} onClick={() => toggle(tag)}>
                    <span className="tag-check">{selected.includes(tag.id) && <Check size={12} strokeWidth={3} />}</span>
                    <i style={{ background: tag.color }} />
                    <span className="tag-option-name">{tag.name}</span>
                    {tag.isBreak && <small>Counts as a break</small>}
                  </button>
                  <button type="button" className="tag-edit" aria-label={`Edit ${tag.name}`} title="Rename or recolour" onClick={() => setEditing({ id: tag.id, name: tag.name, color: tag.color })}>
                    <Pencil size={12} />
                  </button>
                </div>
              ))}
            {needle && !exact && (
              <button type="button" className="tag-create" onClick={createFromQuery}><Plus size={13} />Create “{query.trim()}”</button>
            )}
            {visible.length === 0 && !needle && <p className="tag-note">No tags yet. Type a name to create one.</p>}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
