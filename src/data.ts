import { dateKey } from './format'
import type { DeletedTask, KnotData, Preferences, Recurrence, Subtask, Task, TaskList } from './types'

export const TRASH_RETENTION_DAYS = 30

export const palette = ['#6d8a64', '#b3714e', '#5f81a6', '#9d6f98', '#b16a7c', '#4f8f86', '#ab8d52', '#8f8a4e', '#a85c50', '#7379a8', '#8d7b68', '#6f7f88']
const recurrences: Recurrence[] = ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly']
const sortModes: Preferences['sortMode'][] = ['manual', 'date', 'starred']
const themes: Preferences['theme'][] = ['light', 'dark', 'system']

export function createDefaultPreferences(): Preferences {
  return {
    theme: 'system',
    sortMode: 'manual',
    sidebarCollapsed: false,
    launchAtLogin: true,
  }
}

export function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function isoDate(daysFromNow: number, hour = 17, minute = 0) {
  const date = new Date()
  date.setDate(date.getDate() + daysFromNow)
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
}

function dayKey(daysFromNow: number) {
  const date = new Date()
  date.setDate(date.getDate() + daysFromNow)
  return dateKey(date)
}

export function createTask(listId: string, title: string, sortOrder: number): Task {
  return {
    id: uid('task'),
    listId,
    title: title.trim(),
    notes: '',
    dueAt: null,
    focusDates: [],
    reminderAt: null,
    recurrence: 'none',
    starred: false,
    completed: false,
    completedAt: null,
    createdAt: new Date().toISOString(),
    sortOrder,
    subtasks: [],
  }
}

export function createSeedData(): KnotData {
  const now = new Date().toISOString()
  const focusId = uid('list')
  const personalId = uid('list')
  const somedayId = uid('list')
  const make = (listId: string, title: string, order: number, extra: Partial<Task> = {}) => ({
    ...createTask(listId, title, order),
    ...extra,
  })

  return {
    version: 1,
    lists: [
      { id: focusId, name: 'This week', color: palette[0], createdAt: now, sortOrder: 0 },
      { id: personalId, name: 'Personal', color: palette[1], createdAt: now, sortOrder: 1 },
      { id: somedayId, name: 'Ideas', color: palette[2], createdAt: now, sortOrder: 2 },
    ],
    tasks: [
      make(focusId, 'Shape the week', 0, {
        notes: 'Choose the three outcomes that would make this week feel complete.',
        dueAt: isoDate(0, 18),
        focusDates: [dayKey(0)],
        starred: true,
        subtasks: [
          { id: uid('subtask'), title: 'Review calendar', completed: true },
          { id: uid('subtask'), title: 'Choose top three outcomes', completed: false },
        ],
      }),
      make(focusId, 'Send the project update', 1, { dueAt: isoDate(1, 16, 30), focusDates: [dayKey(0), dayKey(1)] }),
      make(focusId, 'Friday weekly review', 2, { dueAt: isoDate(3, 17), recurrence: 'weekly' as Recurrence }),
      make(personalId, 'Book a table for Saturday', 0, { dueAt: isoDate(2, 19) }),
      make(personalId, 'Water the plants', 1, { recurrence: 'weekly' as Recurrence }),
      make(somedayId, 'Plan a screen-free Sunday', 0, { notes: 'Walk, a good lunch, and the book on the nightstand.' }),
      make(somedayId, 'Learn to make fresh pasta', 1),
    ],
    trash: [],
    preferences: createDefaultPreferences(),
  }
}

