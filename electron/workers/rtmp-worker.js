/**
 * RTMP Worker — runs in its own Node.js worker_thread.
 * One instance per streaming destination.
 *
 * Completely isolated: crashes here don't affect other streams.
 * Communicates with the main thread via parentPort messages.
 *
 * Message protocol:
 *   IN  { type: 'start',  config: {...} }  → spawn ffmpeg
 *   IN  { type: 'chunk',  buffer: Buffer } → write to ffmpeg stdin
 *   IN  { type: 'stop' }                   → graceful shutdown
 *
 *   OUT { type: 'ready' }                  → ffmpeg spawned OK
 *   OUT { type: 'log',   line: string }    → ffmpeg stderr line
 *   OUT { type: 'stats', fps, bitrate, time } → parsed progress
 *   OUT { type: 'error', message: string } → error
 *   OUT { type: 'stopped', code: number }  → ffmpeg exited
 */

const { parentPort, workerData } = require('worker_threads')
const { spawn } = require('child_process')
const path  = require('path')
const fs    = require('fs')
const which = require('which').sync

// ── Find ffmpeg ───────────────────────────────────────────────
function findFfmpeg() {
  // 1. bundled next to app
  const candidates = [
    path.join(__dirname, '..', '..', 'ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
    path.join(process.resourcesPath || '', 'ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
  ]
  for (const c of candidates) {
    try { fs.accessSync(c, fs.constants.X_OK); return c } catch {}
  }
  // 2. system PATH
  try { return which('ffmpeg') } catch {}
  return null
}

// ── Build ffmpeg args ─────────────────────────────────────────
function buildArgs(rtmpUrl, key, opts = {}) {
  const dest = key ? `${rtmpUrl}/${key}` : rtmpUrl
  const {
    width        = 1280,
    height       = 720,
    fps          = 30,
    videoBitrate = '2500k',
    audioBitrate = '128k',
    preset       = 'veryfast',
  } = opts

  return [
    '-hide_banner',
    '-loglevel', 'warning',
    '-stats',

    // Input: raw WebM from stdin
    '-re',
    '-i', 'pipe:0',

    // Video
    '-c:v',     'libx264',
    '-preset',  preset,
    '-tune',    'zerolatency',
    '-b:v',     videoBitrate,
    '-maxrate', videoBitrate,
    '-bufsize',`${parseInt(videoBitrate) * 2}k`,
    '-vf',      `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
    '-r',       String(fps),
    '-g',       String(fps * 2),   // keyframe every 2s
    '-keyint_min', String(fps),
    '-sc_threshold', '0',
    '-pix_fmt', 'yuv420p',

    // Audio
    '-c:a',  'aac',
    '-b:a',  audioBitrate,
    '-ar',   '44100',
    '-ac',   '2',

    // Output
    '-f',    'flv',
    dest,
  ]
}

// ── Parse ffmpeg progress lines ───────────────────────────────
function parseProgress(line) {
  const fps     = line.match(/fps=\s*([\d.]+)/)
  const bitrate = line.match(/bitrate=\s*([\d.]+\s*\w+bits\/s)/)
  const time    = line.match(/time=(\d+:\d+:\d+\.\d+)/)
  const drop    = line.match(/drop=(\d+)/)
  if (fps || bitrate || time) {
    return {
      type: 'stats',
      fps:      fps     ? parseFloat(fps[1])     : null,
      bitrate:  bitrate ? bitrate[1].trim()       : null,
      time:     time    ? time[1]                 : null,
      dropped:  drop    ? parseInt(drop[1])        : 0,
    }
  }
  return null
}

// ── Worker state ──────────────────────────────────────────────
let ffmpegProc  = null
let isRunning   = false
let chunkQueue  = []           // buffer chunks received before ffmpeg is ready
let draining    = false

// ── Message handler ───────────────────────────────────────────
parentPort.on('message', (msg) => {
  switch (msg.type) {

    case 'start': {
      const { rtmpBase, key, quality, destId } = msg.config
      const bin = findFfmpeg()

      if (!bin) {
        parentPort.postMessage({ type: 'error', message: 'ffmpeg not found. Install ffmpeg and add it to PATH.' })
        return
      }

      const args = buildArgs(rtmpBase, key, quality)

      try {
        ffmpegProc = spawn(bin, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
        })

        isRunning = true

        // Drain any queued chunks
        if (chunkQueue.length > 0) {
          chunkQueue.forEach(buf => {
            if (ffmpegProc.stdin.writable) ffmpegProc.stdin.write(buf)
          })
          chunkQueue = []
        }

        parentPort.postMessage({ type: 'ready', destId, pid: ffmpegProc.pid })

        // Pipe stderr → progress + logs
        let stderrBuf = ''
        ffmpegProc.stderr.on('data', (d) => {
          stderrBuf += d.toString()
          const lines = stderrBuf.split('\n')
          stderrBuf = lines.pop() // keep incomplete line
          lines.forEach(line => {
            if (!line.trim()) return
            const stats = parseProgress(line)
            if (stats) {
              parentPort.postMessage({ ...stats, destId })
            } else {
              parentPort.postMessage({ type: 'log', destId, line })
            }
          })
        })

        ffmpegProc.stdout.on('data', () => {}) // ignore stdout

        ffmpegProc.on('error', (err) => {
          parentPort.postMessage({ type: 'error', destId, message: err.message })
          isRunning = false
        })

        ffmpegProc.on('exit', (code, signal) => {
          parentPort.postMessage({ type: 'stopped', destId, code, signal })
          isRunning = false
          ffmpegProc = null
        })

        ffmpegProc.stdin.on('error', (err) => {
          // Broken pipe is expected on stop — suppress
          if (err.code !== 'EPIPE') {
            parentPort.postMessage({ type: 'log', destId, line: `[stdin] ${err.message}` })
          }
        })

      } catch (err) {
        parentPort.postMessage({ type: 'error', destId, message: err.message })
      }
      break
    }

    case 'chunk': {
      const buf = Buffer.from(msg.buffer)
      if (ffmpegProc && ffmpegProc.stdin.writable && !draining) {
        // Backpressure handling — don't exceed stdin buffer
        const ok = ffmpegProc.stdin.write(buf)
        if (!ok) {
          draining = true
          ffmpegProc.stdin.once('drain', () => { draining = false })
        }
      } else if (!isRunning) {
        // Queue until ffmpeg is ready (handles race on startup)
        if (chunkQueue.length < 100) chunkQueue.push(buf)
      }
      break
    }

    case 'stop': {
      if (ffmpegProc) {
        try {
          ffmpegProc.stdin.end()
          setTimeout(() => {
            if (ffmpegProc) {
              ffmpegProc.kill('SIGTERM')
              setTimeout(() => ffmpegProc?.kill('SIGKILL'), 3000)
            }
          }, 1000)
        } catch {}
      }
      isRunning = false
      break
    }
  }
})
