import { uid } from './data'
import type { PageLine, Subtask, Task, TextLine } from './types'

// A task's subtasks, in page order. A checkbox left without words is still on the page, waiting to
// be written, but it is not a subtask anywhere else yet.
export function subtasksOf(task: Pick<Task, 'page'>): Subtask[] {
  return task.page.filter((line): line is Subtask => line.kind === 'subtask' && line.text.trim() !== '')
}

export function completedSubtasks(task: Pick<Task, 'page'>) {
  return subtasksOf(task).filter((subtask) => subtask.completed).length
}

// Whether the page holds any writing besides its subtasks.
export function hasNotes(task: Pick<Task, 'page'>) {
  return task.page.some((line) => line.kind === 'text' && line.text.trim() !== '')
}

// The first line of writing on the page, for a reminder's body.
export function firstNote(task: Pick<Task, 'page'>) {
  return task.page.find((line): line is TextLine => line.kind === 'text' && line.text.trim() !== '')?.text.trim() ?? ''
}

// Everything on the page as one string, for search.
export function pageText(task: Pick<Task, 'page'>) {
  return task.page.map((line) => line.text).join('\n')
}

export function toggleSubtaskIn(page: PageLine[], subtaskId: string): PageLine[] {
  return page.map((line) => line.kind === 'subtask' && line.id === subtaskId ? { ...line, completed: !line.completed } : line)
}

// A fresh copy of a page for a new task: new ids and every subtask unticked. Without `withNotes`
// only the subtasks come along.
export function copyPage(page: PageLine[], withNotes: boolean): PageLine[] {
  return page.flatMap((line): PageLine[] => {
    if (line.kind === 'subtask') return [{ ...line, id: uid('line'), completed: false }]
    return withNotes ? [{ ...line, id: uid('line') }] : []
  })
}

export function textLine(text = ''): TextLine {
  return { id: uid('line'), kind: 'text', text }
}

export function subtaskLine(text = '', completed = false): Subtask {
  return { id: uid('line'), kind: 'subtask', text, completed }
}
