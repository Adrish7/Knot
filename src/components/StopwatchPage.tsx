import { ArrowRight, Check, ChevronDown, Pause, Pencil, Play, RotateCcw, Timer } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { sortStopwatch } from '../data'
import { dayKeyOf, isForToday, todayKey } from '../format'
import { breakTagOf, dayBalance, isBreakTask } from '../tags'
import { daySeconds, daySpans, formatClock, formatSpent, hasTime, isRunning, totalSeconds } from '../time'
import { useNow } from '../useNow'
import { DayTimeline, type TimelineSpan } from './DayTimeline'
import { DialFace } from './DialFace'
import { QuickAdd } from './QuickAdd'
import { TagPicker, tagsOf, useTags } from './Tags'
import { TimeSpentPicker } from './TimeSpentPicker'
import type { Task, TaskList, TimeTrack } from '../types'

interface StopwatchPageProps {
  tasks: Task[]
  lists: TaskList[]
  open: TimeTrack
  target: string | null // task id, or null for the open stopwatch
  onTarget: (target: string | null) => void
  onStart: (target: string | null) => void
  onPause: (target: string | null) => void
  onReset: (target: string | null) => void
  onAdjust: (target: string | null, seconds: number) => void
  onMoveOpenToTask: (taskId: string) => void
  onOpenTask: (taskId: string) => void
  onAddTask: (title: string, openDetails: boolean) => void // planned for today, then shown on the face
  onSetTags: (taskId: string, tagIds: string[]) => void
  onSetDone: (taskId: string, done: boolean) => void // done for today
  onReorder: (taskIds: string[]) => void // the Today rows in their new order
}

const OPEN_COLOR = 'var(--c-timer)'
const OPEN_VALUE = '__open' // the open stopwatch in the change-task <select>

