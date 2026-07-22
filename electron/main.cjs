const { app, BrowserWindow, ipcMain, nativeTheme, Notification, Menu, powerMonitor } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

app.setName('Knot')
if (!app.isPackaged) app.setPath('userData', path.join(app.getPath('appData'), 'Knot Development'))

const hasSingleInstanceLock = !app.isPackaged || app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()

const notificationTimers = new Map()
let notificationRefreshTimer = null
let mainWindow = null
let updateInProgress = null
let lastWakeRevealAt = 0

const installedAppPath = '/Applications/Knot.app'
const previousAppPath = '/Applications/.Knot-previous.app'

function sourceProjectPath() {
  return process.env.KNOT_SOURCE_DIR || path.join(app.getPath('home'), 'Coding', 'Knot')
}

function runProcess(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk.toString() })
    child.stderr.on('data', (chunk) => { output += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(output)
      else reject(new Error(output.trim().split('\n').slice(-4).join(' ') || `Updater exited with code ${code}`))
    })
  })
}

async function installLatestBuild() {
  if (!app.isPackaged || process.platform !== 'darwin') {
    return { ok: false, message: 'Updates are available from the installed Mac app.' }
  }
  if (updateInProgress) return updateInProgress

  updateInProgress = (async () => {
    const projectPath = sourceProjectPath()
    const scriptPath = path.join(projectPath, 'scripts', 'update-knot.sh')
    try {
      await fs.promises.access(scriptPath, fs.constants.R_OK)
      await runProcess('/bin/zsh', [scriptPath, '--managed'], projectPath)
      setTimeout(() => {
        app.relaunch({ execPath: path.join(installedAppPath, 'Contents', 'MacOS', 'Knot') })
        app.exit(0)
      }, 900)
      return { ok: true, message: 'Knot is updated. Restarting now…' }
    } catch (error) {
      updateInProgress = null
      return { ok: false, message: `Update failed: ${error.message}` }
    }
  })()

  return updateInProgress
}

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

async function syncLaunchAtLoginPreference() {
  if (!app.isPackaged || process.platform !== 'darwin') return
  let enabled = true
  try {
    const saved = JSON.parse(await fs.promises.readFile(storePath(), 'utf8'))
    if (typeof saved?.preferences?.launchAtLogin === 'boolean') enabled = saved.preferences.launchAtLogin
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not read the launch-at-login preference:', error)
  }
  try {
    setLaunchAtLogin(enabled)
  } catch (error) {
    console.error('Could not synchronize the launch-at-login setting:', error)
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#171815' : '#f2f0e9',
    title: 'Knot',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 19, y: 18 },
    vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
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

  const now = Date.now()
  const maximumDelay = 2_147_000_000
  let hasDistantReminder = false
  for (const task of data?.tasks ?? []) {
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
  const dueTodayCount = (data?.tasks ?? []).filter((task) => {
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
  nativeTheme.themeSource = ['light', 'dark', 'system'].includes(theme) ? theme : 'system'
  return nativeTheme.shouldUseDarkColors
})

ipcMain.handle('knot:set-launch-at-login', (_event, enabled) => {
  return setLaunchAtLogin(enabled)
})

ipcMain.handle('knot:install-update', installLatestBuild)

app.on('second-instance', () => {
  if (app.isReady()) revealMainWindow(true)
})

async function scheduleSavedNotifications() {
  try {
    scheduleNotifications(await readJsonFile(storePath()))
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not schedule reminders from saved data:', error)
  }
}

app.whenReady().then(async () => {
  fs.promises.rm(previousAppPath, { recursive: true, force: true }).catch(() => {})
  await syncLaunchAtLoginPreference()
  createMenu()
  createWindow()
  scheduleSavedNotifications()
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
