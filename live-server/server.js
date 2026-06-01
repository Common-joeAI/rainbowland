/**
 * Rainbow Land — Live Relay Server
 *
 * WebSocket → FFmpeg RTMP → HLS
 *
 * Ports: 4000 (WSS), 8935 (RTMP internal), 8080 (HLS HTTP)
 *
 * Deploy on VPS (live.rainbowland.cc / 107.199.175.81):
 *   cd ~/live-server && npm install && node server.js
 */

import { WebSocketServer } from 'ws'
import { createServer }    from 'http'
import { spawn }           from 'child_process'
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, extname }  from 'path'
import express            from 'express'

const HLS_DIR  = process.env.HLS_DIR  || '/tmp/rainbowland-hls'
const WS_PORT  = parseInt(process.env.WS_PORT)  || 4000
const HLS_PORT = parseInt(process.env.HLS_PORT) || 8080

mkdirSync(HLS_DIR, { recursive: true })

// ── Active rooms ────────────────────────────────────────────────
// Map<roomId, { host: ws, viewers: Set<ws>, ffmpeg, title, startedAt, viewerCount }>
const rooms = new Map()

// ── HTTP/HLS server ─────────────────────────────────────────────
const app = express()

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  next()
})

// Live rooms list
app.get('/api/rooms', (req, res) => {
  const list = []
  for (const [roomId, room] of rooms.entries()) {
    list.push({
      roomId,
      title:       room.title,
      viewerCount: room.viewers.size,
      startedAt:   room.startedAt,
    })
  }
  res.json(list)
})

// HLS segments + playlists
app.use('/hls', express.static(HLS_DIR, {
  setHeaders: (res, path) => {
    if (path.endsWith('.m3u8')) res.setHeader('Cache-Control', 'no-cache')
    else                       res.setHeader('Cache-Control', 'max-age=3600')
  }
}))

app.listen(HLS_PORT, () => console.log(`[HTTP] HLS server on :${HLS_PORT}`))

// ── WebSocket server ─────────────────────────────────────────────
const wss = new WebSocketServer({ port: WS_PORT })
console.log(`[WS] Relay server on :${WS_PORT}`)

function broadcast(roomId, obj, exclude = null) {
  const room = rooms.get(roomId)
  if (!room) return
  const msg = JSON.stringify(obj)
  for (const viewer of room.viewers) {
    if (viewer !== exclude && viewer.readyState === 1) viewer.send(msg)
  }
}

function broadcastViewerCount(roomId) {
  const room = rooms.get(roomId)
  if (!room) return
  const count = room.viewers.size
  // tell host
  if (room.host?.readyState === 1) room.host.send(JSON.stringify({ type: 'viewer_count', count }))
  // tell viewers
  broadcast(roomId, { type: 'viewer_count', count })
}

function startFFmpeg(roomId) {
  const outDir = join(HLS_DIR, roomId)
  mkdirSync(outDir, { recursive: true })

  const args = [
    '-re',
    '-i', 'pipe:0',                   // stdin = webm chunks from browser
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-b:v', '2000k',
    '-maxrate', '2500k',
    '-bufsize', '4000k',
    '-g', '30',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_list_size', '10',
    '-hls_flags', 'delete_segments+append_list',
    '-hls_segment_filename', join(outDir, 'seg_%03d.ts'),
    join(outDir, 'index.m3u8'),
  ]

  const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] })
  ff.stderr.on('data', d => process.stdout.write(`[ffmpeg:${roomId}] ${d}`))
  ff.on('close', code => console.log(`[ffmpeg:${roomId}] exited ${code}`))
  return ff
}

wss.on('connection', (ws) => {
  let role   = null   // 'host' | 'viewer'
  let roomId = null

  ws.on('message', (data, isBinary) => {
    // ── Binary → pipe to ffmpeg ──
    if (isBinary) {
      const room = rooms.get(roomId)
      if (room?.ffmpeg?.stdin.writable) {
        room.ffmpeg.stdin.write(data)
      }
      return
    }

    // ── JSON control ──
    let msg
    try { msg = JSON.parse(data.toString()) } catch { return }

    if (msg.type === 'host_register') {
      roomId = msg.roomId
      role   = 'host'

      const ff = startFFmpeg(roomId)
      rooms.set(roomId, {
        host:      ws,
        viewers:   new Set(),
        ffmpeg:    ff,
        title:     msg.title || 'Live Stream',
        startedAt: Date.now(),
      })

      ws.send(JSON.stringify({ type: 'registered', roomId }))
      console.log(`[room] ${roomId} started — "${msg.title}"`)

    } else if (msg.type === 'viewer_join') {
      roomId = msg.roomId
      role   = 'viewer'
      const room = rooms.get(roomId)
      if (!room) { ws.send(JSON.stringify({ type: 'error', message: 'Room not found' })); return }
      room.viewers.add(ws)
      broadcastViewerCount(roomId)

    } else if (msg.type === 'chat') {
      // relay to all viewers + host
      const room = rooms.get(msg.roomId || roomId)
      if (!room) return
      const chatMsg = JSON.stringify({ type: 'chat', user: msg.user, text: msg.text, ts: Date.now() })
      room.viewers.forEach(v => v.readyState === 1 && v.send(chatMsg))
      if (room.host?.readyState === 1) room.host.send(chatMsg)

    } else if (msg.type === 'end_stream') {
      const room = rooms.get(msg.roomId || roomId)
      if (!room) return
      room.ffmpeg?.stdin.end()
      broadcast(msg.roomId || roomId, { type: 'stream_ended' })
      rooms.delete(msg.roomId || roomId)
    }
  })

  ws.on('close', () => {
    if (role === 'host' && roomId) {
      const room = rooms.get(roomId)
      if (room) {
        room.ffmpeg?.stdin.end()
        broadcast(roomId, { type: 'stream_ended' })
        rooms.delete(roomId)
      }
    } else if (role === 'viewer' && roomId) {
      rooms.get(roomId)?.viewers.delete(ws)
      broadcastViewerCount(roomId)
    }
  })
})
