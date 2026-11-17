import { Check, GripVertical, X } from 'lucide-react'
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { subtaskLine, textLine } from '../page'
import type { PageLine } from '../types'

// The editor for a task's page: a note written line by line, where any line can be a subtask.
// Each line is its own plain-text editable, so typing inside a line is the browser's own, and
// everything that crosses lines (Return, Delete at an edge, the arrows, paste, undo) is done here.
//
//   Return               splits the line; on an empty subtask it turns back into text
//   Delete at the start  turns a subtask back into text, or joins the line onto the one above
//   [] then a space      turns a text line into a subtask ([x] for a ticked one)
//   ⇧⌘L                  turns the line into a subtask, or back into text
//   ⌘Return              ticks or unticks the subtask
//   ⌘Z, ⇧⌘Z              undo and redo, across lines
//   the grip             beside a line on hover, drags it (and its tick) to another place

export interface PageEditorHandle {
  focusStart: () => void
  focusEnd: () => void
  addSubtask: () => void // a new subtask at the end of the page (an empty last line becomes it)
  toggleSubtask: () => void // the line being written turns into a subtask or back; with none, adds one
}

interface PageEditorProps {
  lines: PageLine[]
  onChange: (lines: PageLine[]) => void
  variant: 'panel' | 'page'
  placeholder: string
  hint?: string // shown on an empty text line while it is being written
  label: string
  onActiveKind?: (kind: PageLine['kind'] | null) => void
  onLeaveTop?: () => void // the up arrow on the first line
  ref?: React.Ref<PageEditorHandle>
}

type Caret = { id: string; offset: number; scroll?: boolean }
type Snapshot = { lines: PageLine[]; caret: Caret | null }

const CHECKLIST_PREFIX = /^(?:[-*] )?\[([ xX]?)\] /
const PASTED_SUBTASK = /^\s*(?:[-*]\s+)?\[([ xX]?)\]\s?(.*)$/
const LINE_BREAK = /\r\n|\r|\n/

function readText(element: HTMLElement) {
  return (element.textContent ?? '').replace(/ /g, ' ')
}

// Where the selection sits inside a line, as character offsets.
function selectionIn(element: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) return null
  const measure = document.createRange()
  measure.selectNodeContents(element)
  measure.setEnd(range.startContainer, range.startOffset)
  const start = measure.toString().length
  measure.setEnd(range.endContainer, range.endOffset)
  return { start, end: measure.toString().length }
}

function placeCaret(element: HTMLElement, offset: number) {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let left = offset
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0
    if (left <= length) {
      range.setStart(node, left)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      return
    }
    left -= length
  }
  range.selectNodeContents(element)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

function caretBox() {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0).cloneRange()
  range.collapse(true)
  const box = range.getClientRects()[0]
  return box && (box.width > 0 || box.height > 0) ? box : null
}

function lineHeight(element: HTMLElement) {
  return parseFloat(getComputedStyle(element).lineHeight) || 20
}

// Whether the caret is on the first (or last) wrapped row of a line, so the arrows leave it.
function onEdgeRow(element: HTMLElement, edge: 'first' | 'last') {
  const box = caretBox()
  if (!box) return true
  const bounds = element.getBoundingClientRect()
  const row = lineHeight(element)
  return edge === 'first' ? box.top < bounds.top + row * 0.75 : box.bottom > bounds.bottom - row * 0.75
}

// Puts the caret into a line at a point, falling back to its start or end.
function caretAtPoint(element: HTMLElement, x: number, y: number, fallback: number) {
  element.focus({ preventScroll: true })
  const bounds = element.getBoundingClientRect()
  const range = document.caretRangeFromPoint?.(
    Math.min(Math.max(x, bounds.left + 1), bounds.right - 1),
    Math.min(Math.max(y, bounds.top + 1), bounds.bottom - 1),
  )
  const selection = window.getSelection()
  if (range && selection && element.contains(range.startContainer)) {
    selection.removeAllRanges()
    selection.addRange(range)
  } else {
    placeCaret(element, fallback)
  }
}

