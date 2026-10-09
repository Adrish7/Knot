// Updates from GitHub Releases. Knot asks GitHub for the latest release, and when it is newer than
// this copy the sidebar offers it. Installing downloads the release's DMG, copies the app out of
// it next to the running one, swaps the two, quits and reopens. Anything that stops the swap
// (a read-only Applications folder, a copy run from the disk image) opens the DMG in Finder
// instead so the update can be dragged in by hand.
const { app, ipcMain, net, shell } = require('electron')
const { execFile, spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { promisify } = require('node:util')

const run = promisify(execFile)

const REPOSITORY = 'Adrish7/Knot'
const ASSET_NAME = 'Knot-mac-arm64.dmg'
const DOWNLOAD_PREFIX = `https://github.com/${REPOSITORY}/releases/download/`
const RECHECK_AFTER_MS = 15 * 60 * 1000

let latest = null // { version, size, downloadUrl, releaseUrl } once a newer release has been seen
let checkedAt = 0
let checking = null
let installing = false

function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(value).trim())
  return match ? match.slice(1).map(Number) : null
}

function isNewer(candidate, current) {
  const [a, b] = [parseVersion(candidate), parseVersion(current)]
  if (!a || !b) return false
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] > b[index]
  return false
}

async function fetchLatestRelease() {
  const response = await net.fetch(`https://api.github.com/repos/${REPOSITORY}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Knot/${app.getVersion()}` },
  })
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`)
  const release = await response.json()
  const asset = Array.isArray(release.assets) ? release.assets.find((item) => item.name === ASSET_NAME) : undefined
  // A release still being built has no DMG yet; it is offered once the DMG is attached.
  if (!asset || typeof asset.browser_download_url !== 'string' || !asset.browser_download_url.startsWith(DOWNLOAD_PREFIX)) return null
  const version = String(release.tag_name).replace(/^v/, '')
  if (!isNewer(version, app.getVersion())) return null
  return { version, size: Number(asset.size) || 0, downloadUrl: asset.browser_download_url, releaseUrl: release.html_url }
}

// The newer release, or null. Only the packaged app checks; a development build is never "behind".
async function checkForUpdate(force = false) {
  if (!app.isPackaged) return null
  if (!force && Date.now() - checkedAt < RECHECK_AFTER_MS) return latest
  checking ??= fetchLatestRelease()
    .then((found) => { latest = found; checkedAt = Date.now(); return found })
    .catch((error) => { console.error('Could not check for updates:', error); return latest })
    .finally(() => { checking = null })
  return checking
}

async function download(update, target, onProgress) {
  const response = await net.fetch(update.downloadUrl)
  if (!response.ok || !response.body) throw new Error(`The download failed (${response.status})`)
  const total = Number(response.headers.get('content-length')) || update.size
  const file = fs.createWriteStream(target)
  let received = 0
  let reported = 0
  try {
    for await (const chunk of response.body) {
      if (!file.write(chunk)) await new Promise((resolve) => file.once('drain', resolve))
      received += chunk.length
      if (total && received - reported > total / 100) {
        reported = received
        onProgress(Math.min(received / total, 1))
      }
    }
  } finally {
    await new Promise((resolve, reject) => file.end((error) => (error ? reject(error) : resolve())))
  }
  if (total && received !== total) throw new Error('The download was incomplete')
}

// /Applications/Knot.app, from …/Knot.app/Contents/MacOS/Knot.
function currentBundle() {
  return path.resolve(path.dirname(app.getPath('exe')), '..', '..')
}

// Copies the app out of the DMG to a hidden folder beside the running one, so the swap is a
// rename on the same volume.
async function stageFromDiskImage(dmg, workDirectory, destinationFolder) {
  const mountPoint = path.join(workDirectory, 'mount')
  fs.mkdirSync(mountPoint, { recursive: true })
  await run('/usr/bin/hdiutil', ['attach', dmg, '-nobrowse', '-noautoopen', '-readonly', '-mountpoint', mountPoint])
  try {
    const source = path.join(mountPoint, 'Knot.app')
    const plist = fs.readFileSync(path.join(source, 'Contents', 'Info.plist'), 'utf8')
    if (!plist.includes('<string>com.adrish.knot</string>')) throw new Error('The download is not Knot')
    const staged = path.join(destinationFolder, '.Knot-update.app')
    fs.rmSync(staged, { recursive: true, force: true })
    await run('/usr/bin/ditto', [source, staged])
    return staged
  } finally {
    await run('/usr/bin/hdiutil', ['detach', mountPoint, '-force']).catch(() => {})
  }
}

// Waits for this process to exit, removes the old copy and the download, and opens the new one.
function relaunchAfterQuit(bundle, previous, workDirectory) {
  const quote = (value) => `'${value.replace(/'/g, `'\\''`)}'`
  const script = `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.2; done; rm -rf ${quote(previous)} ${quote(workDirectory)}; /usr/bin/open ${quote(bundle)}`
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE // `open` passes the environment on, and this would start Knot as plain Node
  spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore', env }).unref()
}

async function installUpdate(sendProgress) {
  if (installing) return { ok: false, message: 'The update is already being installed' }
  const update = await checkForUpdate(true)
  if (!update) return { ok: false, message: 'Knot is up to date' }
  installing = true
  const workDirectory = fs.mkdtempSync(path.join(app.getPath('temp'), 'knot-update-'))
  const dmg = path.join(workDirectory, ASSET_NAME)
  let staged = null
  let downloaded = false
  try {
    sendProgress({ phase: 'downloading', fraction: 0 })
    await download(update, dmg, (fraction) => sendProgress({ phase: 'downloading', fraction }))
    downloaded = true
    sendProgress({ phase: 'installing', fraction: 1 })

    const bundle = currentBundle()
    const folder = path.dirname(bundle)
    if (!bundle.endsWith('.app') || bundle.startsWith('/Volumes/') || bundle.includes('/AppTranslocation/')) {
      throw new Error('Knot is not running from the Applications folder')
    }
    staged = await stageFromDiskImage(dmg, workDirectory, folder)
    const previous = path.join(folder, '.Knot-previous.app')
    fs.rmSync(previous, { recursive: true, force: true })
    fs.renameSync(bundle, previous)
    try {
      fs.renameSync(staged, bundle)
    } catch (error) {
      fs.renameSync(previous, bundle)
      throw error
    }
    staged = null
    relaunchAfterQuit(bundle, previous, workDirectory)
    sendProgress({ phase: 'restarting', fraction: 1 })
    setTimeout(() => app.quit(), 300)
    return { ok: true }
  } catch (error) {
    console.error('Could not install the update:', error)
    installing = false
    if (staged) fs.rmSync(staged, { recursive: true, force: true })
    if (downloaded) {
      await shell.openPath(dmg)
      return { ok: false, opened: true, message: 'Drag Knot into Applications to finish updating' }
    }
    fs.rmSync(workDirectory, { recursive: true, force: true })
    return { ok: false, message: 'Couldn’t download the update. Try again later.' }
  }
}

function registerUpdater() {
  ipcMain.handle('knot:version', () => app.getVersion())
  ipcMain.handle('knot:check-for-update', (_event, force) => checkForUpdate(Boolean(force)))
  ipcMain.handle('knot:install-update', (event) => installUpdate((progress) => {
    if (!event.sender.isDestroyed()) event.sender.send('knot:update-progress', progress)
  }))
}

module.exports = { registerUpdater }
