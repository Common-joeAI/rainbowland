/**
 * Rainbow Land — Live API + Chat + Coin Server
 */

import express          from 'express'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { randomBytes, createHash } from 'crypto'
import https            from 'https'
import querystring      from 'querystring'
import path             from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync, existsSync } from 'fs'
import fs               from 'fs'
import { exec }         from 'child_process'
import { promisify }    from 'util'
const execAsync = promisify(exec)

// __dirname shim — MUST be before anything using it
const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

const PORT          = parseInt(process.env.PORT)  || 4000
const STREAM_SECRET = process.env.STREAM_SECRET   || 'rl-secret-change-me'
const PAYPAL_EMAIL  = process.env.PAYPAL_EMAIL     || 'josephbennett99@paypal.com'
const PAYPAL_MODE   = process.env.PAYPAL_MODE      || 'live'

// Ensure data dirs exist
try { mkdirSync(path.join(__dirname, 'data', 'videos'), { recursive: true }) } catch {}
try { mkdirSync(path.join(__dirname, 'data'), { recursive: true }) } catch {}

// ── Coin DB ───────────────────────────────────────────────────────────────────
import {
  initCoinDB, getBalance, creditCoins,
  sendGift, getTopGifters, getRecentGifts,
  getCreatorEarnings, COIN_PACKS, GIFT_CATALOGUE
} from './coins.js'

try { mkdirSync(path.join(__dirname, 'data'), { recursive: true }) } catch {}
initCoinDB()

// ── Auth DB ───────────────────────────────────────────────────────────────────
  initAuthDB, registerUser, loginUser, refreshAccessToken,
  updateProfile, upgradeToHost, verifyJWT, getUserById
} from './auth.js'
initAuthDB()

// ── Express setup ─────────────────────────────────────────────────────────────
const app    = express()
const server = createServer(app)
const wss    = new WebSocketServer({ server, path: '/ws' })

app.use(express.urlencoded({ extended: true }))
app.use(express.json())

// ── Static public assets (icon, favicon, legal pages) ─────────────────────────
// ── Legal pages ───────────────────────────────────────────────────────────────
app.get('/privacy', (req, res) =>
  res.sendFile(join(__dirname, 'public', 'privacy.html'))
)
app.get('/terms', (req, res) =>
  res.sendFile(join(__dirname, 'public', 'terms.html'))
)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-ID, X-Handle')
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

// ── Auth middleware (JWT) ─────────────────────────────────────────────────────
function requireUser(req, res, next) {
  const authHeader = req.headers['authorization'] || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  // Also accept legacy X-User-ID for backward compat during migration
  if (!token) {
    const legacyId = req.headers['x-user-id']
    if (legacyId) {
      req.userId = legacyId
      req.handle = req.headers['x-handle'] || '@viewer'
      req.role   = 'viewer'
      return next()
    }
    return res.status(401).json({ error: 'Authentication required' })
  }
  const payload = verifyJWT(token)
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token' })
  req.userId = payload.sub
  req.handle = payload.handle
  req.role   = payload.role
  next()
}

function requireHost(req, res, next) {
  requireUser(req, res, () => {
    if (req.role !== 'host' && req.role !== 'admin') {
      return res.status(403).json({ error: 'Host account required. Upgrade in your profile.' })
    }
    next()
  })
}

// ── In-memory stream registry (unchanged) ─────────────────────────────────────
const activeStreams = new Map()
const chatRooms    = new Map()   // streamKey → Set<ws>
const issuedKeys   = new Map()
const globalClients= new Set()


// ════════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ════════════════════════════════════════════════════════════════════════════════

/** POST /api/auth/register */
app.post('/api/auth/register', (req, res) => {
  const { handle, email, password, displayName, role } = req.body
  // Only allow role='host' if explicitly requested (becomes viewer by default)
  const result = registerUser({ handle, email, password, displayName, role: role === 'host' ? 'host' : 'viewer' })
  if (!result.ok) return res.status(400).json(result)
  res.json(result)
})

/** POST /api/auth/login */
app.post('/api/auth/login', (req, res) => {
  const { identifier, password } = req.body
  const result = loginUser({ identifier, password })
  if (!result.ok) return res.status(401).json(result)
  res.json(result)
})

/** POST /api/auth/refresh */
app.post('/api/auth/refresh', (req, res) => {
  const { refreshToken } = req.body
  const result = refreshAccessToken(refreshToken)
  if (!result.ok) return res.status(401).json(result)
  res.json(result)
})

/** GET /api/auth/me */
app.get('/api/auth/me', requireUser, (req, res) => {
  const user = getUserById(req.userId)
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json({ user })
})

