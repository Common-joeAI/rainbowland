/**
 * Rainbow Land Multi-RTMP Engine
 * Spawns an ffmpeg process for each enabled destination.
 * Uses the system ffmpeg (or bundled binary).
 *
 * Architecture:
 *   Browser getUserMedia → <canvas> → captureStream() → MediaRecorder
 *   → ArrayBuffer chunks → IPC → Node → ffmpeg stdin → RTMP destinations
 *
 * This module is required by main.js and registers IPC handlers.
 */

const { ipcMain } = require('electron')
const { spawn }   = require('child_process')
const path        = require('path')
const which       = require('which')

// ── RTMP destination endpoints ────────────────────────────────
const RTMP_ENDPOINTS = {
  rainbowland: 'rtmp://67.38.45.238:1935/live',
  tiktok:      'rtmp://push.tiktok.com/live',
  youtube:     'rtmp://a.rtmp.youtube.com/live2',
  facebook:    'rtmps://live-api-s.facebook.com:443/rtmp',
  twitch:      'rtmp://live.twitch.tv/live',
}

// ── Active ffmpeg processes ───────────────────────────────────
const processes = new Map() // destId → ChildProcess

// ── Find ffmpeg ───────────────────────────────────────────────
async function findFfmpeg() {
  // 1. Bundled binary next to the app
  const bundled = path.join(process.resourcesPath || __dirname, '..', 'ffmpeg',
    process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
  try {
    require('fs').accessSync(bundled)
    return bundled
  } catch {}

  // 2. System PATH
  try { return await which('ffmpeg') } catch {}

  return null
}

// ── Build ffmpeg args for one destination ─────────────────────
function buildArgs(rtmpUrl, streamKey, opts = {}) {
  const dest = streamKey ? `${rtmpUrl}/${streamKey}` : rtmpUrl
  const {
    width      = 1280,
    height     = 720,
    fps        = 30,
    videoBitrate = '2500k',
    audioBitrate = '128k',
  } = opts

  return [
    // Input: read raw WebM from stdin (from MediaRecorder)
    '-re',
    '-i', 'pipe:0',

    // Video encoding
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-b:v', videoBitrate,
    '-maxrate', videoBitrate,
    '-bufsize', '4000k',
    '-vf', `scale=${width}:${height}`,
    '-r', String(fps),
    '-g', String(fps * 2),      // keyframe every 2s
    '-pix_fmt', 'yuv420p',

    // Audio encoding
    '-c:a', 'aac',
    '-b:a', audioBitrate,
    '-ar', '44100',

    // Output
    '-f', 'flv',
    dest,
  ]
}

// ── Start all enabled destinations ────────────────────────────
ipcMain.handle('rtmp:start', async (event, { destinations, secrets, quality }) => {
  const ffmpeg = await findFfmpeg()
  if (!ffmpeg) {
    return { ok: false, error: 'ffmpeg not found. Install ffmpeg and add it to your PATH.' }
  }

  const started = []
  const failed  = []

  for (const [destId, config] of Object.entries(destinations)) {
    if (!config.enabled) continue

    const rtmpBase = config.url || RTMP_ENDPOINTS[destId]
    if (!rtmpBase) continue

    const streamKey = secrets?.[destId] || config.key || ''

    try {
      const args = buildArgs(rtmpBase, streamKey, quality)
      const proc = spawn(ffmpeg, args, { stdio: ['pipe', 'pipe', 'pipe'] })

      proc.stderr.on('data', (d) => {
        const line = d.toString()
        // Forward ffmpeg progress to renderer
        event.sender.send('rtmp:log', { destId, line })
      })

      proc.on('exit', (code) => {
        processes.delete(destId)
        event.sender.send('rtmp:stopped', { destId, code })
      })

      processes.set(destId, proc)
      started.push(destId)
    } catch (e) {
      failed.push({ destId, error: e.message })
    }
  }

  return { ok: true, started, failed }
})

// ── Stop all ──────────────────────────────────────────────────
ipcMain.handle('rtmp:stop', async () => {
  for (const [destId, proc] of processes) {
    try {
      proc.stdin.end()
      proc.kill('SIGTERM')
    } catch {}
    processes.delete(destId)
  }
  return { ok: true }
})

// ── Stop one ──────────────────────────────────────────────────
ipcMain.handle('rtmp:stop-one', async (_, destId) => {
  const proc = processes.get(destId)
  if (proc) {
    try { proc.stdin.end(); proc.kill('SIGTERM') } catch {}
    processes.delete(destId)
  }
  return { ok: true }
})

// ── Feed video chunk from renderer → ffmpeg stdin ─────────────
ipcMain.handle('rtmp:chunk', (_, { destId, buffer }) => {
  const proc = processes.get(destId)
  if (!proc || !proc.stdin.writable) return
  proc.stdin.write(Buffer.from(buffer))
})

// ── Broadcast a chunk to ALL active ffmpeg processes ─────────
ipcMain.handle('rtmp:chunk-all', (_, { buffer }) => {
  const buf = Buffer.from(buffer)
  for (const [, proc] of processes) {
    if (proc.stdin.writable) {
      try { proc.stdin.write(buf) } catch {}
    }
  }
})

// ── Status ────────────────────────────────────────────────────
ipcMain.handle('rtmp:status', () => {
  const status = {}
  for (const [destId] of processes) {
    status[destId] = 'streaming'
  }
  return status
})

// ── ffmpeg presence check ─────────────────────────────────────
ipcMain.handle('rtmp:check-ffmpeg', async () => {
  const bin = await findFfmpeg()
  return { found: !!bin, path: bin }
})

module.exports = {}
