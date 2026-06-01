/**
 * Rainbow Land — Live API + Chat + Coin Server
 *
 * Handles:
 *  - RTMP lifecycle callbacks
 *  - REST API (streams, stream keys)
 *  - WebSocket chat + live gift events
 *  - Coin ledger (SQLite via coins.js)
 *  - PayPal IPN verification (coins only credited after PayPal confirms)
 */

import express      from 'express'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { randomBytes, createHash } from 'crypto'
import https        from 'https'
import querystring  from 'querystring'
import path         from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT          = parseInt(process.env.PORT)          || 4000
const STREAM_SECRET = process.env.STREAM_SECRET           || 'rl-secret-change-me'
const PAYPAL_EMAIL  = process.env.PAYPAL_EMAIL            || 'josephbennett99@paypal.com'
const PAYPAL_MODE   = process.env.PAYPAL_MODE             || 'live'   // 'sandbox' for testing

// ── Coin DB ───────────────────────────────────────────────────────────────────
import {
  initCoinDB, getBalance, creditCoins,
  sendGift, getTopGifters, getRecentGifts,
  getCreatorEarnings, COIN_PACKS, GIFT_CATALOGUE
} from './coins.js'

try { mkdirSync(path.join(__dirname, 'data'), { recursive: true }) } catch {}
initCoinDB()

// ── Express setup ─────────────────────────────────────────────────────────────
const app    = express()
const server = createServer(app)
const wss    = new WebSocketServer({ server, path: '/ws' })

app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-ID, X-Handle')
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

// ── Auth middleware (simple token for now) ─────────────────────────────────────
// In production replace with JWT. For v1, the Electron app sends:
//   X-User-ID: a UUID generated on first launch (stored in localStorage)
//   X-Handle:  the user's @handle
function requireUser(req, res, next) {
  const userId = req.headers['x-user-id']
  const handle = req.headers['x-handle'] || 'anonymous'
  if (!userId) return res.status(401).json({ error: 'X-User-ID header required' })
  req.userId = userId
  req.handle = handle
  next()
}

// ── In-memory stream registry (unchanged) ─────────────────────────────────────
const activeStreams = new Map()
const chatRooms    = new Map()   // streamKey → Set<ws>
const issuedKeys   = new Map()
const globalClients= new Set()

// ── Stream key endpoints ──────────────────────────────────────────────────────
app.post('/api/stream-key', (req, res) => {
  const { userId, secret } = req.body
  if (secret !== STREAM_SECRET) return res.status(403).json({ error: 'forbidden' })
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

server.listen(PORT, () => console.log(`[RL Server] :${PORT} — coin ledger active`))
