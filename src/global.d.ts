import type { KnotData, ThemeMode } from './types'

export interface AvailableUpdate {
  version: string
  size: number
  downloadUrl: string
  releaseUrl: string
}

export interface UpdateProgress {
  phase: 'downloading' | 'installing' | 'restarting'
  fraction: number // 0–1, of the download
}

export interface InstallResult {
  ok: boolean
  opened?: boolean // the DMG was opened in Finder for a manual install
  message?: string
}

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
      version: () => Promise<string>
      checkForUpdate: (force?: boolean) => Promise<AvailableUpdate | null>
      installUpdate: () => Promise<InstallResult>
      onUpdateProgress: (callback: (progress: UpdateProgress) => void) => () => void
    }
  }
}
