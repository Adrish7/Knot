export type ThemeMode = 'light' | 'dark' | 'system'
export type Recurrence = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly'
export type SortMode = 'manual' | 'date' | 'starred'
export type FocusStatus = 'done' | 'missed'
export type ViewId = 'all' | 'today' | 'calendar' | 'starred' | 'stopwatch' | 'sanctuary' | 'completed' | 'trash' | `list:${string}`

export interface TaskList {
  id: string
  name: string
  color: string
  createdAt: string
  sortOrder: number
}

// A label a task can carry alongside its list, e.g. Productive or Relaxing. Exactly one tag is the
// break tag: time on tasks wearing it counts as a break, the same as the gaps between sessions.
export interface Tag {
  id: string
  name: string
  color: string
  isBreak: boolean
  sortOrder: number
}

export interface Subtask {
  id: string
  title: string
  completed: boolean
}

export interface TimeSession {
  start: string // ISO
  end: string | null // null while the stopwatch is running
}

export interface TimeTrack {
  sessions: TimeSession[] // stopwatch runs, oldest first; only the last may be open
  adjustments: Record<string, number> // day key -> seconds added (or removed) by hand that day
}

export interface Task {
  id: string
  listId: string | null // null means the task exists only on its calendar day(s)
  title: string
  notes: string
  dueAt: string | null
  focusDates: string[] // local day keys, 'YYYY-MM-DD'
  focusStatus: Record<string, FocusStatus> // day key -> outcome for that focus day
  focusOrder: Record<string, number> // day key -> position among that day's tasks (unset = original order, after ordered ones); also the Today page order
  starredOrder: number | null // position on the Starred page (null = original order, after ordered ones)
  stopwatchOrder: number | null // position in the Stopwatch page's Today list (null = order added, after ordered ones)
  reminderAt: string | null
  recurrence: Recurrence
  starred: boolean
  completed: boolean
  completedAt: string | null
  createdAt: string
  sortOrder: number
  subtasks: Subtask[]
  tagIds: string[]
  time: TimeTrack // time spent on the task, whatever its state
}

export interface DeletedTask {
  task: Task
  listName: string
  deletedAt: string
}

export interface Preferences {
  theme: ThemeMode
  sortMode: SortMode
  sidebarCollapsed: boolean
  launchAtLogin: boolean
  sanctuary: boolean // the Sanctuary, Hearth and Cinder; off, none of it is loaded or drawn
}

// The Sanctuary's stored state; everything else it shows is derived (see sanctuary.ts).
export interface SanctuaryState {
  keepsakes: string[] // ids of keepsakes owned
  spent: number // glimmers spent on keepsakes
  bestGrowth: number // high-water mark of lifetime growth, so clearing old tasks never shrinks it
  bestEarned: number // high-water mark of glimmers earned
  rules: number // which earning rules the marks were made under; older marks are rebuilt
  tourSeen: string[] // walkthroughs already shown
}

export interface KnotData {
  version: 1
  lists: TaskList[]
  tags: Tag[]
  tasks: Task[]
  trash: DeletedTask[]
  stopwatch: TimeTrack // the open stopwatch, not tied to any task
  sanctuary: SanctuaryState
  preferences: Preferences
}
