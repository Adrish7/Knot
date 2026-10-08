import { DAY_START_HOUR, dateKey, dayKeyOf, formatTimeSpent, parseDateKey } from './format'
import type { TimeSession, TimeTrack } from './types'

// A track is the record of time on one thing: stopwatch sessions plus by-hand adjustments. The
// open stopwatch and every task each carry one. Only the last session may still be running.

export function emptyTrack(): TimeTrack {
  return { sessions: [], adjustments: {} }
}

export function runningSince(track: TimeTrack): number | null {
  const last = track.sessions[track.sessions.length - 1]
  return last && last.end === null ? new Date(last.start).getTime() : null
}

export function isRunning(track: TimeTrack) {
  return runningSince(track) !== null
}

function bounds(session: TimeSession, now: number): [number, number] {
  const start = new Date(session.start).getTime()
  const end = session.end === null ? now : new Date(session.end).getTime()
  return [start, Math.max(start, end)]
}

// Whole milliseconds, so repeated fractional adjustments can't drift a total a hair under a second.
const toMillis = (seconds: number) => Math.round(seconds * 1000) / 1000

export function totalSeconds(track: TimeTrack, now = Date.now()) {
  const fromSessions = track.sessions.reduce((sum, session) => {
    const [start, end] = bounds(session, now)
    return sum + (end - start) / 1000
  }, 0)
  const adjusted = Object.values(track.adjustments).reduce((sum, seconds) => sum + seconds, 0)
  return Math.max(0, toMillis(fromSessions + adjusted))
}

// Running, or at least a whole second logged; fractions left by adjustments don't count.
export function hasTime(track: TimeTrack, now = Date.now()) {
  return isRunning(track) || totalSeconds(track, now) >= 1
}

// A tracked day runs from DAY_START_HOUR to the same hour the next morning.
function dayBounds(day: string): [number, number] {
  const date = parseDateKey(day)
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), DAY_START_HOUR)
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, DAY_START_HOUR)
  return [start.getTime(), end.getTime()]
}

export interface DaySpan {
  start: number // ms, clipped to the day
  end: number
  running: boolean
}

// The parts of a track's sessions that fall inside `day`, oldest first.
export function daySpans(track: TimeTrack, day: string, now = Date.now()): DaySpan[] {
  const [dayStart, dayEnd] = dayBounds(day)
  return track.sessions.flatMap((session) => {
    const [start, end] = bounds(session, now)
    const from = Math.max(start, dayStart)
    const to = Math.min(end, dayEnd)
    return to > from ? [{ start: from, end: to, running: session.end === null }] : []
  })
}

// Seconds on `day`: the session portions inside it plus that day's by-hand adjustment.
export function daySeconds(track: TimeTrack, day: string, now = Date.now()) {
  const fromSessions = daySpans(track, day, now).reduce((sum, span) => sum + (span.end - span.start) / 1000, 0)
  return Math.max(0, toMillis(fromSessions + (track.adjustments[day] ?? 0)))
}

export function startTrack(track: TimeTrack, now = Date.now()): TimeTrack {
  if (isRunning(track)) return track
  return { ...track, sessions: [...track.sessions, { start: new Date(now).toISOString(), end: null }] }
}

export function pauseTrack(track: TimeTrack, now = Date.now()): TimeTrack {
  const since = runningSince(track)
  if (since === null) return track
  const last = track.sessions[track.sessions.length - 1]
  const sessions = track.sessions.slice(0, -1)
  // A run shorter than a second is a double click, not a session.
  if (now - since >= 1000) sessions.push({ start: last.start, end: new Date(Math.max(since, now)).toISOString() })
  return { ...track, sessions }
}

// Makes the total read `seconds` by adjusting `day`'s entry; a running session keeps running.
// The difference keeps its fraction so the total lands exactly on the value asked for.
export function setTotalSeconds(track: TimeTrack, seconds: number, day: string, now = Date.now()): TimeTrack {
  const delta = toMillis(seconds - totalSeconds(track, now))
  if (delta === 0) return track
  const adjustments = { ...track.adjustments }
  if (delta > 0) {
    adjustments[day] = toMillis((adjustments[day] ?? 0) + delta)
    return { ...track, adjustments: withoutZeros(adjustments) }
  }
  // Taking time off starts with `day`, then the most recent other days, so no day is left
  // below zero and the calendar's per-day figures still add up to the total.
  let remaining = -delta
  for (const key of [day, ...trackDays(track, now).filter((other) => other !== day).reverse()]) {
    if (remaining <= 0) break
    const take = Math.min(remaining, daySeconds(track, key, now))
    if (take <= 0) continue
    adjustments[key] = toMillis((adjustments[key] ?? 0) - take)
    remaining = toMillis(remaining - take)
  }
  return { ...track, adjustments: withoutZeros(adjustments) }
}

function withoutZeros(adjustments: Record<string, number>) {
  return Object.fromEntries(Object.entries(adjustments).filter(([, seconds]) => seconds !== 0))
}

// Every day the track has time on, oldest first.
export function trackDays(track: TimeTrack, now = Date.now()) {
  const days = new Set(Object.keys(track.adjustments))
  for (const session of track.sessions) {
    const [start, end] = bounds(session, now)
    const last = dayKeyOf(new Date(Math.max(start, end - 1)))
    for (let cursor = parseDateKey(dayKeyOf(new Date(start))); dateKey(cursor) <= last; cursor.setDate(cursor.getDate() + 1)) {
      days.add(dateKey(cursor))
    }
  }
  return [...days].sort()
}

// Folds `from` into `into`. The result runs if either was running.
export function mergeTracks(into: TimeTrack, from: TimeTrack, now = Date.now()): TimeTrack {
  const wasRunning = isRunning(into) || isRunning(from)
  const a = pauseTrack(into, now)
  const b = pauseTrack(from, now)
  const adjustments = { ...a.adjustments }
  for (const [day, seconds] of Object.entries(b.adjustments)) adjustments[day] = (adjustments[day] ?? 0) + seconds
  const merged: TimeTrack = {
    sessions: [...a.sessions, ...b.sessions].sort((x, y) => new Date(x.start).getTime() - new Date(y.start).getTime()),
    adjustments,
  }
  return wasRunning ? startTrack(merged, now) : merged
}

const pad = (value: number) => String(value).padStart(2, '0')

// '07:42' until the first hour, then '1:07:42'.
export function formatClock(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = whole % 60
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`
}

// '45m', '1h 30m'; under a minute reads '<1m'.
export function formatSpent(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60)
  if (minutes === 0) return seconds >= 1 ? '<1m' : '0m'
  return formatTimeSpent(minutes)
}
