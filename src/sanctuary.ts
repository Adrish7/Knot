import { dayKeyOf, todayKey } from './format'
import { dayBalance, isBreakTask } from './tags'
import { daySpans, isRunning, totalSeconds } from './time'
import type { KnotData, SanctuaryState, Tag, Task, TimeTrack } from './types'

// The Sanctuary turns the day's work into a small world. Everything it shows is derived from data
// Knot already keeps (stopwatch sessions, completed tasks, focus days). Only what can't be derived
// is stored: keepsakes bought, glimmers spent, the tours seen, and high-water marks so lifetime
// figures never drop when old tasks are cleared or deleted.

export type EnergyState = 'asleep' | 'stirring' | 'awake' | 'lively' | 'radiant'
export type GrowthStage = 'sprout' | 'hearth' | 'elder'

export const ENERGY_MAX = 100
const ENERGY_PER_FOCUS_MINUTE = 0.4 // 4 h 10 m of focus fills the day on its own
const ENERGY_PER_TASK = 6
const ENERGY_PER_FOCUS_DAY = 4

const GLIMMERS_PER_TASK = 3
const GLIMMER_FOCUS_MINUTES = 25
const GLIMMERS_PER_FOCUS_DAY = 5

const SAP_PER_TASK = 0.25 // growth is measured in focus hours; a finished task adds a quarter hour

export const GROWTH_STAGES: { id: GrowthStage; name: string; from: number }[] = [
  { id: 'sprout', name: 'Sprout', from: 0 },
  { id: 'hearth', name: 'Hearth', from: 10 },
  { id: 'elder', name: 'Elder', from: 60 },
]

// Unbroken focus longer than this gets a quiet offer of a break. Gaps shorter than BREAK_GAP don't
// count as a break.
export const LONG_FOCUS_SECONDS = 50 * 60
const BREAK_GAP_SECONDS = 5 * 60

export interface Keepsake {
  id: string
  name: string
  price: number
  description: string
}

export const KEEPSAKES: Keepsake[] = [
  { id: 'pebble', name: 'Pebble', price: 0, description: 'A smooth river stone. Here from the start.' },
  { id: 'vase', name: 'Clay vase', price: 0, description: 'A small clay vase. Here from the start.' },
  { id: 'sprout', name: 'Potted sprout', price: 25, description: 'A two-leaf sprout in a clay pot.' },
  { id: 'teacup', name: 'Acorn teacup', price: 30, description: 'An acorn cup for tea on a break.' },
  { id: 'starjar', name: 'Star jar', price: 40, description: 'A glass jar with a small star inside.' },
  { id: 'book', name: 'Little book', price: 45, description: 'A pocket book, left open.' },
  { id: 'mushroom', name: 'Mushroom lamp', price: 50, description: 'A toadstool that glows at night.' },
  { id: 'moth', name: 'Lantern moth', price: 60, description: 'Rests on the window rim and glows after dark.' },
  { id: 'chime', name: 'Glass wind chime', price: 90, description: 'Hangs by the moon window.' },
  { id: 'telescope', name: 'Brass telescope', price: 120, description: 'Points out of the moon window.' },
]

export const STARTER_KEEPSAKES = ['pebble', 'vase']
export const SANCTUARY_TOUR = 'sanctuary-v1'

export function emptySanctuary(): SanctuaryState {
  return { keepsakes: [...STARTER_KEEPSAKES], spent: 0, bestGrowth: 0, bestEarned: 0, tourSeen: [] }
}

