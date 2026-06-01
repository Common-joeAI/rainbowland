/**
 * Rainbow Land Multi-Threaded RTMP Engine
 *
 * One Worker thread per destination (isolated crash domains).
 * GPU encoder detected once at startup and reused across all workers.
 *
 * Rainbow Land destination:
 *   - Auto-fetches a stream key from live.rainbowland.cc/api/desktop-key
 *   - Pushes to rtmp://live.rainbowland.cc/live/<key>
 *   - HLS playback at https://live.rainbowland.cc/hls/<key>/index.m3u8
 */

const { ipcMain }  = require('electron')
const { Worker }   = require('worker_threads')
const https        = require('https')
const http         = require('http')
const path         = require('path')
const { detectGPUEncoder, clearCache, findFfmpeg } = require('./gpu-detect')

const WORKER_PATH   = path.join(__dirname, 'workers', 'rtmp-worker.js')
const RL_LIVE_HOST  = process.env.RL_LIVE_HOST   || 'live.rainbowland.cc'
const RL_SECRET     = process.env.RL_STREAM_SECRET || 'rl-secret-change-me'

// ── Workers map: destId → { worker, status, stats, encoder } ─
const workers = new Map()

// ── Cached GPU result ─────────────────────────────────────────
let gpuInfo = null

// ── Active Rainbow Land stream key (cleared on stop) ─────────
let rlStreamKey = null
let rlHlsUrl    = null

