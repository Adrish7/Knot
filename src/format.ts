import type { Task } from './types'

const day = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const dayWithYear = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// The day turns over at 6 AM rather than midnight, so work done late at night still counts toward
// the evening it belongs to. That covers "which day is it now", the edges of a tracked day, and
// which day a due time falls on (due 1 AM Friday belongs to Thursday night). Planned days are
// plain calendar dates.
export const DAY_START_HOUR = 6

// The day a moment counts toward.
export function dayKeyOf(date: Date) {
  const shifted = new Date(date)
  if (shifted.getHours() < DAY_START_HOUR) shifted.setDate(shifted.getDate() - 1)
  return dateKey(shifted)
}

export function todayKey() {
  return dayKeyOf(new Date())
}

// Today as a local midnight Date, for calendars and date arithmetic.
export function todayDate() {
  return parseDateKey(todayKey())
}

export function parseDateKey(key: string) {
  const [year, month, dayOfMonth] = key.split('-').map(Number)
  return new Date(year, month - 1, dayOfMonth)
}

export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// 'Today', 'Tomorrow', or the date (with the year only when it is not the current one).
function relativeDayLabel(value: Date) {
  const now = todayDate()
  if (sameDay(value, now)) return 'Today'
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (sameDay(value, tomorrow)) return 'Tomorrow'
  return (value.getFullYear() === now.getFullYear() ? day : dayWithYear).format(value)
}

export function formatDayKey(key: string) {
  return relativeDayLabel(parseDateKey(key))
}

export function isToday(iso: string | null) {
  return Boolean(iso) && dayKeyOf(new Date(iso as string)) === todayKey()
}

// A task belongs on the Today page when it is due today or planned onto today.
export function isForToday(task: Task) {
  return isToday(task.dueAt) || task.focusDates.includes(todayKey())
}

export function isOverdue(task: Task) {
  return Boolean(!task.completed && task.dueAt && new Date(task.dueAt).getTime() < Date.now() && !isToday(task.dueAt))
}

export function formatDue(iso: string | null) {
  if (!iso) return ''
  const value = new Date(iso)
  if (!Number.isFinite(value.getTime())) return ''
  return `${relativeDayLabel(parseDateKey(dayKeyOf(value)))}, ${time.format(value)}`
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

// '45m', '2h', '1h 30m'.
export function formatTimeSpent(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}m`
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}
