const { app, BrowserWindow, ipcMain, safeStorage, shell, screen } = require('electron')
const path   = require('path')
const fs     = require('fs')
const os     = require('os')

// ── Dev / Prod detection ──────────────────────────────────────
const isDev = !app.isPackaged

// ── Paths ─────────────────────────────────────────────────────
const USER_DATA   = app.getPath('userData')
const SECRETS_FILE = path.join(USER_DATA, 'rtmp-secrets.enc')
const SETTINGS_FILE = path.join(USER_DATA, 'settings.json')

// ── Default settings ──────────────────────────────────────────
function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
  } catch {
    return {
      theme: 'dark',
      prideFlag: 'rainbow',
      username: '',
      handle: '',
      avatar: '🌈',
      pronouns: 'they/them',
      destinations: {
        rainbowland: { enabled: true,  label: 'Rainbow Land',  key: '' },
        tiktok:      { enabled: false, label: 'TikTok Live',   key: '' },
        youtube:     { enabled: false, label: 'YouTube Live',  key: '' },
        facebook:    { enabled: false, label: 'Facebook Live', key: '' },
        twitch:      { enabled: false, label: 'Twitch',        key: '' },
        custom:      { enabled: false, label: 'Custom RTMP',   url: '', key: '' },
      }
    }
  }
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2))
}

// ── Window ────────────────────────────────────────────────────
let mainWindow

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width:  Math.min(1400, width),
    height: Math.min(900, height),
    minWidth:  1024,
    minHeight: 700,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#050508',
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    show: false,
    webPreferences: {
      preload:           path.join(__dirname, 'preload.js'),
      contextIsolation:  true,
      nodeIntegration:   false,
      // Allow camera + mic without prompting on supported platforms
      experimentalFeatures: true,
    },
  })

  // Load app
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC: Settings ─────────────────────────────────────────────
ipcMain.handle('settings:get', () => loadSettings())
ipcMain.handle('settings:set', (_, settings) => {
  saveSettings(settings)
  return { ok: true }
})

// ── IPC: RTMP keys (encrypted via safeStorage) ────────────────
ipcMain.handle('secrets:get', () => {
  try {
    if (!fs.existsSync(SECRETS_FILE)) return {}
    if (!safeStorage.isEncryptionAvailable()) {
      return JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8'))
    }
    const enc = fs.readFileSync(SECRETS_FILE)
    return JSON.parse(safeStorage.decryptString(enc))
  } catch { return {} }
})

ipcMain.handle('secrets:set', (_, secrets) => {
  try {
    const json = JSON.stringify(secrets)
    if (safeStorage.isEncryptionAvailable()) {
      const enc = safeStorage.encryptString(json)
      fs.writeFileSync(SECRETS_FILE, enc)
    } else {
      // Fallback: plain (dev only)
      fs.writeFileSync(SECRETS_FILE, json, 'utf8')
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// ── IPC: System info ──────────────────────────────────────────
ipcMain.handle('system:info', () => ({
  platform: process.platform,
  arch:     process.arch,
  version:  app.getVersion(),
  electron: process.versions.electron,
  node:     process.versions.node,
  memory:   os.totalmem(),
}))

// ── IPC: Window controls (custom titlebar) ────────────────────
ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.handle('window:close', () => mainWindow?.close())
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

// ── IPC: Open external URL ────────────────────────────────────
ipcMain.handle('shell:openExternal', (_, url) => shell.openExternal(url))
