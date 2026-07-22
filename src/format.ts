import type { Task } from './types'

const day = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const dayWithYear = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function todayKey() {
  return dateKey(new Date())
}

export function parseDateKey(key: string) {
  const [year, month, dayOfMonth] = key.split('-').map(Number)
  return new Date(year, month - 1, dayOfMonth)
}

export function formatDayKey(key: string) {
  const value = parseDateKey(key)
  const now = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (value.toDateString() === now.toDateString()) return 'Today'
  if (value.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
  return (value.getFullYear() === now.getFullYear() ? day : dayWithYear).format(value)
}

export function isToday(iso: string | null) {
  if (!iso) return false
  const value = new Date(iso)
  const now = new Date()
  return value.getFullYear() === now.getFullYear() && value.getMonth() === now.getMonth() && value.getDate() === now.getDate()
}

export function isOverdue(task: Task) {
  return Boolean(!task.completed && task.dueAt && new Date(task.dueAt).getTime() < Date.now() && !isToday(task.dueAt))
}

export function formatDue(iso: string | null) {
  if (!iso) return ''
  const value = new Date(iso)
  if (!Number.isFinite(value.getTime())) return ''
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  const now = new Date()
  const prefix = sameDay(value, now)
    ? 'Today'
    : sameDay(value, tomorrow)
      ? 'Tomorrow'
      : (value.getFullYear() === now.getFullYear() ? day : dayWithYear).format(value)
  return `${prefix}, ${time.format(value)}`
}

export function timeAgo(iso: string | null, fallback = '') {
  if (!iso) return fallback
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.floor(hours / 24)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

export function completedSubtasks(task: Task) {
  return task.subtasks.filter((subtask) => subtask.completed).length
}