/** PUT /api/auth/profile */
app.put('/api/auth/profile', requireUser, (req, res) => {
  const result = updateProfile(req.userId, req.body)
  res.json(result)
})

/** POST /api/auth/become-host */
app.post('/api/auth/become-host', requireUser, (req, res) => {
  const result = upgradeToHost(req.userId)
  // Re-issue tokens with new role
  const user = getUserById(req.userId)
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json({ ok: true, message: 'Account upgraded to host! You can now go live.', user: result.user })
})

// ── Stream key endpoints ──────────────────────────────────────────────────────
app.post('/api/stream-key', requireHost, (req, res) => {
  const { secret } = req.body
  const userId = req.userId
  if (secret !== STREAM_SECRET && req.role !== 'host') return res.status(403).json({ error: 'forbidden' })
  const key = randomBytes(12).toString('hex')
  issuedKeys.set(userId, key)
  res.json({ streamKey: key, rtmpUrl: 'rtmp://live.rainbowland.cc/live', hlsUrl: `https://live.rainbowland.cc/hls/${key}/index.m3u8` })
})

app.post('/api/desktop-key', (req, res) => {
  const { secret, title, creator } = req.body
  if (secret !== STREAM_SECRET) return res.status(403).json({ error: 'forbidden' })
  const key = randomBytes(12).toString('hex')
  issuedKeys.set(key, { title: title || 'Rainbow Land Live', creator: creator || 'Creator' })
  res.json({ streamKey: key, rtmpUrl: 'rtmp://live.rainbowland.cc/live', hlsUrl: `https://live.rainbowland.cc/hls/${key}/index.m3u8` })
})

// ── RTMP lifecycle ─────────────────────────────────────────────────────────────
app.post('/rtmp/on_publish', (req, res) => {
  const { name } = req.body
  const meta = issuedKeys.get(name) || {}
  activeStreams.set(name, { key: name, title: meta.title || 'Live', creator: meta.creator || 'Anonymous', startedAt: Date.now(), hlsUrl: `https://live.rainbowland.cc/hls/${name}/index.m3u8` })
  chatRooms.set(name, new Set())
  broadcastGlobal({ type: 'stream_start', stream: activeStreams.get(name) })
  res.sendStatus(200)
})

app.post('/rtmp/on_done', (req, res) => {
  const { name } = req.body
  broadcastRoom(name, { type: 'stream_end', key: name })
  activeStreams.delete(name)
  chatRooms.delete(name)
  broadcastGlobal({ type: 'stream_end', key: name })
  res.sendStatus(200)
})

// ── Streams API ────────────────────────────────────────────────────────────────
app.get('/api/streams', (req, res) => res.json([...activeStreams.values()]))
app.get('/api/stream/:key', (req, res) => {
  const s = activeStreams.get(req.params.key)
  if (!s) return res.status(404).json({ error: 'not found' })
  res.json({ ...s, viewers: chatRooms.get(req.params.key)?.size || 0 })
})

// ════════════════════════════════════════════════════════════════════════════════
// COIN API
// ════════════════════════════════════════════════════════════════════════════════

/** GET /api/coins/balance  — viewer's wallet */
app.get('/api/coins/balance', requireUser, (req, res) => {
  const bal = getBalance(req.userId)
  res.json({ userId: req.userId, ...bal })
})

/** GET /api/coins/packs  — available coin packs for the shop */
app.get('/api/coins/packs', (req, res) => {
  // Return packs with a signed reference so the IPN can verify the amount
  res.json(COIN_PACKS.map(p => ({
    ...p,
    // Encode as PayPal custom field: userId:coins:usd_cents
    // (signed in the IPN handler)
    label: p.label || `${p.coins} coins`,
  })))
})

/** GET /api/coins/catalogue — gift definitions */
app.get('/api/coins/catalogue', (req, res) => {
  res.json(GIFT_CATALOGUE)
})

/**
 * POST /api/coins/gift  — send a gift (server-side atomic transaction)
 * Body: { creatorId, creatorHandle, giftId, qty, streamKey }
 */
