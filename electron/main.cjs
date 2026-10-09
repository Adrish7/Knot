const { app, BrowserWindow, dialog, ipcMain, nativeTheme, Notification, Menu, powerMonitor, powerSaveBlocker } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { registerUpdater } = require('./updater.cjs')

app.setName('Knot')
if (!app.isPackaged) app.setPath('userData', path.join(app.getPath('appData'), 'Knot Development'))

const hasSingleInstanceLock = !app.isPackaged || app.requestSingleInstanceLock()
// exit rather than quit, so this copy never gets as far as opening a window and saving.
if (!hasSingleInstanceLock) app.exit(0)

const notificationTimers = new Map()
let notificationRefreshTimer = null
let mainWindow = null
let lastWakeRevealAt = 0

function storePath() {
  return path.join(app.getPath('userData'), 'knot-data.json')
}

function backupStorePath() {
  return path.join(app.getPath('userData'), 'knot-data.backup.json')
}

// One snapshot per day, taken before the first save of that day, so a mistake can be undone
// even after the rolling backup has been overwritten by later saves.
const DAILY_SNAPSHOTS_KEPT = 7
const IMPORT_SNAPSHOTS_KEPT = 10

function snapshotDirectory() {
  return path.join(app.getPath('userData'), 'Backups')
}

function localDayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function snapshotFiles() {
  try {
    return fs.readdirSync(snapshotDirectory())
      .filter((name) => /^knot-data-\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .sort()
      .reverse()
      .map((name) => path.join(snapshotDirectory(), name))
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not list the daily backups:', error)
    return []
  }
}

function takeDailySnapshot(source) {
  const target = path.join(snapshotDirectory(), `knot-data-${localDayKey()}.json`)
  if (fs.existsSync(target)) return
  fs.mkdirSync(snapshotDirectory(), { recursive: true })
  fs.copyFileSync(source, target)
  for (const stale of snapshotFiles().slice(DAILY_SNAPSHOTS_KEPT)) fs.rmSync(stale, { force: true })
}

function isKnotData(value) {
  return Array.isArray(value?.lists) && Array.isArray(value?.tasks)
}

async function readJsonFile(target) {
  return JSON.parse(await fs.promises.readFile(target, 'utf8'))
}

function persistData(data) {
  const target = storePath()
  const temporary = `${target}.tmp`
  fs.mkdirSync(path.dirname(target), { recursive: true })
  try {
    const existing = JSON.parse(fs.readFileSync(target, 'utf8'))
    if (isKnotData(existing)) {
      fs.copyFileSync(target, backupStorePath())
      takeDailySnapshot(target)
    }
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not refresh the data backup:', error)
  }
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(temporary, target)
  scheduleNotifications(data)
  return true
}

function setLaunchAtLogin(enabled) {
  if (!app.isPackaged || process.platform !== 'darwin') return false
  // macOS refuses to unregister a login item that was never registered, so only call it on a change.
  if (app.getLoginItemSettings().openAtLogin === Boolean(enabled)) return Boolean(enabled)
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    openAsHidden: false,
    name: 'Knot',
  })
  return app.getLoginItemSettings().openAtLogin
}

const themeSources = ['light', 'dark', 'system']

// Knot defaults to dark.
function resolveThemeSource(theme) {
  return themeSources.includes(theme) ? theme : 'dark'
}

// The saved data, or null when there is none yet. Read once at startup so the theme, login
// item and reminders can all be set before the window is painted.
async function readSavedData() {
  try {
    return await readJsonFile(storePath())
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not read the saved data:', error)
    return null
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#232326' : '#ffffff',
    title: 'Knot',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    vibrancy: process.platform === 'darwin' ? 'sidebar' : undefined,
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())

  mainWindow = window
  // The renderer can't release keep-awake once its window is gone, so the window does it.
  window.webContents.on('render-process-gone', releaseKeepAwake)
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
    releaseKeepAwake()
  })
  return window
}

function revealMainWindow(force = false) {
  const now = Date.now()
  if (!force && now - lastWakeRevealAt < 1200) return
  lastWakeRevealAt = now

  const window = mainWindow && !mainWindow.isDestroyed() ? mainWindow : createWindow()
  if (window.isMinimized()) window.restore()
  window.show()
  if (process.platform === 'darwin') app.dock.show().catch(() => {})
  app.focus({ steal: true })
  window.focus()
}

function createMenu() {
  const template = [
    {
      label: 'Knot',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }] },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function scheduleNotifications(data) {
  for (const timer of notificationTimers.values()) clearTimeout(timer)
  notificationTimers.clear()
  if (notificationRefreshTimer) clearTimeout(notificationRefreshTimer)
  notificationRefreshTimer = null

  const tasks = data?.tasks ?? []
  const now = Date.now()
  const maximumDelay = 2_147_000_000
  let hasDistantReminder = false
  for (const task of tasks) {
    if (task.completed || !task.reminderAt) continue
    const delay = new Date(task.reminderAt).getTime() - now
    if (!Number.isFinite(delay) || delay <= 0) continue
    if (delay > maximumDelay) {
      hasDistantReminder = true
      continue
    }
    const timer = setTimeout(() => {
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: task.title,
          body: task.notes || 'A task in Knot is due soon.',
          icon: path.join(__dirname, '..', 'assets', 'icon.png'),
        })
        notification.on('click', () => revealMainWindow(true))
        notification.show()
      }
      notificationTimers.delete(task.id)
    }, delay)
    notificationTimers.set(task.id, timer)
  }

  if (hasDistantReminder) {
    notificationRefreshTimer = setTimeout(() => scheduleNotifications(data), maximumDelay)
  }

  // The app's day turns over at 6 AM (src/format.ts), so the badge counts the same day.
  const appDay = (date) => {
    const shifted = new Date(date)
    if (shifted.getHours() < 6) shifted.setDate(shifted.getDate() - 1)
    return localDayKey(shifted)
  }
  const today = appDay(new Date())
  const dueTodayCount = tasks.filter((task) => !task.completed && task.dueAt && appDay(new Date(task.dueAt)) === today).length
  if (process.platform === 'darwin') app.dock.setBadge(dueTodayCount ? String(dueTodayCount) : '')
}

