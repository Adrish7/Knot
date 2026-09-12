export {}

declare global {
  interface Window {
    knot?: {
      load: () => Promise<import('./types').KnotData | null>
      save: (data: import('./types').KnotData) => Promise<boolean>
      saveSync: (data: import('./types').KnotData) => boolean
      setTheme: (theme: import('./types').ThemeMode) => Promise<boolean>
      setLaunchAtLogin: (enabled: boolean) => Promise<boolean>
    }
  }
}
