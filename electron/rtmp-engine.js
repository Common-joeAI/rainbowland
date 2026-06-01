/**
 * Rainbow Land Multi-Threaded RTMP Engine
 *
 * Uses Node.js worker_threads — one Worker per streaming destination.
 * Each Worker is completely isolated:
 *   - its own ffmpeg process
 *   - its own stdin/stderr pipe
 *   - crashes in one worker NEVER affect others
 *
 * Main thread is purely a router:
 *   renderer chunks → broadcast to all workers → ffmpeg → RTMP
 *
 * This is the opposite of TikTok Studio's single-threaded model.
 * A 500ms freeze in one destination doesn't stutter any other.
 */

const { ipcMain }              = require('electron')
const { Worker, MessageChannel } = require('worker_threads')
const path                     = require('path')
const which                    = require('which')

const WORKER_PATH = path.join(__dirname, 'workers', 'rtmp-worker.js')

// ── Active workers: destId → { worker, status, stats } ───────
const workers = new Map()

// ── Find ffmpeg (used for the health check IPC only) ──────────
async function findFfmpeg() {
  const candidates = [
    path.join(__dirname, '..', 'ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
  ]
  for (const c of candidates) {
    try { require('fs').accessSync(c); return c } catch {}
  }
  try { return await which('ffmpeg') } catch {}
  return null
}

// ── Spawn a worker for one destination ───────────────────────
function spawnWorker(destId, config, senderRef) {
  // Clean up any existing worker for this dest
  if (workers.has(destId)) {
    try { workers.get(destId).worker.terminate() } catch {}
    workers.delete(destId)
  }

  const worker = new Worker(WORKER_PATH)
  const state  = { worker, status: 'starting', stats: {} }
  workers.set(destId, state)

  // Forward all messages from worker → renderer
  worker.on('message', (msg) => {
    state.stats = msg.type === 'stats' ? { ...state.stats, ...msg } : state.stats
    if (msg.type === 'ready')   state.status = 'streaming'
    if (msg.type === 'stopped') state.status = 'stopped'
    if (msg.type === 'error')   state.status = 'error'

    // Safe send — renderer might have navigated away
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

  // Tell worker to start
  worker.postMessage({ type: 'start', config: { ...config, destId } })

  return state
}

// ── IPC: Start all enabled destinations ──────────────────────
ipcMain.handle('rtmp:start', async (event, { destinations, secrets, quality }) => {
  const sender  = event.sender
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
      }, sender)

      started.push(destId)
    } catch (e) {
      failed.push({ destId, error: e.message })
    }
  }

  return { ok: true, started, failed }
})

// ── IPC: Stop all ─────────────────────────────────────────────
ipcMain.handle('rtmp:stop', async () => {
  for (const [destId, { worker }] of workers) {
    try {
      worker.postMessage({ type: 'stop' })
      // Give it 3s to close gracefully, then terminate
      setTimeout(() => { try { worker.terminate() } catch {} }, 3000)
    } catch {}
  }
  workers.clear()
  return { ok: true }
})

// ── IPC: Stop one destination ─────────────────────────────────
ipcMain.handle('rtmp:stop-one', async (_, destId) => {
  const entry = workers.get(destId)
  if (entry) {
    try { entry.worker.postMessage({ type: 'stop' }) } catch {}
    setTimeout(() => { try { entry.worker.terminate() } catch {} }, 3000)
    workers.delete(destId)
  }
  return { ok: true }
})

// ── IPC: Route a video chunk to ALL active workers ────────────
// This is the hot path — keep it minimal.
// Each worker is a separate thread, so writes are truly parallel.
ipcMain.handle('rtmp:chunk-all', (_, { buffer }) => {
  if (workers.size === 0) return
  // Re-use the same Buffer across all workers (zero-copy with SharedArrayBuffer
  // would be even better, but Buffer.from is fast enough at 250ms chunks)
  const buf = Buffer.from(buffer)
  for (const [, { worker, status }] of workers) {
    if (status === 'streaming' || status === 'starting') {
      try { worker.postMessage({ type: 'chunk', buffer: buf }) } catch {}
    }
  }
})

// ── IPC: Route a chunk to ONE specific worker ─────────────────
ipcMain.handle('rtmp:chunk', (_, { destId, buffer }) => {
  const entry = workers.get(destId)
  if (!entry) return
  try { entry.worker.postMessage({ type: 'chunk', buffer: Buffer.from(buffer) }) } catch {}
})

// ── IPC: Status of all workers ────────────────────────────────
ipcMain.handle('rtmp:status', () => {
  const status = {}
  for (const [destId, { status: s, stats }] of workers) {
    status[destId] = { status: s, ...stats }
  }
  return status
})

// ── IPC: ffmpeg presence check ────────────────────────────────
ipcMain.handle('rtmp:check-ffmpeg', async () => {
  const bin = await findFfmpeg()
  return { found: !!bin, path: bin }
})

module.exports = {}
