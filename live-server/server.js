/**
 * Rainbow Land — Live API + Chat Server
 * Nginx-RTMP handles ingest on :1935 and HLS output to /tmp/rl-hls
 * This Node.js process handles:
 *   - RTMP lifecycle callbacks (/rtmp/on_publish, /rtmp/on_done)
 *   - REST API (/api/streams, /api/stream/:key)
 *   - WebSocket chat (/ws)
 *   - Stream key validation
 */

import express      from 'express'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { randomBytes } from 'crypto'

const PORT     = parseInt(process.env.PORT) || 4000
const STREAM_SECRET = process.env.STREAM_SECRET || 'rl-secret-change-me'

const app    = express()
const server = createServer(app)
const wss    = new WebSocketServer({ server, path: '/ws' })

app.use(express.urlencoded({ extended: true }))
app.use(express.json())

// ── In-memory stream registry ─────────────────────────────────
// streamKey → { title, creator, startedAt, viewers }
const activeStreams = new Map()

// streamKey → Set<ws> for chat rooms
const chatRooms = new Map()

// Pre-issued stream keys: userId → streamKey
// In production, generate these on user login; here we use a simple map
const issuedKeys = new Map()

// ── Stream key issuance ───────────────────────────────────────
app.post('/api/stream-key', (req, res) => {
  const { userId, secret } = req.body
  if (secret !== STREAM_SECRET) return res.status(403).json({ error: 'forbidden' })
  const key = randomBytes(12).toString('hex')
  issuedKeys.set(userId, key)
  res.json({
    streamKey: key,
    rtmpUrl:   `rtmp://live.rainbowland.cc/live`,
    hlsUrl:    `https://live.rainbowland.cc/hls/${key}/index.m3u8`,
  })
})

// ── Electron app requests its key (auto-auth via secret) ──────
app.post('/api/desktop-key', (req, res) => {
  const { secret, title, creator } = req.body
  if (secret !== STREAM_SECRET) return res.status(403).json({ error: 'forbidden' })
  const key = randomBytes(12).toString('hex')
  // Pre-register the stream with metadata
  issuedKeys.set(key, { title: title || 'Rainbow Land Live', creator: creator || 'Creator' })
  res.json({
    streamKey: key,
    rtmpUrl:   'rtmp://live.rainbowland.cc/live',
    hlsUrl:    `https://live.rainbowland.cc/hls/${key}/index.m3u8`,
  })
})

// ── RTMP lifecycle callbacks from Nginx ───────────────────────
app.post('/rtmp/on_publish', (req, res) => {
  const { name } = req.body  // name = stream key
  console.log(`[RTMP] Stream started: ${name}`)

  const meta = issuedKeys.get(name) || {}
  activeStreams.set(name, {
    key:       name,
    title:     meta.title || 'Live',
    creator:   meta.creator || 'Anonymous',
    startedAt: Date.now(),
    hlsUrl:    `https://live.rainbowland.cc/hls/${name}/index.m3u8`,
  })

  chatRooms.set(name, new Set())

  // Notify all connected WS clients that a new stream is live
  broadcastGlobal({ type: 'stream_start', stream: activeStreams.get(name) })

  res.sendStatus(200)  // 200 = allow publish
})

app.post('/rtmp/on_done', (req, res) => {
  const { name } = req.body
  console.log(`[RTMP] Stream ended: ${name}`)

  broadcastRoom(name, { type: 'stream_end', key: name })

  activeStreams.delete(name)
  chatRooms.delete(name)

  broadcastGlobal({ type: 'stream_end', key: name })
  res.sendStatus(200)
})

// ── REST API ──────────────────────────────────────────────────
app.get('/api/streams', (req, res) => {
  res.json([...activeStreams.values()])
})

app.get('/api/stream/:key', (req, res) => {
  const s = activeStreams.get(req.params.key)
  if (!s) return res.status(404).json({ error: 'not found' })
  res.json({ ...s, viewers: chatRooms.get(req.params.key)?.size || 0 })
})

// ── WebSocket chat ────────────────────────────────────────────
const globalClients = new Set()

wss.on('connection', (ws) => {
  globalClients.add(ws)
  let currentRoom = null

  ws.on('message', (data) => {
    let msg
    try { msg = JSON.parse(data.toString()) } catch { return }

    if (msg.type === 'join') {
      currentRoom = msg.streamKey
      chatRooms.get(currentRoom)?.add(ws)
      // Send current viewer count
      const count = chatRooms.get(currentRoom)?.size || 0
      broadcastRoom(currentRoom, { type: 'viewer_count', count })

    } else if (msg.type === 'leave') {
      chatRooms.get(currentRoom)?.delete(ws)
      currentRoom = null

    } else if (msg.type === 'chat') {
      if (!currentRoom) return
      broadcastRoom(currentRoom, {
        type:   'chat',
        user:   msg.user  || 'Anonymous',
        text:   msg.text,
        color:  msg.color || '#9B59FF',
        ts:     Date.now(),
      })
    }
  })

  ws.on('close', () => {
    globalClients.delete(ws)
    if (currentRoom) {
      chatRooms.get(currentRoom)?.delete(ws)
      const count = chatRooms.get(currentRoom)?.size || 0
      broadcastRoom(currentRoom, { type: 'viewer_count', count })
    }
  })

  // Send current live streams on connect
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

server.listen(PORT, () => console.log(`[API+Chat] listening on :${PORT}`))
