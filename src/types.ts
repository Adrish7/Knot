export type ThemeMode = 'light' | 'dark' | 'system'
export type Recurrence = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly'
export type SortMode = 'manual' | 'date' | 'starred'
export type FocusStatus = 'done' | 'missed'
export type ViewId = 'all' | 'today' | 'calendar' | 'starred' | 'completed' | 'trash' | `list:${string}`

export interface TaskList {
  id: string
  name: string
  color: string
  createdAt: string
  sortOrder: number
}

export interface Subtask {
  id: string
  title: string
  completed: boolean
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
  reminderAt: string | null
  recurrence: Recurrence
  starred: boolean
  completed: boolean
  completedAt: string | null
  createdAt: string
  sortOrder: number
  subtasks: Subtask[]
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
  sidebarThread: boolean
  launchAtLogin: boolean
}

export interface KnotData {
  version: 1
  lists: TaskList[]
  tasks: Task[]
  trash: DeletedTask[]
  preferences: Preferences
}
