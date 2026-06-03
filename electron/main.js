const { app, BrowserWindow, ipcMain, safeStorage, shell, screen } = require('electron')
const path   = require('path')
const fs     = require('fs')
const os     = require('os')
const http   = require('http')
const crypto = require('crypto')
const https  = require('https')

// ── Auto-updater (electron-updater via electron-builder) ──────
let autoUpdater = null
try {
  autoUpdater = require('electron-updater').autoUpdater
  autoUpdater.autoDownload    = false
  autoUpdater.allowPrerelease = false
  if (isDev) {
    // In dev, updater needs forceDevUpdateConfig to test — skip silently
    console.log('[updater] dev mode — update checks disabled')
    autoUpdater = null
  }   // ask user first
  autoUpdater.autoInstallOnAppQuit = true
} catch (e) {
  console.warn('[updater] electron-updater not available:', e.message)
}

// ── Dev / Prod detection ──────────────────────────────────────
const isDev = !app.isPackaged

// ── Paths ─────────────────────────────────────────────────────
const USER_DATA    = app.getPath('userData')
const SECRETS_FILE = path.join(USER_DATA, 'rtmp-secrets.enc')
const SETTINGS_FILE = path.join(USER_DATA, 'settings.json')
const TIKTOK_FILE  = path.join(USER_DATA, 'tiktok-token.enc')

// ── TikTok OAuth config ───────────────────────────────────────
const TIKTOK_CLIENT_KEY    = process.env.TIKTOK_CLIENT_KEY    || 'awqj4yydnd6k5gyx'
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || ''
const TIKTOK_REDIRECT_PORT = 54321
const TIKTOK_REDIRECT_URI  = `http://localhost:${TIKTOK_REDIRECT_PORT}/tiktok/callback`
const TIKTOK_SCOPES        = 'user.info.basic,user.info.profile'

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

// ── TikTok token helpers ──────────────────────────────────────
function saveTikTokToken(tokenData) {
  try {
    const json = JSON.stringify(tokenData)
    if (safeStorage.isEncryptionAvailable()) {
      fs.writeFileSync(TIKTOK_FILE, safeStorage.encryptString(json))
    } else {
      fs.writeFileSync(TIKTOK_FILE, json, 'utf8')
    }
  } catch (e) { console.error('saveTikTokToken error:', e) }
}

function loadTikTokToken() {
  try {
    if (!fs.existsSync(TIKTOK_FILE)) return null
    if (safeStorage.isEncryptionAvailable()) {
      return JSON.parse(safeStorage.decryptString(fs.readFileSync(TIKTOK_FILE)))
    }
    return JSON.parse(fs.readFileSync(TIKTOK_FILE, 'utf8'))
  } catch { return null }
}

function deleteTikTokToken() {
  try { if (fs.existsSync(TIKTOK_FILE)) fs.unlinkSync(TIKTOK_FILE) } catch {}
}