export function normalizeSanctuary(value: unknown): SanctuaryState {
  const empty = emptySanctuary()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return empty
  const record = value as Record<string, unknown>
  const known = new Set(KEEPSAKES.map((item) => item.id))
  const keepsakes = Array.isArray(record.keepsakes)
    ? [...new Set([...STARTER_KEEPSAKES, ...record.keepsakes.filter((id): id is string => typeof id === 'string' && known.has(id))])]
    : empty.keepsakes
  const amount = (input: unknown) => typeof input === 'number' && Number.isFinite(input) && input > 0 ? input : 0
  const tourSeen = Array.isArray(record.tourSeen) ? [...new Set(record.tourSeen.filter((id): id is string => typeof id === 'string'))] : []
  return { keepsakes, spent: amount(record.spent), bestGrowth: amount(record.bestGrowth), bestEarned: amount(record.bestEarned), tourSeen }
}

export function energyStateOf(energy: number): EnergyState {
  if (energy <= 0) return 'asleep'
  if (energy < 20) return 'stirring'
  if (energy < 45) return 'awake'
  if (energy < 80) return 'lively'
  return 'radiant'
}

export function stageOf(sap: number) {
  let index = 0
  GROWTH_STAGES.forEach((stage, i) => { if (sap >= stage.from) index = i })
  const stage = GROWTH_STAGES[index]
  const next = GROWTH_STAGES[index + 1] ?? null
  // Progress through the current stage, 0..1 (1 at the final stage).
  const progress = next ? (sap - stage.from) / (next.from - stage.from) : 1
  return { stage, next, progress: Math.min(1, Math.max(0, progress)), toNext: next ? Math.max(0, next.from - sap) : 0 }
}

export interface SanctuaryStats {
  energy: number
  energyState: EnergyState
  lanterns: number // fully lit, 0..5
  partial: number // the next lantern's glow, 0..1
  today: { tasksDone: number; focusSeconds: number; breakSeconds: number; focusDaysKept: number }
  sap: number // lifetime focus hours plus task credit, never lower than the stored mark
  growth: ReturnType<typeof stageOf>
  earned: number
  balance: number
  derived: { sap: number; earned: number } // before the high-water marks, for updating them
}

function completedOn(task: Task, day: string) {
  return task.completed && task.completedAt !== null && dayKeyOf(new Date(task.completedAt)) === day
}

export function sanctuaryStats(data: KnotData, now = Date.now()): SanctuaryStats {
  const day = todayKey()
  const balance = dayBalance(data.tasks, data.stopwatch, data.tags, day, now)
  const tasksDone = data.tasks.filter((task) => completedOn(task, day)).length
  const focusDaysKept = data.tasks.filter((task) => task.focusStatus[day] === 'done').length
  const energy = Math.min(ENERGY_MAX, Math.round(balance.work / 60 * ENERGY_PER_FOCUS_MINUTE + tasksDone * ENERGY_PER_TASK + focusDaysKept * ENERGY_PER_FOCUS_DAY))

  let focusSeconds = totalSeconds(data.stopwatch, now)
  let completed = 0
  let keptDays = 0
  for (const task of data.tasks) {
    if (!isBreakTask(task, data.tags)) focusSeconds += totalSeconds(task.time, now)
    if (task.completed) completed += 1
    keptDays += Object.values(task.focusStatus).filter((status) => status === 'done').length
  }
  const derivedSap = focusSeconds / 3600 + completed * SAP_PER_TASK
  const derivedEarned = completed * GLIMMERS_PER_TASK + Math.floor(focusSeconds / 60 / GLIMMER_FOCUS_MINUTES) + keptDays * GLIMMERS_PER_FOCUS_DAY
  const sap = Math.max(derivedSap, data.sanctuary.bestGrowth)
  const earned = Math.max(derivedEarned, data.sanctuary.bestEarned)

  return {
    energy,
    energyState: energyStateOf(energy),
    lanterns: Math.floor(energy / 20),
    partial: energy >= ENERGY_MAX ? 0 : (energy % 20) / 20,
    today: { tasksDone, focusSeconds: balance.work, breakSeconds: balance.breaks, focusDaysKept },
    sap,
    growth: stageOf(sap),
    earned,
    balance: Math.max(0, earned - data.sanctuary.spent),
    derived: { sap: derivedSap, earned: derivedEarned },
  }
}

