import { daySeconds, daySpans } from './time'
import type { Tag, Task, TimeTrack } from './types'

// Tags label tasks across lists. One of them is the break tag: time on tasks wearing it is a break,
// the same as the time between sessions, so it is left out of the day's working time.

export function sortTags(tags: Tag[]) {
  return [...tags].sort((a, b) => a.sortOrder - b.sortOrder)
}

export function breakTagOf(tags: Tag[]) {
  return tags.find((tag) => tag.isBreak) ?? null
}

export function isBreakTask(task: Task, tags: Tag[]) {
  const breakTag = breakTagOf(tags)
  return breakTag !== null && task.tagIds.includes(breakTag.id)
}

export interface DayBalance {
  work: number // seconds on everything that isn't a break
  tasks: number // tasks with working time
  breakTagged: number // seconds on break-tagged tasks
  between: number // seconds between sessions (not counting the time since the last one)
  breaks: number // breakTagged + between
  byTag: Map<string, number> // seconds per tag; a task with two tags counts toward both
  untagged: number // seconds on the open stopwatch and on tasks without tags
}

export function dayBalance(tasks: Task[], open: TimeTrack, tags: Tag[], day: string, now: number): DayBalance {
  const breakTag = breakTagOf(tags)
  const balance: DayBalance = { work: 0, tasks: 0, breakTagged: 0, between: 0, breaks: 0, byTag: new Map(), untagged: 0 }
  const spans = daySpans(open, day, now)
  const openSeconds = daySeconds(open, day, now)
  balance.work += openSeconds
  balance.untagged += openSeconds
  for (const task of tasks) {
    spans.push(...daySpans(task.time, day, now))
    const seconds = daySeconds(task.time, day, now)
    if (seconds <= 0) continue
    if (breakTag && task.tagIds.includes(breakTag.id)) balance.breakTagged += seconds
    else {
      balance.work += seconds
      balance.tasks += 1
    }
    if (task.tagIds.length === 0) balance.untagged += seconds
    for (const id of task.tagIds) balance.byTag.set(id, (balance.byTag.get(id) ?? 0) + seconds)
  }
  spans.sort((a, b) => a.start - b.start)
  let reached = spans[0]?.end ?? 0
  for (const span of spans.slice(1)) {
    if (span.start > reached) balance.between += (span.start - reached) / 1000
    reached = Math.max(reached, span.end)
  }
  balance.breaks = balance.breakTagged + balance.between
  return balance
}
