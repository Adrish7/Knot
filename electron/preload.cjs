const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('knot', {
  load: () => ipcRenderer.invoke('knot:load'),
  save: (data) => ipcRenderer.invoke('knot:save', data),
  saveSync: (data) => ipcRenderer.sendSync('knot:save-sync', data),
  exportData: (data) => ipcRenderer.invoke('knot:export', data),
  importData: () => ipcRenderer.invoke('knot:import'),
  snapshotBeforeImport: () => ipcRenderer.invoke('knot:snapshot-before-import'),
  setTheme: (theme) => ipcRenderer.invoke('knot:set-theme', theme),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke('knot:set-launch-at-login', enabled),
})
