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
  keepAwake: (enabled) => ipcRenderer.invoke('knot:keep-awake', enabled),
  version: () => ipcRenderer.invoke('knot:version'),
  checkForUpdate: (force) => ipcRenderer.invoke('knot:check-for-update', force),
  installUpdate: () => ipcRenderer.invoke('knot:install-update'),
  onUpdateProgress: (callback) => {
    const listener = (_event, progress) => callback(progress)
    ipcRenderer.on('knot:update-progress', listener)
    return () => ipcRenderer.removeListener('knot:update-progress', listener)
  },
})