app.post('/api/coins/gift', requireUser, (req, res) => {
  const { creatorId, creatorHandle, giftId, qty = 1, streamKey } = req.body

  if (!creatorId || !giftId) {
    return res.status(400).json({ error: 'creatorId and giftId required' })
  }
  if (req.userId === creatorId) {
    return res.status(400).json({ error: 'Cannot gift yourself' })
  }

  const result = sendGift({
    senderId:       req.userId,
    senderHandle:   req.handle,
    creatorId,
    creatorHandle:  creatorHandle || creatorId,
    giftId,
    qty:            parseInt(qty),
    streamKey,
  })

  if (!result.ok) {
    return res.status(402).json({ error: result.reason })
  }

  // Broadcast live gift event to the stream room
  if (streamKey) {
    broadcastRoom(streamKey, {
      type:          'gift',
      giftId,
      qty:           parseInt(qty),
      totalCoins:    result.totalCoins,
      senderHandle:  req.handle,
      creatorHandle: creatorHandle || creatorId,
      ts:            Date.now(),
    })
  }

  res.json({
    ok:            true,
    newBalance:    result.senderBalance,
    totalCoins:    result.totalCoins,
  })
})

/** GET /api/coins/leaderboard/:creatorId — top gifters for a creator */
app.get('/api/coins/leaderboard/:creatorId', (req, res) => {
  const top = getTopGifters(req.params.creatorId, 10)
  res.json(top)
})

/** GET /api/coins/stream-gifts/:streamKey — recent gifts on a live stream */
app.get('/api/coins/stream-gifts/:streamKey', (req, res) => {
  const gifts = getRecentGifts(req.params.streamKey, 30)
  res.json(gifts)
})

/** GET /api/coins/earnings/:creatorId — creator dashboard */
app.get('/api/coins/earnings/:creatorId', requireUser, (req, res) => {
  // Only the creator can see their own earnings
  if (req.userId !== req.params.creatorId) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  res.json(getCreatorEarnings(req.userId))
})


// ════════════════════════════════════════════════════════════════════════════════
// DEPLOY WEBHOOK — POST /api/deploy  (secret-gated)
// GitHub Actions hits this after every push to main.
// Server pulls latest live-server/ files and restarts itself via PM2.
// ════════════════════════════════════════════════════════════════════════════════
const DEPLOY_SECRET = process.env.DEPLOY_SECRET || 'rl-deploy-secret-change-me'
const GH_TOKEN = process.env.GH_TOKEN || ''
const REPO_URL = `https://Common-joeAI:${GH_TOKEN}@github.com/Common-joeAI/rainbowland.git`
const DEPLOY_DIR = process.env.DEPLOY_DIR || '/app'

app.post('/api/deploy', async (req, res) => {
  const { secret } = req.body
  if (secret !== DEPLOY_SECRET) return res.status(403).json({ error: 'forbidden' })

  res.json({ ok: true, message: 'Deploy started — check logs' })

  try {
    console.log('[DEPLOY] Starting pull...')

    // Pull latest live-server files from GitHub via sparse checkout into a temp dir
    const tmpDir = `/tmp/rl-deploy-${Date.now()}`
    const cmds = [
      `git clone --filter=blob:none --sparse --depth 1 ${REPO_URL} ${tmpDir}`,
      `cd ${tmpDir} && git sparse-checkout set live-server`,
      `rsync -av --exclude=data/ --exclude=node_modules/ ${tmpDir}/live-server/ ${DEPLOY_DIR}/`,
      `cd ${DEPLOY_DIR} && npm install --omit=dev 2>&1`,
      `rm -rf ${tmpDir}`,
    ]
    // After rsync + npm install, kill this process — Docker restart policy will relaunch with new code
    // We do this LAST after all cmds run so we get the new files first
    const restartCmd = `kill -SIGTERM ${process.pid}`

    for (const cmd of cmds) {
      console.log(`[DEPLOY] $ ${cmd.replace(/ghp_[^@]+/g, '***').substring(0,80)}`)
      const { stdout, stderr } = await execAsync(cmd, { timeout: 120000 })
      if (stdout) console.log('[DEPLOY]', stdout.trim().substring(0,200))
      if (stderr) console.log('[DEPLOY] err:', stderr.trim().substring(0,200))
    }

    console.log('[DEPLOY] ✅ Files updated — restarting process...')
    // Give logs time to flush then exit — Docker will restart with new code
    setTimeout(() => { process.exit(0) }, 500)
  } catch (err) {
    console.error('[DEPLOY] ❌ Failed:', err.message)
  }
})

// ════════════════════════════════════════════════════════════════════════════════
// PAYPAL IPN ENDPOINT
// Coins are ONLY credited here, after PayPal confirms the payment.
// ════════════════════════════════════════════════════════════════════════════════