// ── TikTok OAuth — exchange code for token ────────────────────
function exchangeTikTokCode(code) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      client_key:    TIKTOK_CLIENT_KEY,
      client_secret: TIKTOK_CLIENT_SECRET,
      code,
      grant_type:    'authorization_code',
      redirect_uri:  TIKTOK_REDIRECT_URI,
    }).toString()

    const req = https.request({
      hostname: 'open.tiktokapis.com',
      path:     '/v2/oauth/token/',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ── TikTok OAuth — fetch user info ────────────────────────────
function fetchTikTokUser(accessToken) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'open.tiktokapis.com',
      path:     '/v2/user/info/?fields=open_id,display_name,avatar_url',
      method:   'GET',
      headers:  { 'Authorization': `Bearer ${accessToken}` },
    }, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.end()
  })
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
    show: true,
    webPreferences: {
      preload:           path.join(__dirname, 'preload.js'),
      contextIsolation:  true,
      nodeIntegration:   false,
      experimentalFeatures: true,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    const indexPath = path.join(app.getAppPath(), 'dist', 'index.html')
    console.log('[BOOT] Loading:', indexPath)
    mainWindow.loadFile(indexPath).catch(err => {
      console.error('[BOOT] Failed to load:', indexPath, err)
      const fallback = path.join(__dirname, '..', 'dist', 'index.html')
      console.log('[BOOT] Trying fallback:', fallback)
      mainWindow.loadFile(fallback).catch(err2 => {
        console.error('[BOOT] Fallback also failed:', err2)
      })
    })
  }

  mainWindow.webContents.on('did-fail-load', (event, code, desc, url) => {
    console.error('did-fail-load', code, desc, url)
    mainWindow.show()
  })

  mainWindow.webContents.on('dom-ready', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  // Secret DevTools: Ctrl+Shift+Alt+D
  const { globalShortcut } = require('electron')
  globalShortcut.register('CommandOrControl+Shift+Alt+D', () => {
    if (mainWindow?.webContents) {
      if (mainWindow.webContents.isDevToolsOpened()) mainWindow.webContents.closeDevTools()
      else mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.focus()
    // Check for updates 3s after launch (give UI time to render)
    if (!isDev && autoUpdater) {
      setTimeout(() => checkForUpdates(), 3000)
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ── Auto-updater logic ────────────────────────────────────────
function checkForUpdates() {
  if (!autoUpdater) return
  try {
    autoUpdater.checkForUpdates().catch(err => {
      console.warn('[updater] check failed:', err.message)
    })
  } catch (e) {
    console.warn('[updater] error:', e.message)
  }
}

function setupAutoUpdater() {
  if (!autoUpdater) return

  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('updater:status', { status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('updater:status', {
      status: 'available',
      version: info.version,
      releaseNotes: info.releaseNotes || '',
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    mainWindow?.webContents.send('updater:status', {
      status: 'up-to-date',
      version: info.version,
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('updater:status', {
      status: 'downloading',
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('updater:status', {
      status: 'downloaded',
      version: info.version,
    })
  })

  autoUpdater.on('error', (err) => {
    console.warn('[updater] error event:', err.message)
    mainWindow?.webContents.send('updater:status', {
      status: 'error',
      message: err.message,
    })
  })
}

app.whenReady().then(() => {
  createWindow()
  setupAutoUpdater()   // must be after createWindow so mainWindow exists
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

// ── IPC: RTMP keys ────────────────────────────────────────────
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

// ── IPC: Window controls ──────────────────────────────────────
ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.handle('window:close', () => mainWindow?.close())
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

// ── IPC: Open external URL ────────────────────────────────────
ipcMain.handle('shell:openExternal', (_, url) => shell.openExternal(url))

// ── IPC: Auto-updater ─────────────────────────────────────────
ipcMain.handle('updater:check', () => {
  if (!autoUpdater || isDev) return { status: 'dev-mode' }
  checkForUpdates()
  return { status: 'checking' }
})

ipcMain.handle('updater:download', () => {
  if (!autoUpdater) return { ok: false }
  autoUpdater.downloadUpdate()
  return { ok: true }
})

ipcMain.handle('updater:install', () => {
  if (!autoUpdater) return { ok: false }
  autoUpdater.quitAndInstall(false, true)
  return { ok: true }
})

// ── IPC: TikTok OAuth ─────────────────────────────────────────
ipcMain.handle('tiktok:status', () => {
  const token = loadTikTokToken()
  if (!token) return { connected: false }
  const expiresAt = token.expires_at || 0
  if (Date.now() > expiresAt) return { connected: false, expired: true }
  return {
    connected:    true,
    displayName:  token.display_name,
    avatarUrl:    token.avatar_url,
    openId:       token.open_id,
    expiresAt,
  }
})

ipcMain.handle('tiktok:connect', () => {
  return new Promise((resolve, reject) => {
    const state         = crypto.randomBytes(16).toString('hex')
    const codeVerifier  = crypto.randomBytes(32).toString('base64url')
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')

    const authUrl = `https://www.tiktok.com/v2/auth/authorize/?` + new URLSearchParams({
      client_key:            TIKTOK_CLIENT_KEY,
      response_type:         'code',
      scope:                 TIKTOK_SCOPES,
      redirect_uri:          TIKTOK_REDIRECT_URI,
      state,
      code_challenge:        codeChallenge,
      code_challenge_method: 'S256',
    }).toString()

    shell.openExternal(authUrl)

    const server = http.createServer(async (req, res) => {
      if (!req.url?.startsWith('/tiktok/callback')) return
      const params = new URL(req.url, `http://localhost:${TIKTOK_REDIRECT_PORT}`)
      const code   = params.searchParams.get('code')
      const retState = params.searchParams.get('state')

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html><body><h2>✅ Connected! You can close this tab.</h2></body></html>')
      server.close()

      if (!code || retState !== state) {
        return reject(new Error('OAuth state mismatch or missing code'))
      }

      try {
        const tokenData = await exchangeTikTokCode(code)
        const userInfo  = await fetchTikTokUser(tokenData.access_token)
        const saved = {
          ...tokenData,
          display_name: userInfo?.data?.user?.display_name,
          avatar_url:   userInfo?.data?.user?.avatar_url,
          open_id:      userInfo?.data?.user?.open_id,
          expires_at:   Date.now() + (tokenData.expires_in || 86400) * 1000,
        }
        saveTikTokToken(saved)
        resolve({ connected: true, displayName: saved.display_name, avatarUrl: saved.avatar_url })
      } catch (e) {
        reject(e)
      }
    })

    server.listen(TIKTOK_REDIRECT_PORT, 'localhost')
    setTimeout(() => { server.close(); reject(new Error('OAuth timeout')) }, 300000)
  })
})

ipcMain.handle('tiktok:disconnect', () => {
  deleteTikTokToken()
  return { ok: true }
})
