import { todayKey } from './format'
import { dayBalance, isBreakTask } from './tags'
import { daySpans, isRunning, totalSeconds } from './time'
import type { KnotData, SanctuaryState, Tag, Task, TimeTrack } from './types'

// The Sanctuary turns focus time into a small world. Everything it shows is derived from the
// stopwatch: time on tasks that aren't tagged as a break, plus the open stopwatch. Finished tasks
// don't count, so there is nothing to gain from splitting work into more tasks. Only what can't be derived
// is stored: keepsakes bought, glimmers spent, the tours seen, and high-water marks so lifetime
// figures never drop when old tasks are cleared or deleted.

export type EnergyState = 'asleep' | 'stirring' | 'awake' | 'lively' | 'radiant'
export type GrowthStage = 'sprout' | 'hearth' | 'elder'

export const LANTERNS = 5
export const LANTERN_MINUTES = 45 // one lantern per 45 minutes of focus today; all five at 3 h 45 m
export const GLIMMER_MINUTES = 10 // one glimmer per 10 minutes of focus

// The rules the stored high-water marks were made under. Marks from older rules (which also counted
// finished tasks and focus days) are dropped and rebuilt from focus time.
const RULES = 2

export const GROWTH_STAGES: { id: GrowthStage; name: string; from: number }[] = [
  { id: 'sprout', name: 'Sprout', from: 0 },
  { id: 'hearth', name: 'Hearth', from: 10 },
  { id: 'elder', name: 'Elder', from: 60 },
]

// Unbroken focus longer than this gets a quiet offer of a break. Gaps shorter than BREAK_GAP don't
// count as a break.
export const LONG_FOCUS_SECONDS = 50 * 60
const BREAK_GAP_SECONDS = 5 * 60

// Prices are whole hours of focus at six glimmers an hour (the starter pair is free): 408 in all,
// about 68 hours, so the hollow fills around when Hearth becomes an Elder.
export interface Keepsake {
  id: string
  name: string
  price: number
  description: string
}

export const KEEPSAKES: Keepsake[] = [
  { id: 'pebble', name: 'Pebble', price: 0, description: 'A smooth river stone.' },
  { id: 'vase', name: 'Clay vase', price: 0, description: 'A small clay vase.' },
  { id: 'sprout', name: 'Potted sprout', price: 12, description: 'A two-leaf sprout in a clay pot.' },
  { id: 'teacup', name: 'Acorn teacup', price: 18, description: 'An acorn cup for tea on a break.' },
  { id: 'starjar', name: 'Star jar', price: 24, description: 'A glass jar with a small star inside.' },
  { id: 'book', name: 'Little book', price: 36, description: 'A pocket book, left open.' },
  { id: 'mushroom', name: 'Mushroom lamp', price: 48, description: 'A toadstool that glows at night.' },
  { id: 'moth', name: 'Lantern moth', price: 60, description: 'Rests on the window rim and glows after dark.' },
  { id: 'chime', name: 'Glass wind chime', price: 90, description: 'Hangs by the moon window.' },
  { id: 'telescope', name: 'Brass telescope', price: 120, description: 'Points out of the moon window.' },
]

export const STARTER_KEEPSAKES = ['pebble', 'vase']
export const SANCTUARY_TOUR = 'sanctuary-v2'

export function emptySanctuary(): SanctuaryState {
  return { keepsakes: [...STARTER_KEEPSAKES], spent: 0, bestGrowth: 0, bestEarned: 0, rules: RULES, tourSeen: [] }
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
  // Under older rules, keep the keepsakes but start the marks and the spending afresh, so nobody
  // ends up owing glimmers.
  if (record.rules !== RULES) return { keepsakes, spent: 0, bestGrowth: 0, bestEarned: 0, rules: RULES, tourSeen }
  return { keepsakes, spent: amount(record.spent), bestGrowth: amount(record.bestGrowth), bestEarned: amount(record.bestEarned), rules: RULES, tourSeen }
}

// Hearth's mood follows the lanterns: asleep until the first minute of focus, stirring until a
// lantern is lit, then awake (1–2 lit), lively (3–4) and radiant (all five).
export function energyStateOf(focusSeconds: number, lanterns: number): EnergyState {
  if (focusSeconds < 60) return 'asleep'
  if (lanterns === 0) return 'stirring'
  if (lanterns <= 2) return 'awake'
  if (lanterns < LANTERNS) return 'lively'
  return 'radiant'
}

// How the Sanctuary and its buddies write a span of time: 2 h 20 m, 2 h, 45 m, with a thin space
// between each number and its unit.
export function hoursMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}\u2009m`
  return rest ? `${hours}\u2009h ${rest}\u2009m` : `${hours}\u2009h`
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
  energyState: EnergyState
  lanterns: number // fully lit, 0..5
  partial: number // the next lantern's glow, 0..1
  nextLanternSeconds: number // focus still needed to light the next lantern; 0 when all are lit
  today: { focusSeconds: number; breakSeconds: number }
  sap: number // lifetime focus hours, never lower than the stored mark
  growth: ReturnType<typeof stageOf>
  earned: number
  balance: number
  derived: { sap: number; earned: number } // before the high-water marks, for updating them
}

export function sanctuaryStats(data: KnotData, now = Date.now()): SanctuaryStats {
  const day = todayKey()
  const balance = dayBalance(data.tasks, data.stopwatch, data.tags, day, now)
  const lanternSeconds = LANTERN_MINUTES * 60
  const fullSeconds = LANTERNS * lanternSeconds
  const todaySeconds = Math.min(balance.work, fullSeconds)
  const lanterns = Math.floor(todaySeconds / lanternSeconds)

  let focusSeconds = totalSeconds(data.stopwatch, now)
  for (const task of data.tasks) if (!isBreakTask(task, data.tags)) focusSeconds += totalSeconds(task.time, now)
  const derivedSap = focusSeconds / 3600
  const derivedEarned = Math.floor(focusSeconds / 60 / GLIMMER_MINUTES)
  const sap = Math.max(derivedSap, data.sanctuary.bestGrowth)
  const earned = Math.max(derivedEarned, data.sanctuary.bestEarned)

  return {
    energyState: energyStateOf(balance.work, lanterns),
    lanterns,
    partial: lanterns >= LANTERNS ? 0 : (todaySeconds % lanternSeconds) / lanternSeconds,
    nextLanternSeconds: lanterns >= LANTERNS ? 0 : lanternSeconds - (todaySeconds % lanternSeconds),
    today: { focusSeconds: balance.work, breakSeconds: balance.breaks },
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
