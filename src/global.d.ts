import type { KnotData, ThemeMode } from './types'

declare global {
  interface Window {
    knot?: {
      load: () => Promise<KnotData | null>
      save: (data: KnotData) => Promise<boolean>
      saveSync: (data: KnotData) => boolean
      exportData: (data: KnotData) => Promise<boolean>
      importData: () => Promise<unknown>
      snapshotBeforeImport: () => Promise<boolean>
      setTheme: (theme: ThemeMode) => Promise<boolean>
      setLaunchAtLogin: (enabled: boolean) => Promise<boolean>
      keepAwake?: (enabled: boolean) => Promise<boolean>
    }
  }
}
