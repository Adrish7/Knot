const { app, BrowserWindow, ipcMain, nativeTheme, Notification, Menu, powerMonitor } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

app.setName('Knot')
if (!app.isPackaged) app.setPath('userData', path.join(app.getPath('appData'), 'Knot Development'))

const hasSingleInstanceLock = !app.isPackaged || app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()

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

async function readJsonFile(target) {
  return JSON.parse(await fs.promises.readFile(target, 'utf8'))
}

function persistData(data) {
  const target = storePath()
  const temporary = `${target}.tmp`
  fs.mkdirSync(path.dirname(target), { recursive: true })
  try {
    const existing = JSON.parse(fs.readFileSync(target, 'utf8'))
    if (Array.isArray(existing?.lists) && Array.isArray(existing?.tasks)) {
      fs.copyFileSync(target, backupStorePath())
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

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())

  mainWindow = window
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
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

  const badgeNow = new Date()
  const dueTodayCount = tasks.filter((task) => {
    if (task.completed || !task.dueAt) return false
    const due = new Date(task.dueAt)
    return due.getFullYear() === badgeNow.getFullYear() && due.getMonth() === badgeNow.getMonth() && due.getDate() === badgeNow.getDate()
  }).length
  if (process.platform === 'darwin') app.dock.setBadge(dueTodayCount ? String(dueTodayCount) : '')
}

ipcMain.handle('knot:load', async () => {
  try {
    return await readJsonFile(storePath())
  } catch (error) {
    if (error.code === 'ENOENT') return null
    const corruptCopy = path.join(app.getPath('userData'), `knot-data.corrupt-${Date.now()}.json`)
    await fs.promises.copyFile(storePath(), corruptCopy).catch(() => {})
    try {
      const backup = await readJsonFile(backupStorePath())
      await fs.promises.copyFile(backupStorePath(), storePath())
      return backup
    } catch {
      throw error
    }
  }
})

ipcMain.handle('knot:save', (_event, data) => persistData(data))

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