export function StopwatchPage({ tasks, lists, open, target, onTarget, onStart, onPause, onReset, onAdjust, onMoveOpenToTask, onOpenTask, onAddTask, onSetTags, onSetDone, onReorder }: StopwatchPageProps) {
  const { tags } = useTags()
  const [adding, setAdding] = useState(false)
  const [dragged, setDragged] = useState<string | null>(null)
  const [dropBefore, setDropBefore] = useState<string | null | undefined>(undefined) // undefined: no drop hint; null: the end
  const today = todayKey()
  const anyRunning = isRunning(open) || tasks.some((task) => isRunning(task.time))
  const now = useNow(anyRunning, 200)
  const listById = useMemo(() => new Map(lists.map((list) => [list.id, list])), [lists])
  const breakTag = breakTagOf(tags)
  // A break-tagged task takes the break tag's colour, so the face, its button and its row read as a
  // break at a glance; anything else takes its list's colour.
  const colorOf = (task: Task) => (breakTag && task.tagIds.includes(breakTag.id) ? breakTag.color : undefined)
    ?? (task.listId ? listById.get(task.listId)?.color : undefined) ?? 'var(--accent)'

  const targetTask = target === null ? null : tasks.find((task) => task.id === target) ?? null
  // A target that no longer exists (deleted, purged) falls back to the open stopwatch.
  useEffect(() => {
    if (target !== null && !targetTask) onTarget(null)
  }, [target, targetTask, onTarget])

  const track = targetTask ? targetTask.time : open
  const running = isRunning(track)
  const elapsed = totalSeconds(track, now)
  const targetList = targetTask?.listId ? listById.get(targetTask.listId) : undefined
  const color = targetTask ? colorOf(targetTask) : OPEN_COLOR

  // Today's rows, after the open stopwatch: anything timed today and today's tasks (calendar-only
  // ones included, so a task made here shows up straight away). They keep the order they were
  // added in until dragged, and stay put once done; a task finished today stays too.
  const rows = sortStopwatch(tasks.filter((task) => isRunning(task.time) || daySeconds(task.time, today, now) > 0
    || (isForToday(task) && (!task.completed || (task.completedAt !== null && dayKeyOf(new Date(task.completedAt)) === today)))))
  const isDone = (task: Task) => task.completed || task.focusStatus[today] === 'done'
  const others = tasks.filter((task) => !task.completed && task.listId !== null && !rows.includes(task))
  // The face's title switches between everything the page can time; keep the target listed.
  // Completed tasks stay out of the chooser unless one is what the stopwatch is on right now.
  const pool = targetTask && !rows.includes(targetTask) && !others.includes(targetTask) ? [targetTask, ...rows, ...others] : [...rows, ...others]
  const choices = pool.filter((task) => !task.completed || task.id === target)

  const spans: TimelineSpan[] = [
    ...daySpans(open, today, now).map((span) => ({ ...span, owner: 'open', color: OPEN_COLOR, title: 'Open stopwatch', subtitle: 'Not tied to a task', isBreak: false })),
    ...tasks.flatMap((task) => daySpans(task.time, today, now).map((span) => ({
      ...span,
      owner: task.id,
      isBreak: isBreakTask(task, tags),
      color: colorOf(task),
      title: task.title,
      subtitle: task.listId ? listById.get(task.listId)?.name ?? 'Calendar only' : 'Calendar only',
    }))),
  ].sort((a, b) => a.start - b.start)

  // Working time and breaks for the day, and the time behind each tag. The break tag's figure is
  // every break: the time between sessions as well as time on break-tagged tasks.
  const balance = dayBalance(tasks, open, tags, today, now)
  const tagTotals = tags
    .map((tag) => ({ tag, seconds: tag.isBreak ? balance.breaks : balance.byTag.get(tag.id) ?? 0 }))
    .filter((entry) => entry.seconds >= 60)
  const onBreak = targetTask !== null && running && isBreakTask(targetTask, tags)

  // Drag to reorder: the row the cursor would land before is the first one (skipping the dragged
  // row) whose midpoint is below the cursor; null means the end.
  const dragOverRows = (event: React.DragEvent<HTMLElement>) => {
    if (!dragged) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    let before: string | null = null
    for (const row of event.currentTarget.querySelectorAll<HTMLElement>('.sw-row[data-task-id]')) {
      const id = row.dataset.taskId
      if (!id || id === dragged) continue
      const box = row.getBoundingClientRect()
      if (event.clientY < box.top + box.height / 2) { before = id; break }
    }
    setDropBefore(before)
  }
  const endDrag = () => { setDragged(null); setDropBefore(undefined) }
  const dropOnRows = (event: React.DragEvent) => {
    if (!dragged || dropBefore === undefined) return endDrag()
    event.preventDefault()
    const ids = rows.map((task) => task.id).filter((id) => id !== dragged)
    const index = dropBefore === null ? ids.length : ids.indexOf(dropBefore)
    ids.splice(index < 0 ? ids.length : index, 0, dragged)
    onReorder(ids)
    endDrag()
  }
  const lastRow = rows.findLast((task) => task.id !== dragged)

  const renderRow = (task: Task | null) => {
    const rowTarget = task?.id ?? null
    const rowTrack = task ? task.time : open
    const title = task ? task.title : 'Open stopwatch'
    const rowColor = task ? colorOf(task) : OPEN_COLOR
    const meta = task ? (task.listId ? listById.get(task.listId)?.name ?? 'Calendar only' : 'Calendar only') : 'Not tied to a task'
    const rowRunning = isRunning(rowTrack)
    const seconds = daySeconds(rowTrack, today, now)
    const selected = rowTarget === target
    const done = task !== null && isDone(task)
    const dropEdge = task === null || dragged === null || dropBefore === undefined ? null
      : dropBefore === task.id ? 'before' : dropBefore === null && lastRow === task ? 'after' : null
    return (
      <div
        key={rowTarget ?? 'open'}
        className={`sw-row ${selected ? 'is-selected' : ''} ${rowRunning ? 'is-running' : ''} ${done ? 'is-done' : ''} ${task !== null && dragged === task.id ? 'is-dragging' : ''} ${dropEdge ? `drop-${dropEdge}` : ''}`}
        style={{ '--row-color': rowColor } as React.CSSProperties}
        data-task-id={rowTarget ?? undefined}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        draggable={task !== null}
        onDragStart={task ? (event) => { setDragged(task.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', task.id) } : undefined}
        onDragEnd={endDrag}
        onClick={() => onTarget(rowTarget)}
        onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onTarget(rowTarget) } }}
      >
        {task === null
          ? <span className="sw-row-mark"><Timer size={16} /></span>
          : (
            <button
              className="sw-row-mark sw-row-check"
              onClick={(event) => { event.stopPropagation(); onSetDone(task.id, !done) }}
              aria-label={done ? `${title}: done today, click to mark not done` : `Mark ${title} done for today`}
              aria-pressed={done}
              title={done ? 'Done today — click to mark not done' : 'Mark done for today'}
            >
              {done ? <Check size={13} strokeWidth={3} /> : <span className="sw-row-dot" />}
            </button>
          )}
        <span className="sw-row-text">
          <span className="sw-row-title">{title}</span>
          <span className="sw-row-meta">
            {meta}{rowRunning ? ' · Running' : ''}
            {tagsOf(tags, task?.tagIds ?? []).map((tag) => <span key={tag.id} className="sw-row-tag" style={{ '--tag-color': tag.color } as React.CSSProperties}>{tag.name}</span>)}
          </span>
        </span>
        <span className={`sw-row-time ${!rowRunning && seconds < 60 ? 'is-zero' : ''}`}>{rowRunning ? formatClock(seconds) : formatSpent(seconds)}</span>
        <button
          className="sw-row-play"
          onClick={(event) => { event.stopPropagation(); rowRunning ? onPause(rowTarget) : onStart(rowTarget) }}
          aria-label={rowRunning ? `Pause ${title}` : `Start ${title}`}
          title={rowRunning ? 'Pause' : 'Start'}
        >
          {rowRunning ? <Pause size={12} fill="currentColor" strokeWidth={1.5} /> : <Play size={12} fill="currentColor" strokeWidth={1.5} />}
        </button>
      </div>
    )
  }

  const changeTask = (
    <select
      value={target ?? OPEN_VALUE}
      aria-label="Change what the stopwatch is timing"
      onChange={(event) => onTarget(event.target.value === OPEN_VALUE ? null : event.target.value)}
    >
      <option value={OPEN_VALUE}>Open stopwatch</option>
      {choices.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
    </select>
  )

  return (
    <main className="content-area focus-scroll stopwatch-page">
      <div className="sw-layout">
        <section className="sw-stage" style={{ '--face-color': color } as React.CSSProperties} aria-label="Stopwatch">
          <DialFace
            elapsed={elapsed}
            running={running}
            color={color}
            title={targetTask ? targetTask.title : 'Open stopwatch'}
            subtitle={targetTask ? targetList?.name ?? 'Calendar only' : 'Not tied to a task'}
            subtitleColor={targetList?.color}
            titleControl={changeTask}
            onBreak={onBreak}
          />

          <div className="sw-controls">
            <button className={`sw-primary ${running ? 'is-running' : ''}`} onClick={() => (running ? onPause(target) : onStart(target))}>
              {running
                ? <><Pause size={14} fill="currentColor" strokeWidth={1.5} />Pause</>
                : <><Play size={14} fill="currentColor" strokeWidth={1.5} />{elapsed > 0 ? 'Resume' : 'Start'}</>}
            </button>
            <button className="secondary-button" onClick={() => onReset(target)} disabled={!hasTime(track, now)}><RotateCcw size={14} />Reset</button>
            <TimeSpentPicker
              variant="button"
              track={track}
              onChange={(seconds) => onAdjust(target, seconds)}
              taskTitle={targetTask?.title}
              buttonLabel={<><Pencil size={14} />Adjust time</>}
            />
            {targetTask
              ? (
                <>
                  <span className="sw-ctl-sep" aria-hidden="true" />
                  <TagPicker variant="button" selected={targetTask.tagIds} taskTitle={targetTask.title} onChange={(tagIds) => onSetTags(targetTask.id, tagIds)} />
                  <button className="sw-link" onClick={() => onOpenTask(targetTask.id)}>Open task<ArrowRight size={13} /></button>
                </>
              )
              : hasTime(open, now) && others.length + rows.length > 0 && (
                <>
                  <span className="sw-ctl-sep" aria-hidden="true" />
                  <label className="sw-select">
                    <span>Move to task<ChevronDown size={13} /></span>
                    <select value="" aria-label="Move the open stopwatch's time to a task" onChange={(event) => { if (event.target.value) onMoveOpenToTask(event.target.value) }}>
                      <option value="">Move to task…</option>
                      {[...rows, ...others].filter((task) => !task.completed).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                    </select>
                  </label>
                </>
              )}
          </div>
        </section>

        <DayTimeline spans={spans} now={now} breakColor={breakTag?.color} />

        <section className="sw-today" aria-label="Today">
          <div className="sw-section-head">
            <h2>Today</h2>
            {balance.work >= 60 && <span title="Working time; breaks aren't counted">{formatSpent(balance.work)}</span>}
          </div>
          {tagTotals.length > 0 && (
            <div className="sw-tag-totals" aria-label="Today by tag">
              {tagTotals.map(({ tag, seconds }) => (
                <span
                  key={tag.id}
                  className="sw-tag-total"
                  style={{ '--tag-color': tag.color } as React.CSSProperties}
                  title={tag.isBreak ? `${formatSpent(balance.between)} between sessions, ${formatSpent(balance.breakTagged)} on tasks tagged ${tag.name}` : undefined}
                >
                  <i />{tag.name}<b>{formatSpent(seconds)}</b>
                </span>
              ))}
              {balance.untagged >= 60 && <span className="sw-tag-total is-untagged"><i />No tag<b>{formatSpent(balance.untagged)}</b></span>}
            </div>
          )}
          <div
            className="sw-rows"
            onDragOver={dragOverRows}
            onDragLeave={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDropBefore(undefined) }}
            onDrop={dropOnRows}
          >
            {renderRow(null)}
            {rows.length > 0 && <div className="sw-row-divider" />}
            {rows.map((task) => renderRow(task))}
            <div className="sw-new-task">
              <QuickAdd expanded={adding} onExpand={() => setAdding(true)} onAdd={(title, openDetails) => onAddTask(title, Boolean(openDetails))} onCancel={() => setAdding(false)} />
            </div>
            {others.length > 0 && (
              <label className="sw-select sw-select-row">
                <span><Timer size={14} />Time another task<ChevronDown size={13} /></span>
                <select value="" aria-label="Choose another task to time" onChange={(event) => { if (event.target.value) onTarget(event.target.value) }}>
                  <option value="">Choose a task…</option>
                  {others.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                </select>
              </label>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