// ── Fetch Rainbow Land stream key from live server ────────────
async function fetchRLStreamKey(title, creator) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ secret: RL_SECRET, title, creator })
    const isLocal = RL_LIVE_HOST.startsWith('localhost') || RL_LIVE_HOST.startsWith('127.')
    const mod = isLocal ? http : https
    const opts = {
      hostname: RL_LIVE_HOST,
      port:     isLocal ? 4000 : 443,
      path:     '/api/desktop-key',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }
    const req = mod.request(opts, (res) => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch { reject(new Error('Bad response from live server')) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ── Spawn an isolated worker for one destination ──────────────
function spawnWorker(destId, config, senderRef) {
  if (workers.has(destId)) {
    try { workers.get(destId).worker.terminate() } catch {}
    workers.delete(destId)
  }

  const worker = new Worker(WORKER_PATH)
  const state  = { worker, status: 'starting', stats: {}, encoder: config.encoder?.encoder || 'libx264' }
  workers.set(destId, state)

  worker.on('message', (msg) => {
    if (msg.type === 'stats')   Object.assign(state.stats, msg)
    if (msg.type === 'ready')   state.status = 'streaming'
    if (msg.type === 'stopped') state.status = 'stopped'
    if (msg.type === 'error')   state.status = 'error'
    try { senderRef.send('rtmp:event', msg) } catch {}
  })

  worker.on('error', (err) => {
    state.status = 'error'
    try { senderRef.send('rtmp:event', { type: 'error', destId, message: err.message }) } catch {}
  })

  worker.on('exit', (code) => {
    workers.delete(destId)
    try { senderRef.send('rtmp:event', { type: 'stopped', destId, code }) } catch {}
  })

  worker.postMessage({ type: 'start', config })
  return state
}

// ── IPC: Detect GPU ───────────────────────────────────────────
ipcMain.handle('rtmp:detect-gpu', async () => {
  gpuInfo = await detectGPUEncoder()
  return {
    encoder:    gpuInfo.encoder,
    label:      gpuInfo.label,
    icon:       gpuInfo.icon,
    vendor:     gpuInfo.vendor,
    isFallback: gpuInfo.isFallback,
    available:  gpuInfo.available,
    allResults: (gpuInfo.allResults || []).map(r => ({
      encoder: r.encoder, label: r.label, icon: r.icon,
      supported: r.supported, reason: r.reason,
    })),
    ffmpegPath: gpuInfo.ffmpegPath,
  }
})

ipcMain.handle('rtmp:redetect-gpu', async () => {
  clearCache()
  gpuInfo = null
  return ipcMain.handle['rtmp:detect-gpu']()
})

// ── IPC: Start streaming ──────────────────────────────────────
ipcMain.handle('rtmp:start', async (event, { destinations, secrets, quality, encoderOverride, streamTitle, user }) => {
  const sender = event.sender

  if (!gpuInfo) gpuInfo = await detectGPUEncoder()

  const activeEncoder = encoderOverride
    ? (gpuInfo.allResults || []).find(r => r.encoder === encoderOverride && r.supported) || gpuInfo
    : gpuInfo

  try {
    sender.send('rtmp:event', {
      type: 'encoder-selected',
      encoder: activeEncoder.encoder, label: activeEncoder.label,
      icon: activeEncoder.icon, isFallback: activeEncoder.isFallback,
    })
  } catch {}

  const started = []
  const failed  = []

  for (const [destId, dest] of Object.entries(destinations)) {
    if (!dest.enabled) continue

    let rtmpUrl = null

    // ── Rainbow Land: auto-fetch stream key ──────────────────
    if (destId === 'rainbowland') {
      try {
        const result = await fetchRLStreamKey(
          streamTitle || 'Rainbow Land Live',
          user?.name  || 'Creator'
        )
        rlStreamKey = result.streamKey
        rlHlsUrl    = result.hlsUrl
        rtmpUrl     = `${result.rtmpUrl}/${result.streamKey}`

        // Notify renderer of the live HLS URL so viewers can watch
        try {
          sender.send('rtmp:event', {
            type:   'rl-stream-ready',
            destId: 'rainbowland',
            hlsUrl: rlHlsUrl,
            key:    rlStreamKey,
          })
        } catch {}

        console.log(`[RL] Stream key: ${rlStreamKey} → ${rtmpUrl}`)
      } catch (e) {
        console.error('[RL] Failed to fetch stream key:', e.message)
        // Fallback to static key from secrets if live server unreachable
        const fallbackKey = secrets?.rainbowland || 'default'
        rtmpUrl = `rtmp://${RL_LIVE_HOST}/live/${fallbackKey}`
        rlStreamKey = fallbackKey
        rlHlsUrl = `https://${RL_LIVE_HOST}/hls/${fallbackKey}/index.m3u8`
      }
    } else {
      // Other platforms: use configured rtmpBase + stream key
      const base = dest.customUrl || dest.rtmpBase
      if (!base) {
        failed.push({ destId, error: 'No RTMP URL configured' })
        continue
      }
      const key = secrets?.[destId] || dest.key || ''
      rtmpUrl = key ? `${base}/${key}` : base
    }

    try {
      spawnWorker(destId, {
        rtmpUrl,
        quality: quality || {},
        destId,
        encoder: activeEncoder,
      }, sender)
      started.push(destId)
    } catch (e) {
      failed.push({ destId, error: e.message })
    }
  }

  return {
    ok: true, started, failed,
    encoder: activeEncoder.encoder,
    encoderLabel: activeEncoder.label,
    rlHlsUrl,
    rlStreamKey,
  }
})

// ── IPC: Stop all ─────────────────────────────────────────────
ipcMain.handle('rtmp:stop', async () => {
  for (const [, { worker }] of workers) {
    try {
      worker.postMessage({ type: 'stop' })
      setTimeout(() => { try { worker.terminate() } catch {} }, 3500)
    } catch {}
  }
  workers.clear()
  rlStreamKey = null
  rlHlsUrl    = null
  return { ok: true }
})

// ── IPC: Get current Rainbow Land HLS URL ────────────────────
ipcMain.handle('rtmp:rl-hls-url', () => ({ hlsUrl: rlHlsUrl, key: rlStreamKey }))

// ── IPC: Stop one ─────────────────────────────────────────────
ipcMain.handle('rtmp:stop-one', async (_, destId) => {
  const entry = workers.get(destId)
  if (entry) {
    try { entry.worker.postMessage({ type: 'stop' }) } catch {}
    setTimeout(() => { try { entry.worker.terminate() } catch {} }, 3500)
    workers.delete(destId)
  }
  if (destId === 'rainbowland') { rlStreamKey = null; rlHlsUrl = null }
  return { ok: true }
})

// ── IPC: Chunk passthrough ────────────────────────────────────
ipcMain.handle('rtmp:chunk-all', (_, { buffer }) => {
  if (!workers.size) return
  const buf = Buffer.from(buffer)
  for (const [, { worker, status }] of workers) {
    if (status === 'streaming' || status === 'starting') {
      try { worker.postMessage({ type: 'chunk', buffer: buf }) } catch {}
    }
  }
})

ipcMain.handle('rtmp:chunk', (_, { destId, buffer }) => {
  const entry = workers.get(destId)
  if (!entry) return
  try { entry.worker.postMessage({ type: 'chunk', buffer: Buffer.from(buffer) }) } catch {}
})

// ── IPC: Status ───────────────────────────────────────────────
ipcMain.handle('rtmp:status', () => {
  const out = {}
  for (const [id, { status, stats, encoder }] of workers) {
    out[id] = { status, encoder, ...stats }
  }
  return out
})

ipcMain.handle('rtmp:check-ffmpeg', async () => {
  const bin = findFfmpeg()
  return { found: !!bin, path: bin }
})

module.exports = {}