app.post('/api/paypal/ipn', express.text({ type: '*/*' }), async (req, res) => {
  // Step 1 — Immediately respond 200 to PayPal (required within 30s)
  res.sendStatus(200)

  const rawBody = req.body || ''

  // Step 2 — Send back to PayPal for verification
  const verified = await verifyPaypalIPN(rawBody)
  if (!verified) {
    console.warn('[IPN] INVALID — rejected')
    return
  }

  // Step 3 — Parse the IPN fields
  const params = new URLSearchParams(rawBody)
  const paymentStatus = params.get('payment_status')
  const receiverEmail  = params.get('receiver_email')
  const txnId          = params.get('txn_id')
  const mcGross        = parseFloat(params.get('mc_gross') || '0')
  const mcCurrency     = params.get('mc_currency')
  const custom         = params.get('custom') || ''  // "userId:handle:packIndex"

  // Validate payment
  if (paymentStatus !== 'Completed') {
    console.log(`[IPN] Status not Completed: ${paymentStatus}`)
    return
  }
  if (receiverEmail?.toLowerCase() !== PAYPAL_EMAIL.toLowerCase()) {
    console.warn(`[IPN] Wrong receiver: ${receiverEmail}`)
    return
  }
  if (mcCurrency !== 'USD') {
    console.warn(`[IPN] Non-USD currency: ${mcCurrency}`)
    return
  }

  // Parse custom field: "userId:handle:packIndex"
  const [userId, handle, packIndexStr] = custom.split(':')
  const packIndex = parseInt(packIndexStr)
  const pack = COIN_PACKS[packIndex]

  if (!userId || !pack) {
    console.warn(`[IPN] Invalid custom field: ${custom}`)
    return
  }

  // Verify amount matches pack price (allow $0.02 rounding tolerance)
  const expectedUSD = pack.usd_cents / 100
  if (Math.abs(mcGross - expectedUSD) > 0.02) {
    console.warn(`[IPN] Amount mismatch: got $${mcGross}, expected $${expectedUSD}`)
    return
  }

  // Step 4 — Credit coins (UNIQUE txn_id prevents double-credit)
  try {
    const result = creditCoins(userId, handle, txnId, pack.coins, pack.usd_cents)
    console.log(`[IPN] ✅ Credited ${pack.coins} coins to ${userId} (txn ${txnId}), new balance: ${result.balance}`)

    // Notify the user via WebSocket if they're connected
    broadcastToUser(userId, {
      type:       'coins_credited',
      coins:      pack.coins,
      newBalance: result.balance,
    })
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint')) {
      console.warn(`[IPN] Duplicate txn_id ${txnId} — already credited`)
    } else {
      console.error('[IPN] DB error:', err)
    }
  }
})

// ── PayPal IPN verification ────────────────────────────────────────────────────
function verifyPaypalIPN(rawBody) {
  return new Promise((resolve) => {
    const verifyBody = 'cmd=_notify-validate&' + rawBody
    const host = PAYPAL_MODE === 'sandbox'
      ? 'ipnpb.sandbox.paypal.com'
      : 'ipnpb.paypal.com'

    const options = {
      host,
      port: 443,
      path: '/cgi-bin/webscr',
      method: 'POST',
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(verifyBody),
        'User-Agent':     'RainbowLand-IPN/1.0',
      },
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        console.log(`[IPN] PayPal says: ${data.trim()}`)
        resolve(data.trim() === 'VERIFIED')
      })
    })

    req.on('error', (err) => {
      console.error('[IPN] Verification request failed:', err)
      resolve(false)
    })

    req.write(verifyBody)
    req.end()
  })
}

// ── WebSocket: track userId → ws for coin credit notifications ─────────────────
const userSockets = new Map()  // userId → Set<ws>

function broadcastToUser(userId, obj) {
  const sockets = userSockets.get(userId)
  if (!sockets) return
  const msg = JSON.stringify(obj)
  for (const ws of sockets) {
    if (ws.readyState === 1) ws.send(msg)
  }
}