export function normalizeData(value: unknown): KnotData | null {
  if (!isRecord(value) || !Array.isArray(value.lists)) return null

  const now = new Date().toISOString()
  const listIds = new Set<string>()
  const lists = value.lists.flatMap((candidate, index): TaskList[] => {
    if (!isRecord(candidate) || typeof candidate.id !== 'string' || !candidate.id.trim() || listIds.has(candidate.id)) return []
    listIds.add(candidate.id)
    return [{
      id: candidate.id,
      name: cleanText(candidate.name) || 'Untitled list',
      color: cleanText(candidate.color) || palette[index % palette.length],
      createdAt: validIso(candidate.createdAt) || now,
      sortOrder: finiteNumber(candidate.sortOrder, index),
    }]
  })

  const taskIds = new Set<string>()
  const rawTasks = Array.isArray(value.tasks) ? value.tasks : []
  let recoveredListId: string | null = null
  const recoveryList = () => {
    if (recoveredListId) return recoveredListId
    recoveredListId = lists[0]?.id ?? uid('list')
    if (lists.length === 0) {
      lists.push({ id: recoveredListId, name: 'Recovered tasks', color: palette[0], createdAt: now, sortOrder: 0 })
      listIds.add(recoveredListId)
    }
    return recoveredListId
  }
  const tasks = rawTasks.flatMap((candidate, index): Task[] => {
    if (!isRecord(candidate) || typeof candidate.id !== 'string' || !candidate.id.trim() || taskIds.has(candidate.id)) return []
    const listId = typeof candidate.listId === 'string' && listIds.has(candidate.listId) ? candidate.listId : recoveryList()
    taskIds.add(candidate.id)
    return [normalizeTask(candidate, listId, index, now)]
  })

  const rawTrash = Array.isArray(value.trash) ? value.trash : []
  const trashIds = new Set<string>()
  const cutoff = Date.now() - TRASH_RETENTION_DAYS * 86_400_000
  const trash = rawTrash.flatMap((entry, index): DeletedTask[] => {
    if (!isRecord(entry) || !isRecord(entry.task)) return []
    const candidate = entry.task
    if (typeof candidate.id !== 'string' || !candidate.id.trim() || trashIds.has(candidate.id) || taskIds.has(candidate.id)) return []
    const deletedAt = validIso(entry.deletedAt) || now
    if (new Date(deletedAt).getTime() < cutoff) return []
    trashIds.add(candidate.id)
    const listId = typeof candidate.listId === 'string' ? candidate.listId : ''
    return [{
      task: normalizeTask(candidate, listId, index, now),
      listName: cleanText(entry.listName) || 'Untitled list',
      deletedAt,
    }]
  })

  const defaults = createDefaultPreferences()
  const preferences = isRecord(value.preferences) ? value.preferences : {}
  return {
    version: 1,
    lists,
    tasks,
    trash,
    preferences: {
      theme: themes.includes(preferences.theme as Preferences['theme']) ? preferences.theme as Preferences['theme'] : defaults.theme,
      sortMode: sortModes.includes(preferences.sortMode as Preferences['sortMode']) ? preferences.sortMode as Preferences['sortMode'] : defaults.sortMode,
      sidebarCollapsed: typeof preferences.sidebarCollapsed === 'boolean' ? preferences.sidebarCollapsed : defaults.sidebarCollapsed,
      launchAtLogin: typeof preferences.launchAtLogin === 'boolean' ? preferences.launchAtLogin : defaults.launchAtLogin,
    },
  }
}

function normalizeTask(candidate: Record<string, unknown>, listId: string, index: number, now: string): Task {
  const recurrence = recurrences.includes(candidate.recurrence as Recurrence) ? candidate.recurrence as Recurrence : 'none'
  const completed = Boolean(candidate.completed)
  return {
    id: candidate.id as string,
    listId,
    title: cleanText(candidate.title) || 'Untitled task',
    notes: typeof candidate.notes === 'string' ? candidate.notes : '',
    dueAt: nullableIso(candidate.dueAt),
    focusDates: normalizeFocusDates(candidate.focusDates),
    reminderAt: nullableIso(candidate.reminderAt),
    recurrence,
    starred: Boolean(candidate.starred),
    completed,
    completedAt: completed ? nullableIso(candidate.completedAt) : null,
    createdAt: validIso(candidate.createdAt) || now,
    sortOrder: finiteNumber(candidate.sortOrder, index),
    subtasks: normalizeSubtasks(candidate.subtasks),
  }
}

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function normalizeFocusDates(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const keys = value.filter((item): item is string => typeof item === 'string' && DAY_KEY_PATTERN.test(item))
  return [...new Set(keys)].sort()
}

function normalizeSubtasks(value: unknown): Subtask[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  return value.flatMap((candidate): Subtask[] => {
    if (!isRecord(candidate) || typeof candidate.id !== 'string' || !candidate.id.trim() || ids.has(candidate.id)) return []
    ids.add(candidate.id)
    return [{ id: candidate.id, title: cleanText(candidate.title) || 'Untitled subtask', completed: Boolean(candidate.completed) }]
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function validIso(value: unknown) {
  if (typeof value !== 'string' || !Number.isFinite(new Date(value).getTime())) return null
  return value
}

function nullableIso(value: unknown) {
  return value === null ? null : validIso(value)
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function nextOccurrence(iso: string | null, recurrence: Recurrence) {
  if (!iso || recurrence === 'none') return null
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return null
  if (recurrence === 'daily') date.setDate(date.getDate() + 1)
  if (recurrence === 'weekdays') {
    do date.setDate(date.getDate() + 1)
    while (date.getDay() === 0 || date.getDay() === 6)
  }
  if (recurrence === 'weekly') date.setDate(date.getDate() + 7)
  if (recurrence === 'monthly') {
    const dayOfMonth = date.getDate()
    date.setDate(1)
    date.setMonth(date.getMonth() + 1)
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
    date.setDate(Math.min(dayOfMonth, lastDay))
  }
  if (recurrence === 'yearly') {
    const month = date.getMonth()
    const dayOfMonth = date.getDate()
    date.setDate(1)
    date.setFullYear(date.getFullYear() + 1)
    date.setMonth(month)
    const lastDay = new Date(date.getFullYear(), month + 1, 0).getDate()
    date.setDate(Math.min(dayOfMonth, lastDay))
  }
  return date.toISOString()
}
