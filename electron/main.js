const { app, BrowserWindow, ipcMain, safeStorage, shell, screen } = require('electron')
const path   = require('path')
const fs     = require('fs')
const os     = require('os')
const http   = require('http')
const crypto = require('crypto')
const https  = require('https')

// ── Dev / Prod detection ──────────────────────────────────────
const isDev = !app.isPackaged

// ── Paths ─────────────────────────────────────────────────────
const USER_DATA    = app.getPath('userData')
const SECRETS_FILE = path.join(USER_DATA, 'rtmp-secrets.enc')
const SETTINGS_FILE = path.join(USER_DATA, 'settings.json')
const TIKTOK_FILE  = path.join(USER_DATA, 'tiktok-token.enc')

// ── TikTok OAuth config ───────────────────────────────────────
// Sandbox keys — swap for production keys after TikTok review approval
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
    // app.getAppPath() resolves correctly even inside asar packaging
    const indexPath = path.join(app.getAppPath(), 'dist', 'index.html')
    console.log('[BOOT] Loading:', indexPath)
    mainWindow.loadFile(indexPath).catch(err => {
      console.error('[BOOT] Failed to load:', indexPath, err)
      // Try fallback relative path
      const fallback = path.join(__dirname, '..', 'dist', 'index.html')
      console.log('[BOOT] Trying fallback:', fallback)
      mainWindow.loadFile(fallback).catch(err2 => {
        console.error('[BOOT] Fallback also failed:', err2)
      })
    })
  }

  mainWindow.webContents.on('did-fail-load', (event, code, desc, url) => {
    console.error('did-fail-load', code, desc, url)
    // Fallback: show window anyway so user sees something
    mainWindow.show()
  })

  mainWindow.webContents.on('dom-ready', () => {
    mainWindow.show()
    mainWindow.focus()
    // DevTools hidden in production — unlock with Ctrl+Shift+Alt+D
  })

  // Secret key combo to open DevTools: Ctrl+Shift+Alt+D
  const { globalShortcut } = require('electron')
  globalShortcut.register('CommandOrControl+Shift+Alt+D', () => {
    if (mainWindow && mainWindow.webContents) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools()
      } else {
        mainWindow.webContents.openDevTools({ mode: 'detach' })
      }
    }
  })

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

// ── IPC: TikTok OAuth ─────────────────────────────────────────

// Get current TikTok connection status
ipcMain.handle('tiktok:status', () => {
  const token = loadTikTokToken()
  if (!token) return { connected: false }
  // Check if expired
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

// Start OAuth flow — opens browser, starts local callback server
ipcMain.handle('tiktok:connect', () => {
  return new Promise((resolve, reject) => {
    // Generate CSRF state
    const state    = crypto.randomBytes(16).toString('hex')
    const codeVerifier  = crypto.randomBytes(32).toString('base64url')
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')

    // One-shot local HTTP server to catch the redirect
    let callbackServer = null
    let settled = false

    const settle = (result) => {
      if (settled) return
      settled = true
      callbackServer?.close()
      if (result.error) reject(new Error(result.error))
      else resolve(result)
    }

    callbackServer = http.createServer(async (req, res) => {
      if (!req.url?.startsWith('/tiktok/callback')) { res.end(); return }

      const params = new URL(req.url, `http://localhost:${TIKTOK_REDIRECT_PORT}`)
      const code   = params.searchParams.get('code')
      const retState = params.searchParams.get('state')
      const error  = params.searchParams.get('error')

      // Send a nice close-me page to the browser
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(`<!DOCTYPE html><html><head><style>
        body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0f;color:#e8e8f0}
        .card{text-align:center;padding:2rem}h1{font-size:2rem;margin-bottom:.5rem}p{color:#888}
      </style></head><body><div class="card">
        ${error ? `<h1>❌ Authorization failed</h1><p>${error}</p>` : '<h1>🌈 Connected!</h1><p>You can close this tab and return to Rainbow Land.</p>'}
      </div></body></html>`)

      if (error) { settle({ error }); return }
      if (retState !== state) { settle({ error: 'State mismatch — possible CSRF' }); return }
      if (!code)  { settle({ error: 'No code received' }); return }

      try {
        // Exchange code for token
        const tokenData = await exchangeTikTokCode(code)
        if (tokenData.error) { settle({ error: tokenData.error_description || tokenData.error }); return }

        // Fetch user profile
        let displayName = 'TikTok User'
        let avatarUrl   = ''
        let openId      = tokenData.open_id || ''
        try {
          const userRes = await fetchTikTokUser(tokenData.access_token)
          const u = userRes?.data?.user || {}
          displayName = u.display_name || displayName
          avatarUrl   = u.avatar_url   || avatarUrl
          openId      = u.open_id      || openId
        } catch {}

        // Persist token securely
        const stored = {
          access_token:  tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          open_id:       openId,
          display_name:  displayName,
          avatar_url:    avatarUrl,
          expires_at:    Date.now() + (tokenData.expires_in || 86400) * 1000,
        }
        saveTikTokToken(stored)

        settle({
          connected:   true,
          displayName,
          avatarUrl,
          openId,
        })
      } catch (e) {
        settle({ error: e.message })
      }
    })

    callbackServer.listen(TIKTOK_REDIRECT_PORT, () => {
      // Build TikTok OAuth URL
      const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/')
      authUrl.searchParams.set('client_key',             TIKTOK_CLIENT_KEY)
      authUrl.searchParams.set('scope',                  TIKTOK_SCOPES)
      authUrl.searchParams.set('response_type',          'code')
      authUrl.searchParams.set('redirect_uri',           TIKTOK_REDIRECT_URI)
      authUrl.searchParams.set('state',                  state)
      authUrl.searchParams.set('code_challenge',         codeChallenge)
      authUrl.searchParams.set('code_challenge_method',  'S256')

      shell.openExternal(authUrl.toString())
    })

    // Timeout after 5 minutes
    setTimeout(() => settle({ error: 'OAuth timed out — please try again' }), 5 * 60 * 1000)
  })
})

// Disconnect TikTok
ipcMain.handle('tiktok:disconnect', () => {
  deleteTikTokToken()
  return { ok: true }
})

app.on('will-quit', () => { require('electron').globalShortcut.unregisterAll() })
