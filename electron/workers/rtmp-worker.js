/**
 * RTMP Worker — one instance per streaming destination.
 * Runs in an isolated worker_thread.
 *
 * Supports GPU-accelerated encoding:
 *   NVIDIA  → h264_nvenc
 *   AMD     → h264_amf
 *   Intel   → h264_qsv
 *   Apple   → h264_videotoolbox
 *   Fallback→ libx264 (CPU veryfast)
 *
 * Message protocol (IN):
 *   { type: 'start',  config: { rtmpBase, key, quality, encoder } }
 *   { type: 'chunk',  buffer: Buffer }
 *   { type: 'stop' }
 *
 * Message protocol (OUT):
 *   { type: 'ready',   destId, pid }
 *   { type: 'log',     destId, line }
 *   { type: 'stats',   destId, fps, bitrate, time, dropped }
 *   { type: 'error',   destId, message }
 *   { type: 'stopped', destId, code, signal }
 */

const { parentPort } = require('worker_threads')
const { spawn }      = require('child_process')
const path           = require('path')
const fs             = require('fs')
const which          = require('which')

// ── Find ffmpeg ───────────────────────────────────────────────
function findFfmpeg() {
  const candidates = [
    path.join(__dirname, '..', '..', 'ffmpeg',
      process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
    path.join(process.resourcesPath || '', 'ffmpeg',
      process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
  ]
  for (const c of candidates) {
    try { fs.accessSync(c, fs.constants.X_OK); return c } catch {}
  }
  try { return which.sync('ffmpeg') } catch {}
  return null
}

// ── Build ffmpeg args ─────────────────────────────────────────
function buildArgs(rtmpUrl, key, opts = {}, encoderInfo = {}) {
  const dest = key ? `${rtmpUrl}/${key}` : rtmpUrl
  const {
    width        = 1280,
    height       = 720,
    fps          = 30,
    videoBitrate = '2500k',
    audioBitrate = '128k',
  } = opts

  const encoder   = encoderInfo.encoder   || 'libx264'
  const extraArgs = encoderInfo.extraArgs || ['-preset', 'veryfast', '-tune', 'zerolatency']

  // ── Scale filter ──────────────────────────────────────────
  // NVENC can scale on the GPU via scale_cuda; others use CPU scale.
  // We keep it simple with CPU scale for now (input is already the
  // right size from MediaRecorder constraints).
  const scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`

  return [
    '-hide_banner',
    '-loglevel', 'warning',
    '-stats',

    // ── Input: raw WebM from stdin (MediaRecorder output) ────
    '-re',
    '-i', 'pipe:0',

    // ── Video ────────────────────────────────────────────────
    '-c:v',     encoder,
    ...extraArgs,                   // GPU-specific tuning flags

    // Common to all encoders:
    '-b:v',     videoBitrate,
    '-maxrate', videoBitrate,
    '-bufsize',`${parseInt(videoBitrate) * 2}k`,
    '-vf',      scaleFilter,
    '-r',       String(fps),
    '-g',       String(fps * 2),    // keyframe every 2 seconds
    '-keyint_min', String(fps),
    '-sc_threshold', '0',
    '-pix_fmt', 'yuv420p',          // all platforms + RTMP require this

    // ── Audio ────────────────────────────────────────────────
    '-c:a',  'aac',
    '-b:a',  audioBitrate,
    '-ar',   '44100',
    '-ac',   '2',

    // ── Output ───────────────────────────────────────────────
    '-f',    'flv',
    dest,
  ]
}

// ── Parse ffmpeg progress ─────────────────────────────────────
function parseProgress(line) {
  const fps     = line.match(/fps=\s*([\d.]+)/)
  const bitrate = line.match(/bitrate=\s*([\d.]+\s*\w+bits\/s)/)
  const time    = line.match(/time=(\d+:\d+:\d+\.\d+)/)
  const drop    = line.match(/drop=(\d+)/)
  const speed   = line.match(/speed=\s*([\d.]+)x/)
  if (fps || bitrate || time) {
    return {
      type:    'stats',
      fps:     fps     ? parseFloat(fps[1])    : null,
      bitrate: bitrate ? bitrate[1].trim()      : null,
      time:    time    ? time[1]                : null,
      dropped: drop    ? parseInt(drop[1])      : 0,
      speed:   speed   ? parseFloat(speed[1])   : null,
    }
  }
  return null
}

// ── Worker state ──────────────────────────────────────────────
let ffmpegProc = null
let isRunning  = false
let chunkQueue = []
let draining   = false

// ── Message handler ───────────────────────────────────────────
parentPort.on('message', (msg) => {
  switch (msg.type) {

    case 'start': {
      const { rtmpBase, rtmpUrl: rtmpUrlDirect, key, quality, destId, encoder: encoderInfo } = msg.config
      const bin = findFfmpeg()

      if (!bin) {
        parentPort.postMessage({
          type: 'error', destId,
          message: 'ffmpeg not found. Install ffmpeg and add it to your PATH.',
        })
        return
      }

      // rtmpUrl from engine already includes key for Rainbow Land
      const effectiveUrl = rtmpUrlDirect || rtmpBase
      const effectiveKey = rtmpUrlDirect ? '' : key  // don't double-append key if full URL given
      const args = buildArgs(effectiveUrl, effectiveKey, quality, encoderInfo)

      // Log what encoder we're using
      parentPort.postMessage({
        type: 'log', destId,
        line: `[encoder] Using ${encoderInfo?.label || 'CPU libx264'} ${encoderInfo?.icon || '⚙️'}`,
      })
      parentPort.postMessage({
        type: 'log', destId,
        line: `[ffmpeg] ${bin} ${args.join(' ')}`,
      })

      try {
        ffmpegProc = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] })
        isRunning  = true

        // Drain queued chunks
        if (chunkQueue.length > 0) {
          for (const buf of chunkQueue) {
            if (ffmpegProc.stdin.writable) ffmpegProc.stdin.write(buf)
          }
          chunkQueue = []
        }

        parentPort.postMessage({ type: 'ready', destId, pid: ffmpegProc.pid,
          encoder: encoderInfo?.encoder, encoderLabel: encoderInfo?.label })

        // Stderr → progress + logs
        let stderrBuf = ''
        ffmpegProc.stderr.on('data', (d) => {
          stderrBuf += d.toString()
          const lines = stderrBuf.split('\n')
          stderrBuf = lines.pop()
          for (const line of lines) {
            if (!line.trim()) continue
            const stats = parseProgress(line)
            if (stats) parentPort.postMessage({ ...stats, destId })
            else       parentPort.postMessage({ type: 'log', destId, line })
          }
        })

        ffmpegProc.stdout.on('data', () => {})

        ffmpegProc.on('error', (err) => {
          parentPort.postMessage({ type: 'error', destId, message: err.message })
          isRunning = false
        })

        ffmpegProc.on('exit', (code, signal) => {
          parentPort.postMessage({ type: 'stopped', destId, code, signal })
          isRunning  = false
          ffmpegProc = null
        })

        ffmpegProc.stdin.on('error', (err) => {
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
        const ok = ffmpegProc.stdin.write(buf)
        if (!ok) {
          draining = true
          ffmpegProc.stdin.once('drain', () => { draining = false })
        }
      } else if (!isRunning) {
        if (chunkQueue.length < 120) chunkQueue.push(buf)
      }
      break
    }

    case 'stop': {
      if (ffmpegProc) {
        try { ffmpegProc.stdin.end() } catch {}
        setTimeout(() => {
          if (ffmpegProc) {
            try { ffmpegProc.kill('SIGTERM') } catch {}
            setTimeout(() => { try { ffmpegProc?.kill('SIGKILL') } catch {} }, 3000)
          }
        }, 800)
      }
      isRunning = false
      break
    }
  }
})