// ── WebSocket handler ──────────────────────────────────────────────────────────
wss.on('connection', (ws) => {
  globalClients.add(ws)
  let currentRoom = null
  let wsUserId    = null

  ws.on('message', (data) => {
    let msg
    try { msg = JSON.parse(data.toString()) } catch { return }

    if (msg.type === 'identify') {
      // Client sends { type:'identify', userId, handle } after connecting
      wsUserId = msg.userId
      if (wsUserId) {
        if (!userSockets.has(wsUserId)) userSockets.set(wsUserId, new Set())
        userSockets.get(wsUserId).add(ws)
      }

    } else if (msg.type === 'join') {
      currentRoom = msg.streamKey
      chatRooms.get(currentRoom)?.add(ws)
      const count = chatRooms.get(currentRoom)?.size || 0
      broadcastRoom(currentRoom, { type: 'viewer_count', count })

    } else if (msg.type === 'leave') {
      chatRooms.get(currentRoom)?.delete(ws)
      currentRoom = null

    } else if (msg.type === 'chat') {
      if (!currentRoom) return
      broadcastRoom(currentRoom, {
        type:  'chat',
        user:  msg.user  || 'Anonymous',
        text:  msg.text,
        color: msg.color || '#9B59FF',
        ts:    Date.now(),
      })
    }
  })

  ws.on('close', () => {
    globalClients.delete(ws)
    if (wsUserId) userSockets.get(wsUserId)?.delete(ws)
    if (currentRoom) {
      chatRooms.get(currentRoom)?.delete(ws)
      const count = chatRooms.get(currentRoom)?.size || 0
      broadcastRoom(currentRoom, { type: 'viewer_count', count })
    }
  })

  ws.send(JSON.stringify({ type: 'streams', data: [...activeStreams.values()] }))
})

function broadcastRoom(streamKey, obj) {
  const room = chatRooms.get(streamKey)
  if (!room) return
  const msg = JSON.stringify(obj)
  for (const client of room) {
    if (client.readyState === 1) client.send(msg)
  }
}

function broadcastGlobal(obj) {
  const msg = JSON.stringify(obj)
  for (const client of globalClients) {
    if (client.readyState === 1) client.send(msg)
  }
}


// ════════════════════════════════════════════════════════════════════════════════
// VIDEO ROUTES
// ════════════════════════════════════════════════════════════════════════════════

/** Serve uploaded video files — set up dynamically above if VIDEO_READY */

/** GET /api/videos — paginated feed */
app.get('/api/videos', async (req, res) => {
  const { limit = 20, offset = 0, tag, q } = req.query
  const videos = listVideos({ limit: parseInt(limit), offset: parseInt(offset), tag, query: q })
  // Annotate liked status if authed
  let likedIds = []
  try {
    const authHeader = req.headers['authorization'] || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (token) {
      const payload = verifyJWT(token)
      if (payload) likedIds = getUserLikes(payload.sub, videos.map(v => v.id))
    }
  } catch {}
  res.json({ videos: videos.map(v => ({ ...v, liked: likedIds.includes(v.id) })) })
})

/** POST /api/videos/upload — upload a short video (hosts only) */
app.post('/api/videos/upload', requireHost, (req, res, next) => {
  if (!VIDEO_READY || !videoUpload) return res.status(503).json({ error: 'Video upload not ready — server is installing dependencies, try again in 30s' })
  videoUpload.single('video')(req, res, next)
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No video file provided' })
    const { caption = '', hashtags = '[]', pronouns = '', prideFlag = 'rainbow' } = req.body
    const user = getUserById(req.userId)
    const videoUrl = `/videos/${req.file.filename}`
    const video = createVideo({
      id:          uuidv4(),
      creatorId:   req.userId,
      handle:      req.handle,
      displayName: user?.display_name || req.handle,
      avatar:      user?.avatar_emoji || '🌈',
      pronouns:    user?.pronouns || pronouns,
      prideFlag:   user?.pride_flag || prideFlag,
      caption:     caption.slice(0, 300),
      hashtags:    JSON.parse(hashtags),
      filename:    req.file.filename,
      url:         videoUrl,
    })
    res.json({ ok: true, video })
  } catch (err) {
    console.error('Upload error:', err)
    res.status(500).json({ error: err.message })
  }
})

/** POST /api/videos/:id/like */
app.post('/api/videos/:id/like', requireUser, (req, res) => {
  const result = toggleLike(req.params.id, req.userId)
  const video  = getVideo(req.params.id)
  res.json({ ...result, likes: video?.likes ?? 0 })
})

/** GET /api/videos/:id/comments */
app.get('/api/videos/:id/comments', (req, res) => {
  res.json({ comments: getComments(req.params.id) })
})

/** POST /api/videos/:id/comments */
app.post('/api/videos/:id/comments', requireUser, (req, res) => {
  const { text } = req.body
  if (!text?.trim()) return res.status(400).json({ error: 'Comment text required' })
  const user = getUserById(req.userId)
  const comment = addComment(req.params.id, {
    userId:      req.userId,
    handle:      req.handle,
    displayName: user?.display_name || req.handle,
    avatar:      user?.avatar_emoji || '🌈',
    text:        text.slice(0, 500),
  })
  res.json({ ok: true, comment })
})

server.listen(PORT, () => console.log(`[RL Server] :${PORT} — coin ledger active`))