// The rolling backup, then the newest daily snapshot that still reads as Knot data.
async function recoverFromBackups() {
  for (const candidate of [backupStorePath(), ...snapshotFiles()]) {
    try {
      const recovered = await readJsonFile(candidate)
      if (!isKnotData(recovered)) continue
      await fs.promises.copyFile(candidate, storePath())
      return recovered
    } catch {
      // Try the next copy.
    }
  }
  return null
}

// A file that is missing, unreadable, or readable but not Knot data falls back to the backups.
// A damaged file is copied aside first. Only a first run (no file, no backups) returns null.
ipcMain.handle('knot:load', async () => {
  let failure = null
  try {
    const data = await readJsonFile(storePath())
    if (isKnotData(data)) return data
    failure = new Error('The saved data is not in Knot’s format.')
  } catch (error) {
    if (error.code !== 'ENOENT') failure = error
  }
  if (failure) {
    const corruptCopy = path.join(app.getPath('userData'), `knot-data.corrupt-${Date.now()}.json`)
    await fs.promises.copyFile(storePath(), corruptCopy).catch(() => {})
  }
  const recovered = await recoverFromBackups()
  if (recovered) return recovered
  if (failure) throw failure
  return null
})

ipcMain.handle('knot:save', (_event, data) => persistData(data))

ipcMain.handle('knot:export', async (event, data) => {
  const owner = BrowserWindow.fromWebContents(event.sender)
  const { canceled, filePath } = await dialog.showSaveDialog(owner, {
    title: 'Export Knot data',
    defaultPath: path.join(app.getPath('documents'), `Knot Backup ${localDayKey()}.json`),
    filters: [{ name: 'Knot backup', extensions: ['json'] }],
  })
  if (canceled || !filePath) return false
  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
  return true
})

// Returns the parsed file for the renderer to validate, or null when the user cancels.
ipcMain.handle('knot:import', async (event) => {
  const owner = BrowserWindow.fromWebContents(event.sender)
  const { canceled, filePaths } = await dialog.showOpenDialog(owner, {
    title: 'Import Knot data',
    defaultPath: app.getPath('documents'),
    filters: [{ name: 'Knot backup', extensions: ['json'] }],
    properties: ['openFile'],
  })
  if (canceled || !filePaths[0]) return null
  return readJsonFile(filePaths[0])
})

// Keeps a copy of the data being replaced so an import can be undone by hand.
ipcMain.handle('knot:snapshot-before-import', async () => {
  try {
    fs.mkdirSync(snapshotDirectory(), { recursive: true })
    await fs.promises.copyFile(storePath(), path.join(snapshotDirectory(), `before-import-${Date.now()}.json`))
    const imports = fs.readdirSync(snapshotDirectory()).filter((name) => /^before-import-\d+\.json$/.test(name)).sort().reverse()
    for (const stale of imports.slice(IMPORT_SNAPSHOTS_KEPT)) fs.rmSync(path.join(snapshotDirectory(), stale), { force: true })
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  return true
})

ipcMain.on('knot:save-sync', (event, data) => {
  try {
    event.returnValue = persistData(data)
  } catch (error) {
    console.error('Could not complete the final data save:', error)
    event.returnValue = false
  }
})

ipcMain.handle('knot:set-theme', (_event, theme) => {
  nativeTheme.themeSource = resolveThemeSource(theme)
  return nativeTheme.shouldUseDarkColors
})

ipcMain.handle('knot:set-launch-at-login', (_event, enabled) => setLaunchAtLogin(enabled))

registerUpdater()

// While a stopwatch is on screen the display stays awake, so the time stays readable on a
// second monitor during a long session.
let awakeBlockerId = null
function releaseKeepAwake() {
  if (awakeBlockerId === null) return
  powerSaveBlocker.stop(awakeBlockerId)
  awakeBlockerId = null
}
ipcMain.handle('knot:keep-awake', (_event, enabled) => {
  if (enabled && awakeBlockerId === null) awakeBlockerId = powerSaveBlocker.start('prevent-display-sleep')
  if (!enabled) releaseKeepAwake()
  return true
})

app.on('second-instance', () => {
  if (app.isReady()) revealMainWindow(true)
})

app.whenReady().then(async () => {
  const saved = await readSavedData()
  // The window is painted before the renderer loads, so the saved appearance must reach
  // nativeTheme first to avoid a flash of the wrong ground.
  nativeTheme.themeSource = resolveThemeSource(saved?.preferences?.theme)
  try {
    setLaunchAtLogin(saved?.preferences?.launchAtLogin === true)
  } catch (error) {
    console.error('Could not synchronize the launch-at-login setting:', error)
  }
  createMenu()
  createWindow()
  scheduleNotifications(saved)
  powerMonitor.on('resume', revealMainWindow)
  powerMonitor.on('unlock-screen', revealMainWindow)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else revealMainWindow(true)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