// The marks are only raised in steps (a tenth of an hour, a whole glimmer) so a running stopwatch
// doesn't save the file every few seconds.
export function raisedMarks(state: SanctuaryState, stats: SanctuaryStats): SanctuaryState | null {
  const sap = Math.floor(stats.derived.sap * 10) / 10
  const earned = Math.floor(stats.derived.earned)
  if (sap <= state.bestGrowth && earned <= state.bestEarned) return null
  return { ...state, bestGrowth: Math.max(state.bestGrowth, sap), bestEarned: Math.max(state.bestEarned, earned) }
}

export type FocusMood = 'asleep' | 'awake' | 'focused' | 'tired' | 'break'

export interface FocusCompanion {
  mood: FocusMood
  focus: number // 0..1, how far into a long stretch: drives Cinder's flame
  unbrokenSeconds: number // current stretch of work without a break of BREAK_GAP or more
  lastEnd: number | null // when work last stopped, while nothing runs
}

const AWAKE_AFTER_PAUSE_MS = 2 * 60_000
const SETTLING_SECONDS = 5 * 60

// What Cinder, the focus companion on the Stopwatch page, is doing right now. `restingFromNote` is
// set when the user took the break Cinder offered; it lasts until work starts again.
export function focusCompanion(tasks: Task[], open: TimeTrack, tags: Tag[], now = Date.now(), restingFromNote = false): FocusCompanion {
  const day = todayKey()
  const running = tasks.find((task) => isRunning(task.time))
  if (running && isBreakTask(running, tags)) return { mood: 'break', focus: 0.3, unbrokenSeconds: 0, lastEnd: null }

  const spans = daySpans(open, day, now)
  for (const task of tasks) if (!isBreakTask(task, tags)) spans.push(...daySpans(task.time, day, now))
  spans.sort((a, b) => a.start - b.start)
  const last = spans[spans.length - 1]
  if (!last) return { mood: 'asleep', focus: 0, unbrokenSeconds: 0, lastEnd: null }

  // The block of work the latest span belongs to: spans joined by gaps shorter than a break.
  let blockStart = last.start
  let reach = last.end
  for (let i = spans.length - 2; i >= 0; i -= 1) {
    const span = spans[i]
    if (blockStart - span.end >= BREAK_GAP_SECONDS * 1000) break
    blockStart = Math.min(blockStart, span.start)
    reach = Math.max(reach, span.end)
  }
  const unbrokenSeconds = (reach - blockStart) / 1000
  const isOn = running !== undefined || isRunning(open)

  if (!isOn) {
    const sinceEnd = now - reach
    if (restingFromNote) return { mood: 'break', focus: 0.3, unbrokenSeconds, lastEnd: reach }
    if (unbrokenSeconds >= LONG_FOCUS_SECONDS && sinceEnd < BREAK_GAP_SECONDS * 1000) return { mood: 'break', focus: 0.3, unbrokenSeconds, lastEnd: reach }
    if (sinceEnd < AWAKE_AFTER_PAUSE_MS) return { mood: 'awake', focus: 0.18, unbrokenSeconds, lastEnd: reach }
    return { mood: 'asleep', focus: 0, unbrokenSeconds: 0, lastEnd: reach }
  }
  const sessionSeconds = (last.end - last.start) / 1000
  if (unbrokenSeconds >= LONG_FOCUS_SECONDS) return { mood: 'tired', focus: 1, unbrokenSeconds, lastEnd: null }
  if (sessionSeconds < SETTLING_SECONDS && unbrokenSeconds < SETTLING_SECONDS) return { mood: 'awake', focus: 0.18, unbrokenSeconds, lastEnd: null }
  return { mood: 'focused', focus: Math.min(1, unbrokenSeconds / LONG_FOCUS_SECONDS), unbrokenSeconds, lastEnd: null }
}