export function PageEditor({ lines, onChange, variant, placeholder, hint, label, onActiveKind, onLeaveTop, ref }: PageEditorProps) {
  // An empty page still shows one line to write on; it is saved once something is written in it.
  const [blank] = useState(() => textLine())
  const view = lines.length > 0 ? lines : [blank]
  const rootRef = useRef<HTMLDivElement>(null)
  const nodes = useRef(new Map<string, HTMLDivElement>())
  const pendingCaret = useRef<Caret | null>(null)
  const caretBefore = useRef<Caret | null>(null)
  const history = useRef({ past: [] as Snapshot[], future: [] as Snapshot[], group: '', at: 0 })
  const emitted = useRef<PageLine[] | null>(null)
  const keyUndoAt = useRef(0)
  const [activeId, setActiveId] = useState<string | null>(null)

  // A change made elsewhere (a subtask ticked in a list, say) starts the history afresh, so undo
  // here only ever takes back what was done here.
  useLayoutEffect(() => {
    if (lines !== emitted.current) history.current = { past: [], future: [], group: '', at: 0 }
  }, [lines])

  // After a change that moves the caret (a split, a join, undo), put it where it belongs. The
  // lines have already written their text by now: children's layout effects run first.
  useLayoutEffect(() => {
    const caret = pendingCaret.current
    if (!caret) return
    pendingCaret.current = null
    const element = nodes.current.get(caret.id)
    if (!element) return
    element.focus({ preventScroll: true })
    placeCaret(element, Math.min(caret.offset, readText(element).length))
    if (caret.scroll !== false) element.scrollIntoView({ block: 'nearest' })
  })

  const activeKind = view.find((line) => line.id === activeId)?.kind ?? null
  useEffect(() => { onActiveKind?.(activeKind) }, [activeKind, onActiveKind])

  const currentCaret = (): Caret | null => {
    const active = document.activeElement
    if (!(active instanceof HTMLElement) || !active.dataset.lineId || !rootRef.current?.contains(active)) return null
    return { id: active.dataset.lineId, offset: selectionIn(active)?.start ?? 0 }
  }

  // Every change goes through here. Typing in one line within a second of the last keystroke
  // joins the same undo step; anything else is a step of its own.
  const commit = (next: PageLine[], caret: Caret | null, group = 'edit', before: Caret | null = currentCaret()) => {
    const record = history.current
    const now = Date.now()
    if (!(group !== 'edit' && record.group === group && now - record.at < 1000)) {
      record.past.push({ lines: view, caret: before })
      if (record.past.length > 300) record.past.shift()
    }
    record.future = []
    record.group = group
    record.at = now
    emitted.current = next
    pendingCaret.current = caret
    onChange(next)
  }

  const restore = (from: Snapshot[], to: Snapshot[]) => {
    const snapshot = from.pop()
    if (!snapshot) return
    to.push({ lines: view, caret: currentCaret() })
    history.current.group = ''
    emitted.current = snapshot.lines
    pendingCaret.current = snapshot.caret ?? (snapshot.lines[0] ? { id: snapshot.lines[0].id, offset: 0 } : null)
    onChange(snapshot.lines)
  }
  const undo = () => restore(history.current.past, history.current.future)
  const redo = () => restore(history.current.future, history.current.past)

  const replaceAt = (index: number, ...replacement: PageLine[]) => [...view.slice(0, index), ...replacement, ...view.slice(index + 1)]
  const indexOf = (id: string) => view.findIndex((line) => line.id === id)
  const textOf = (line: PageLine) => {
    const element = nodes.current.get(line.id)
    return element ? readText(element) : line.text
  }

  const split = (index: number, start: number, end: number) => {
    const line = view[index]
    const text = textOf(line)
    if (line.kind === 'subtask' && text.trim() === '') {
      commit(replaceAt(index, { id: line.id, kind: 'text', text: '' }), { id: line.id, offset: 0 })
      return
    }
    const before = text.slice(0, start)
    const after = text.slice(end)
    // At the very start of a written line the new, empty line opens above it, so a subtask keeps
    // its tick and its place in history.
    if (before === '' && after !== '') {
      const fresh = line.kind === 'subtask' ? subtaskLine() : textLine()
      commit(replaceAt(index, fresh, { ...line, text: after }), { id: line.id, offset: 0 })
      return
    }
    const fresh = line.kind === 'subtask' ? subtaskLine(after) : textLine(after)
    commit(replaceAt(index, { ...line, text: before }, fresh), { id: fresh.id, offset: 0 })
  }

  const toggleKind = (index: number) => {
    const line = view[index]
    const text = textOf(line)
    const caret = currentCaret()
    const offset = caret?.id === line.id ? caret.offset : text.length
    const next: PageLine = line.kind === 'subtask' ? { id: line.id, kind: 'text', text } : { id: line.id, kind: 'subtask', text, completed: false }
    commit(replaceAt(index, next), { id: line.id, offset })
  }

  // Ticking leaves the caret where it is (the checkbox never takes focus from the line being written).
  const toggleDone = (id: string) => {
    commit(view.map((line) => line.id === id && line.kind === 'subtask' ? { ...line, completed: !line.completed } : line), null)
  }

  const removeLine = (id: string) => {
    const index = indexOf(id)
    if (index < 0) return
    commit(view.filter((line) => line.id !== id), null)
  }

  const addSubtask = () => {
    const last = view[view.length - 1]
    if (last.kind === 'text' && textOf(last) === '') {
      commit(replaceAt(view.length - 1, { id: last.id, kind: 'subtask', text: '', completed: false }), { id: last.id, offset: 0 })
      return
    }
    const fresh = subtaskLine()
    commit([...view, fresh], { id: fresh.id, offset: 0 })
  }

  useImperativeHandle(ref, () => ({
    focusStart: () => {
      const first = nodes.current.get(view[0].id)
      if (!first) return
      first.focus({ preventScroll: true })
      placeCaret(first, 0)
    },
    focusEnd: () => {
      const last = nodes.current.get(view[view.length - 1].id)
      if (!last) return
      last.focus({ preventScroll: true })
      placeCaret(last, readText(last).length)
      last.scrollIntoView({ block: 'nearest' })
    },
    addSubtask,
    toggleSubtask: () => {
      const index = activeId ? indexOf(activeId) : -1
      if (index >= 0) toggleKind(index)
      else addSubtask()
    },
  }))

  const handleInput = (event: React.FormEvent<HTMLDivElement>) => {
    const element = event.target as HTMLElement
    const id = element.dataset.lineId
    const index = id ? indexOf(id) : -1
    if (!id || index < 0) return
    const line = view[index]
    const text = readText(element)
    const before = caretBefore.current?.id === id ? caretBefore.current : currentCaret()
    caretBefore.current = null

    // A line break that got in some other way (dropped text) makes more lines.
    if (LINE_BREAK.test(text)) {
      const [first, ...rest] = text.split(LINE_BREAK)
      const added = rest.map((part) => textLine(part))
      const last = added[added.length - 1]
      commit(replaceAt(index, { ...line, text: first }, ...added), { id: last.id, offset: last.text.length }, 'edit', before)
      return
    }

    if (line.kind === 'text') {
      const match = CHECKLIST_PREFIX.exec(text)
      if (match && selectionIn(element)?.start === match[0].length) {
        commit(replaceAt(index, { id, kind: 'subtask', text: text.slice(match[0].length), completed: match[1].toLowerCase() === 'x' }), { id, offset: 0 }, 'edit', before)
        return
      }
    }
    commit(replaceAt(index, { ...line, text }), null, `typing:${id}`, before)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const element = event.target as HTMLElement
    const id = element.dataset.lineId
    const index = id ? indexOf(id) : -1
    if (!id || index < 0 || event.nativeEvent.isComposing || event.keyCode === 229) return
    const line = view[index]
    const command = event.metaKey || event.ctrlKey
    const key = event.key

    if (command && !event.altKey && key.toLowerCase() === 'z') {
      event.preventDefault()
      keyUndoAt.current = Date.now()
      if (event.shiftKey) redo()
      else undo()
      return
    }
    if (command && event.shiftKey && key.toLowerCase() === 'l') {
      event.preventDefault()
      toggleKind(index)
      return
    }
    if (command && key === 'Enter') {
      event.preventDefault()
      if (line.kind === 'subtask') toggleDone(id)
      return
    }
    if (key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      element.blur()
      return
    }

    const selection = selectionIn(element)
    if (!selection) return
    const text = readText(element)
    const collapsed = selection.start === selection.end

    if (key === 'Enter' && !command && !event.altKey) {
      event.preventDefault()
      split(index, selection.start, selection.end)
      return
    }
    if (key === 'Backspace' && collapsed && selection.start === 0) {
      event.preventDefault()
      if (line.kind === 'subtask') {
        commit(replaceAt(index, { id, kind: 'text', text }), { id, offset: 0 })
        return
      }
      if (index === 0) return
      const previous = view[index - 1]
      const previousText = textOf(previous)
      commit([...view.slice(0, index - 1), { ...previous, text: previousText + text }, ...view.slice(index + 1)], { id: previous.id, offset: previousText.length })
      return
    }
    if (key === 'Delete' && collapsed && selection.end === text.length && index < view.length - 1) {
      event.preventDefault()
      const next = view[index + 1]
      commit([...view.slice(0, index), { ...line, text: text + textOf(next) }, ...view.slice(index + 2)], { id, offset: text.length })
      return
    }

    if (event.shiftKey || command || event.altKey) return
    const x = caretBox()?.left ?? element.getBoundingClientRect().left
    if (key === 'ArrowUp' && onEdgeRow(element, 'first')) {
      if (index === 0) {
        if (onLeaveTop) {
          event.preventDefault()
          onLeaveTop()
        }
        return
      }
      const target = nodes.current.get(view[index - 1].id)
      if (!target) return
      event.preventDefault()
      const bounds = target.getBoundingClientRect()
      caretAtPoint(target, x, bounds.bottom - lineHeight(target) / 2, readText(target).length)
      target.scrollIntoView({ block: 'nearest' })
      return
    }
    if (key === 'ArrowDown' && onEdgeRow(element, 'last') && index < view.length - 1) {
      const target = nodes.current.get(view[index + 1].id)
      if (!target) return
      event.preventDefault()
      const bounds = target.getBoundingClientRect()
      caretAtPoint(target, x, bounds.top + lineHeight(target) / 2, 0)
      target.scrollIntoView({ block: 'nearest' })
      return
    }
    if (key === 'ArrowLeft' && collapsed && selection.start === 0 && index > 0) {
      const target = nodes.current.get(view[index - 1].id)
      if (!target) return
      event.preventDefault()
      target.focus({ preventScroll: true })
      placeCaret(target, readText(target).length)
      target.scrollIntoView({ block: 'nearest' })
      return
    }
    if (key === 'ArrowRight' && collapsed && selection.end === text.length && index < view.length - 1) {
      const target = nodes.current.get(view[index + 1].id)
      if (!target) return
      event.preventDefault()
      target.focus({ preventScroll: true })
      placeCaret(target, 0)
      target.scrollIntoView({ block: 'nearest' })
    }
  }

  // Pasted text with line breaks becomes lines; "[ ] " and "- [x] " lines become subtasks.
  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const element = event.target as HTMLElement
    const id = element.dataset.lineId
    const index = id ? indexOf(id) : -1
    if (!id || index < 0) return
    const pasted = event.clipboardData.getData('text/plain')
    if (!LINE_BREAK.test(pasted)) return // one line: the browser pastes it as plain text
    event.preventDefault()
    const line = view[index]
    const text = readText(element)
    const selection = selectionIn(element) ?? { start: text.length, end: text.length }
    const before = text.slice(0, selection.start)
    const after = text.slice(selection.end)
    const rows = pasted.split(LINE_BREAK).map((row) => {
      const match = PASTED_SUBTASK.exec(row)
      return match ? { subtask: true, text: match[2], completed: match[1].toLowerCase() === 'x' } : { subtask: false, text: row, completed: false }
    })
    const [first, ...rest] = rows
    const current: PageLine = first.subtask && before === '' && line.kind === 'text'
      ? { id, kind: 'subtask', text: first.text, completed: first.completed }
      : { ...line, text: before + first.text }
    const added = rest.map((row) => row.subtask ? subtaskLine(row.text, row.completed) : textLine(row.text))
    const last = added[added.length - 1]
    const caret = { id: last.id, offset: last.text.length }
    added[added.length - 1] = { ...last, text: last.text + after }
    commit(replaceAt(index, current, ...added), caret)
  }

  // Undo and redo from the Edit menu arrive as input events; Return that slips past the key
  // handler arrives as a paragraph. Everything else is the browser's, after noting the caret.
  const latest = useRef({ undo, redo, split, indexOf })
  useLayoutEffect(() => { latest.current = { undo, redo, split, indexOf } })
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onBeforeInput = (event: InputEvent) => {
      const element = event.target instanceof HTMLElement ? event.target : null
      if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
        event.preventDefault()
        if (Date.now() - keyUndoAt.current < 300) return
        if (event.inputType === 'historyUndo') latest.current.undo()
        else latest.current.redo()
        return
      }
      const id = element?.dataset.lineId
      if (!element || !id) return
      if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
        event.preventDefault()
        const selection = selectionIn(element)
        const index = latest.current.indexOf(id)
        if (selection && index >= 0) latest.current.split(index, selection.start, selection.end)
        return
      }
      caretBefore.current = { id, offset: selectionIn(element)?.start ?? 0 }
    }
    root.addEventListener('beforeinput', onBeforeInput)
    return () => root.removeEventListener('beforeinput', onBeforeInput)
  }, [])

  // Dragging a line by its grip. The pointer is captured by the grip, the line stays where it is
  // (dimmed) while an accent rule shows where it will land, and the page scrolls when the pointer
  // nears its top or bottom edge. Dropping moves it as one undo step; Escape cancels.
  const [drag, setDrag] = useState<{ id: string; drop: number } | null>(null)
  const dragging = useRef<{ id: string; startY: number; y: number; moved: boolean; drop: number; caret: Caret | null; frame: number; onKey?: (event: KeyboardEvent) => void } | null>(null)
  const viewRef = useRef(view)
  useLayoutEffect(() => { viewRef.current = view })

  // Where a line dropped at `y` lands: before the first line whose middle is below it.
  const dropAt = (y: number) => {
    const rows = [...(rootRef.current?.children ?? [])] as HTMLElement[]
    const index = rows.findIndex((row) => { const bounds = row.getBoundingClientRect(); return y < bounds.top + bounds.height / 2 })
    return index < 0 ? rows.length : index
  }
  const followPointer = () => {
    const state = dragging.current
    if (!state) return
    const drop = dropAt(state.y)
    if (drop !== state.drop) {
      state.drop = drop
      setDrag({ id: state.id, drop })
    }
  }
  const scrollWhileDragging = () => {
    const state = dragging.current
    if (!state) return
    const scroller = rootRef.current?.closest<HTMLElement>('.focus-scroll, .panel-scroll')
    if (scroller) {
      const bounds = scroller.getBoundingClientRect()
      const edge = 56
      const step = state.y < bounds.top + edge ? -(bounds.top + edge - state.y) : state.y > bounds.bottom - edge ? state.y - (bounds.bottom - edge) : 0
      if (step !== 0) {
        scroller.scrollTop += Math.max(-18, Math.min(18, Math.round(step / 3)))
        followPointer()
      }
    }
    state.frame = requestAnimationFrame(scrollWhileDragging)
  }
  const endDrag = (apply: boolean) => {
    const state = dragging.current
    if (!state) return
    dragging.current = null
    cancelAnimationFrame(state.frame)
    if (state.onKey) window.removeEventListener('keydown', state.onKey, true)
    setDrag(null)
    if (!apply || !state.moved) return
    const lines = viewRef.current
    const from = lines.findIndex((line) => line.id === state.id)
    const to = state.drop > from ? state.drop - 1 : state.drop
    if (from < 0 || to === from) return
    const next = [...lines]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    // Moving a line can take the caret's line out of the document for a moment; put it back
    // without scrolling to it. With no caret anywhere, the moved line takes it, so ⌘Z undoes.
    const caret = state.caret ?? { id: moved.id, offset: moved.text.length }
    commit(next, { ...caret, scroll: false }, 'edit', state.caret)
  }
  const endDragRef = useRef(endDrag)
  useLayoutEffect(() => { endDragRef.current = endDrag })
  useEffect(() => () => {
    const state = dragging.current
    if (!state) return
    cancelAnimationFrame(state.frame)
    if (state.onKey) window.removeEventListener('keydown', state.onKey, true)
  }, [])

  const gripHandlers = (id: string) => ({
    onMouseDown: (event: React.MouseEvent) => event.preventDefault(),
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || dragging.current) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      dragging.current = { id, startY: event.clientY, y: event.clientY, moved: false, drop: indexOf(id), caret: currentCaret(), frame: 0 }
    },
    onPointerMove: (event: React.PointerEvent) => {
      const state = dragging.current
      if (!state) return
      state.y = event.clientY
      if (!state.moved) {
        if (Math.abs(event.clientY - state.startY) < 4) return
        state.moved = true
        state.drop = -1
        state.onKey = (key) => {
          if (key.key !== 'Escape') return
          key.preventDefault()
          key.stopPropagation()
          endDragRef.current(false)
        }
        window.addEventListener('keydown', state.onKey, true)
        state.frame = requestAnimationFrame(scrollWhileDragging)
      }
      followPointer()
    },
    onPointerUp: () => endDrag(true),
    onPointerCancel: () => endDrag(false),
    onLostPointerCapture: () => endDrag(true),
  })

  // A press beside a line (or below the last one) writes in that line, at the nearest point.
  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('button') || target.dataset.lineId) return
    const row = target.closest<HTMLElement>('[data-row-id]')
    const id = row?.dataset.rowId ?? view[view.length - 1].id
    const element = nodes.current.get(id)
    if (!element) return
    event.preventDefault()
    caretAtPoint(element, event.clientX, event.clientY, readText(element).length)
  }

  const isEmpty = view.length === 1 && view[0].kind === 'text' && view[0].text === ''

  return (
    <div
      ref={rootRef}
      className={`page-editor is-${variant} ${drag ? 'is-dragging' : ''}`}
      role="group"
      aria-label={label}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onMouseDown={handleMouseDown}
      onFocus={(event) => { const id = (event.target as HTMLElement).dataset.lineId; if (id) setActiveId(id) }}
      onBlur={(event) => { if ((event.target as HTMLElement).dataset.lineId) setActiveId(null) }}
    >
      {view.map((line, index) => {
        const done = line.kind === 'subtask' && line.completed
        const from = drag ? indexOf(drag.id) : -1
        const landsHere = drag !== null && drag.drop !== from && drag.drop !== from + 1
        const dropClass = landsHere && drag.drop === index ? 'is-drop-before' : landsHere && drag.drop === view.length && index === view.length - 1 ? 'is-drop-after' : ''
        const shownPlaceholder = isEmpty ? placeholder : hint && line.kind === 'text' && line.text === '' && activeId === line.id ? hint : null
        return (
          <div className={`page-line is-${line.kind} ${done ? 'is-done' : ''} ${drag?.id === line.id ? 'is-dragging' : ''} ${dropClass}`} key={line.id} data-row-id={line.id}>
            {view.length > 1 && (
              <button type="button" className="page-line-grip" tabIndex={-1} aria-label="Drag to move" title="Drag to move" {...gripHandlers(line.id)}>
                <GripVertical size={14} />
              </button>
            )}
            {line.kind === 'subtask' && (
              <button
                type="button"
                className="page-check"
                aria-pressed={done}
                aria-label={done ? `Mark ${line.text || 'subtask'} incomplete` : `Complete ${line.text || 'subtask'}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => toggleDone(line.id)}
              >
                <span>{done && <Check size={variant === 'page' ? 11 : 10} strokeWidth={3} />}</span>
              </button>
            )}
            <div className="page-line-body">
              <LineText
                id={line.id}
                text={line.text}
                label={line.kind === 'subtask' ? 'Subtask' : 'Note'}
                register={(element) => { if (element) nodes.current.set(line.id, element); else nodes.current.delete(line.id) }}
              />
              {shownPlaceholder && <span className="page-line-placeholder" aria-hidden="true">{shownPlaceholder}</span>}
            </div>
            {line.kind === 'subtask' && (
              <button type="button" className="page-line-remove" tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => removeLine(line.id)} aria-label={`Delete ${line.text || 'subtask'}`} title="Delete subtask">
                <X size={13} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// One line's editable text. React never renders its contents: the browser edits them, and the
// text is written in only when it differs (a split, a join, undo, a change from elsewhere).
function LineText({ id, text, label, register }: { id: string; text: string; label: string; register: (element: HTMLDivElement | null) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const registerRef = useRef(register)
  registerRef.current = register
  useLayoutEffect(() => {
    const element = ref.current
    if (element && readText(element) !== text) element.textContent = text
  })
  useLayoutEffect(() => {
    registerRef.current(ref.current)
    return () => registerRef.current(null)
  }, [id])
  return <div ref={ref} className="page-line-text" contentEditable="plaintext-only" spellCheck data-line-id={id} role="textbox" aria-label={label} />
}
