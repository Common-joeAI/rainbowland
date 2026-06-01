/**
 * Rainbow Land Multi-Threaded RTMP Engine
 *
 * One Worker thread per destination (isolated crash domains).
 * GPU encoder detected once at startup and reused across all workers.
 *
 * Encoder priority:
 *   NVIDIA → h264_nvenc  (NVENC)
 *   AMD    → h264_amf    (AMF/VCE)
 *   Intel  → h264_qsv    (Quick Sync)
 *   Apple  → h264_videotoolbox
 *   CPU    → libx264 veryfast (fallback)
 */

const { ipcMain }  = require('electron')
const { Worker }   = require('worker_threads')
const path         = require('path')
const { detectGPUEncoder, clearCache, findFfmpeg } = require('./gpu-detect')

const WORKER_PATH = path.join(__dirname, 'workers', 'rtmp-worker.js')

// ── Workers map: destId → { worker, status, stats, encoder } ─
const workers = new Map()

// ── Cached GPU result (set on first rtmp:start or rtmp:detect) ─
let gpuInfo = null

// ── Spawn an isolated worker for one destination ──────────────
function spawnWorker(destId, config, senderRef) {
  // Kill any existing worker for this dest
  if (workers.has(destId)) {
    try { workers.get(destId).worker.terminate() } catch {}
    workers.delete(destId)
  }

  const worker = new Worker(WORKER_PATH)
  const state  = {
    worker,
    status:  'starting',
    stats:   {},
    encoder: config.encoder?.encoder || 'libx264',
  }
  workers.set(destId, state)

  worker.on('message', (msg) => {
    // Update local state
    if (msg.type === 'stats')   Object.assign(state.stats, msg)
    if (msg.type === 'ready')   state.status = 'streaming'
    if (msg.type === 'stopped') state.status = 'stopped'
    if (msg.type === 'error')   state.status = 'error'

    // Forward to renderer
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

// ── IPC: Detect GPU encoder (call from settings page) ─────────
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
      encoder:   r.encoder,
      label:     r.label,
      icon:      r.icon,
      supported: r.supported,
      reason:    r.reason,
    })),
    ffmpegPath: gpuInfo.ffmpegPath,
  }
})

// ── IPC: Force re-detect (e.g. after installing drivers) ──────
ipcMain.handle('rtmp:redetect-gpu', async () => {
  clearCache()
  gpuInfo = null
  return ipcMain.handle['rtmp:detect-gpu']()
})

// ── IPC: Start streaming to all enabled destinations ──────────
ipcMain.handle('rtmp:start', async (event, { destinations, secrets, quality, encoderOverride }) => {
  const sender = event.sender

  // Detect GPU if not already done
  if (!gpuInfo) {
    gpuInfo = await detectGPUEncoder()
  }

  // Allow per-stream encoder override (advanced users)
  const activeEncoder = encoderOverride
    ? (gpuInfo.allResults || []).find(r => r.encoder === encoderOverride && r.supported) || gpuInfo
    : gpuInfo

  // Notify renderer which encoder we're using
  try {
    sender.send('rtmp:event', {
      type:     'encoder-selected',
      encoder:  activeEncoder.encoder,
      label:    activeEncoder.label,
      icon:     activeEncoder.icon,
      isFallback: activeEncoder.isFallback,
    })
  } catch {}

  const started = []
  const failed  = []

  for (const [destId, dest] of Object.entries(destinations)) {
    if (!dest.enabled) continue

    const rtmpBase = dest.customUrl || dest.rtmpBase
    if (!rtmpBase) {
      failed.push({ destId, error: 'No RTMP URL configured' })
      continue
    }

    try {
      spawnWorker(destId, {
        rtmpBase,
        key:     secrets?.[destId] || dest.key || '',
        quality: quality || {},
        destId,
        encoder: activeEncoder,   // full encoder info passed to worker
      }, sender)

      started.push(destId)
    } catch (e) {
      failed.push({ destId, error: e.message })
    }
  }

  return { ok: true, started, failed, encoder: activeEncoder.encoder, encoderLabel: activeEncoder.label }
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
  return { ok: true }
})

// ── IPC: Stop one ─────────────────────────────────────────────
ipcMain.handle('rtmp:stop-one', async (_, destId) => {
  const entry = workers.get(destId)
  if (entry) {
    try { entry.worker.postMessage({ type: 'stop' }) } catch {}
    setTimeout(() => { try { entry.worker.terminate() } catch {} }, 3500)
    workers.delete(destId)
  }
  return { ok: true }
})

// ── IPC: Broadcast chunk to ALL workers (hot path) ────────────
ipcMain.handle('rtmp:chunk-all', (_, { buffer }) => {
  if (!workers.size) return
  const buf = Buffer.from(buffer)
  for (const [, { worker, status }] of workers) {
    if (status === 'streaming' || status === 'starting') {
      try { worker.postMessage({ type: 'chunk', buffer: buf }) } catch {}
    }
  }
})

// ── IPC: Single destination chunk ────────────────────────────
ipcMain.handle('rtmp:chunk', (_, { destId, buffer }) => {
  const entry = workers.get(destId)
  if (!entry) return
  try { entry.worker.postMessage({ type: 'chunk', buffer: Buffer.from(buffer) }) } catch {}
})

// ── IPC: Status of all workers ────────────────────────────────
ipcMain.handle('rtmp:status', () => {
  const out = {}
  for (const [id, { status, stats, encoder }] of workers) {
    out[id] = { status, encoder, ...stats }
  }
  return out
})

// ── IPC: ffmpeg check ─────────────────────────────────────────
ipcMain.handle('rtmp:check-ffmpeg', async () => {
  const bin = findFfmpeg()
  return { found: !!bin, path: bin }
})

module.exports = {}
