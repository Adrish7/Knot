import { Calendar, Check, ChevronLeft, ListChecks, ListTree, PanelRightOpen, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { formatDue, isOverdue } from '../format'
import { completedSubtasks, subtasksOf } from '../page'
import { PageEditor, type PageEditorHandle } from './PageEditor'
import { TagChips } from './Tags'
import type { PageLine, Task, TaskList } from '../types'

interface TaskPageProps {
  task: Task
  lists: TaskList[]
  backLabel: string // the view underneath, which Back returns to
  onBack: () => void
  onDetails: () => void
  onUpdate: (patch: Partial<Task>) => void
  onComplete: (completed: boolean) => void
}

// A task as a page: its title, then its notes and subtasks written together like a note. Opened
// from the task's panel (or the page mark on its row); it takes the place of the view, which
// Back returns to. The subtasks written here are the ones under the task in every list.
export function TaskPage({ task, lists, backLabel, onBack, onDetails, onUpdate, onComplete }: TaskPageProps) {
  const editor = useRef<PageEditorHandle>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const sheetRef = useRef<HTMLElement>(null)
  const [activeKind, setActiveKind] = useState<PageLine['kind'] | null>(null)
  const list = lists.find((item) => item.id === task.listId)
  const accent = list ? { className: 'is-accented', style: { '--list-accent': list.color } as React.CSSProperties } : { className: '', style: undefined }
  const subtaskCount = subtasksOf(task).length

  // Leaving the page (Back, Escape, another view) skips the title's blur, so a title left empty is
  // filled in when the page lets go of the task.
  const latest = useRef({ title: task.title, onUpdate })
  useEffect(() => { latest.current = { title: task.title, onUpdate } })
  useEffect(() => () => {
    if (!latest.current.title.trim()) latest.current.onUpdate({ title: 'Untitled task' })
  }, [task.id])

  // A page with nothing on it yet opens ready to write in.
  useEffect(() => {
    if (task.page.every((line) => line.text === '')) editor.current?.focusStart()
    // Only when a task's page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id])

  return (
    <>
      <header className={`topbar task-page-bar ${accent.className}`} style={accent.style}>
        <button type="button" className="task-page-back" onClick={onBack} title={`Back to ${backLabel} (Esc)`}>
          <ChevronLeft size={17} /><span>{backLabel}</span>
        </button>
        <div className="topbar-actions">
          <button
            type="button"
            className={`topbar-button ${activeKind === 'subtask' ? 'is-on' : ''}`}
            aria-pressed={activeKind === 'subtask'}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.current?.toggleSubtask()}
            title="Make the line a subtask, or add one at the end (⇧⌘L)"
          >
            <ListChecks size={14} /><span>Subtask</span>
          </button>
          <button type="button" className="topbar-button" onClick={onDetails} title="List, dates, tags and time">
            <PanelRightOpen size={14} /><span>Details</span>
          </button>
        </div>
      </header>

      <main
        className={`content-area focus-scroll task-page ${accent.className}`}
        style={accent.style}
        onMouseDown={(event) => {
          // A press in the empty space under the page carries on writing at its end.
          if (event.button !== 0 || (event.target !== event.currentTarget && event.target !== sheetRef.current)) return
          event.preventDefault()
          editor.current?.focusEnd()
        }}
      >
        <article className="task-page-sheet" ref={sheetRef}>
          <div className="task-page-head">
            <button
              type="button"
              className={`task-page-check ${task.completed ? 'is-done' : ''}`}
              onClick={() => onComplete(!task.completed)}
              aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
              title={task.completed ? 'Mark incomplete' : 'Mark complete'}
            >
              <span>{task.completed && <Check size={14} strokeWidth={3} />}</span>
            </button>
            <textarea
              ref={titleRef}
              className={`task-page-title ${task.completed ? 'is-done' : ''}`}
              value={task.title}
              rows={1}
              maxLength={500}
              aria-label="Task title"
              onChange={(event) => onUpdate({ title: event.target.value })}
              onBlur={(event) => onUpdate({ title: event.currentTarget.value.trim() || 'Untitled task' })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  editor.current?.focusStart()
                }
                if (event.key === 'ArrowDown' && event.currentTarget.selectionStart === event.currentTarget.value.length) {
                  event.preventDefault()
                  editor.current?.focusStart()
                }
              }}
            />
          </div>
          <div className="task-meta task-page-meta">
            <span className="task-page-list">{list ? <><i style={{ background: list.color }} />{list.name}</> : 'Calendar only'}</span>
            {task.dueAt && <span className={isOverdue(task) ? 'overdue' : ''}><Calendar size={12} />{formatDue(task.dueAt)}</span>}
            {subtaskCount > 0 && <span title="Subtasks done"><ListTree size={12} />{completedSubtasks(task)}/{subtaskCount}</span>}
            <TagChips tagIds={task.tagIds} />
          </div>

          <PageEditor
            ref={editor}
            variant="page"
            lines={task.page}
            onChange={(page) => onUpdate({ page })}
            placeholder="Add notes…"
            hint="Type [] and a space for a subtask"
            label="Notes and subtasks"
            onActiveKind={setActiveKind}
            onLeaveTop={() => {
              const title = titleRef.current
              if (!title) return
              title.focus()
              title.setSelectionRange(title.value.length, title.value.length)
            }}
          />
          <button type="button" className="page-add-subtask" onClick={() => editor.current?.addSubtask()}>
            <Plus size={15} />Add subtask
          </button>
        </article>
      </main>
    </>
  )
}
