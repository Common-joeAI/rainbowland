/**
 * GPU Detection & Encoder Negotiation
 *
 * Probes the system for available hardware encoders by running
 * a quick ffmpeg test encode. Falls back gracefully:
 *
 *   NVIDIA  → h264_nvenc   (NVENC)
 *   AMD     → h264_amf     (AMF / VCE)
 *   Intel   → h264_qsv     (Quick Sync)
 *   Apple   → h264_videotoolbox
 *   Fallback→ libx264      (CPU veryfast)
 *
 * Results are cached for the session so we only probe once.
 */

const { execFileSync, spawnSync } = require('child_process')
const which = require('which')
const os    = require('os')

// ── Cache ──────────────────────────────────────────────────────
let cachedResult = null

// ── GPU encoder candidates (priority order) ───────────────────
const CANDIDATES = [
  {
    encoder: 'h264_nvenc',
    vendor:  'NVIDIA',
    label:   'NVIDIA NVENC',
    icon:    '🟢',
    // Extra args that make NVENC shine
    extraArgs: [
      '-preset:v', 'p4',          // balanced quality/speed (p1=fastest, p7=best)
      '-tune:v',   'll',          // low latency mode
      '-rc:v',     'cbr',         // constant bitrate for streaming
      '-rc-lookahead', '0',
      '-no-scenecut', '1',
      '-forced-idr',  '1',
      '-gpu',     'any',          // auto-select best NVENC-capable GPU
    ],
  },
  {
    encoder: 'h264_amf',
    vendor:  'AMD',
    label:   'AMD AMF',
    icon:    '🔴',
    extraArgs: [
      '-quality',     'speed',
      '-rc',          'cbr',
      '-usage',       'ultralowlatency',
      '-enforce_hrd', '1',
    ],
  },
  {
    encoder: 'h264_qsv',
    vendor:  'Intel',
    label:   'Intel Quick Sync',
    icon:    '🔵',
    extraArgs: [
      '-preset', 'veryfast',
      '-look_ahead', '0',
      '-vcm',         '1',        // video conferencing mode
    ],
  },
  {
    encoder: 'h264_videotoolbox',
    vendor:  'Apple',
    label:   'Apple VideoToolbox',
    icon:    '🍎',
    // Only available on macOS
    platform: 'darwin',
    extraArgs: [
      '-allow_sw', '1',           // fallback to SW if VT unavailable
      '-realtime', '1',
    ],
  },
  {
    encoder: 'libx264',
    vendor:  'CPU',
    label:   'CPU (libx264)',
    icon:    '⚙️',
    isFallback: true,
    extraArgs: [
      '-preset', 'veryfast',
      '-tune',   'zerolatency',
    ],
  },
]

// ── Find ffmpeg binary ────────────────────────────────────────
function findFfmpeg() {
  const path = require('path')
  const fs   = require('fs')
  const candidates = [
    path.join(__dirname, '..', 'ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
    path.join(process.resourcesPath || '', 'ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
  ]
  for (const c of candidates) {
    try { fs.accessSync(c, fs.constants.X_OK); return c } catch {}
  }
  try { return which.sync('ffmpeg') } catch {}
  return null
}

// ── Test whether an encoder is available ─────────────────────
function testEncoder(ffmpegBin, encoder) {
  try {
    // Generate a tiny 1-frame black test video and encode it
    const result = spawnSync(ffmpegBin, [
      '-f',        'lavfi',
      '-i',        'color=black:s=64x64:r=1:d=0.1',
      '-c:v',      encoder,
      '-frames:v', '1',
      '-f',        'null',
      '-',
    ], {
      timeout:  8000,   // 8s max per probe
      stdio:    'pipe',
    })

    // Exit code 0 = encoder worked
    return result.status === 0
  } catch {
    return false
  }
}

// ── List all encoders ffmpeg knows about ─────────────────────
function listFfmpegEncoders(ffmpegBin) {
  try {
    const out = execFileSync(ffmpegBin, ['-encoders', '-hide_banner'], {
      timeout: 5000,
      encoding: 'utf8',
    })
    return out
  } catch {
    return ''
  }
}

// ── Main probe function ───────────────────────────────────────
async function detectGPUEncoder() {
  if (cachedResult) return cachedResult

  const ffmpegBin = findFfmpeg()
  if (!ffmpegBin) {
    cachedResult = {
      available:    false,
      encoder:      null,
      label:        'ffmpeg not found',
      icon:         '❌',
      isFallback:   true,
      allResults:   [],
      ffmpegPath:   null,
    }
    return cachedResult
  }

  // Quick pre-filter: check encoder is listed before doing a test encode
  const encoderList = listFfmpegEncoders(ffmpegBin)

  const allResults = []

  for (const candidate of CANDIDATES) {
    // Platform guard
    if (candidate.platform && candidate.platform !== process.platform) {
      allResults.push({ ...candidate, supported: false, reason: 'wrong platform' })
      continue
    }

    // Check if encoder name appears in ffmpeg's encoder list
    const listedInFfmpeg = encoderList.includes(candidate.encoder)
    if (!listedInFfmpeg && !candidate.isFallback) {
      allResults.push({ ...candidate, supported: false, reason: 'not in ffmpeg build' })
      continue
    }

    // Do a real test encode
    const works = testEncoder(ffmpegBin, candidate.encoder)
    allResults.push({ ...candidate, supported: works, reason: works ? 'ok' : 'test encode failed' })

    // First working non-CPU encoder wins
    if (works && !candidate.isFallback) {
      cachedResult = {
        available:   true,
        encoder:     candidate.encoder,
        label:       candidate.label,
        icon:        candidate.icon,
        vendor:      candidate.vendor,
        extraArgs:   candidate.extraArgs,
        isFallback:  false,
        allResults,
        ffmpegPath:  ffmpegBin,
      }
      console.log(`[gpu-detect] ✅ Using ${candidate.label} (${candidate.encoder})`)
      return cachedResult
    }
  }

  // CPU fallback
  const cpuCandidate = CANDIDATES.find(c => c.isFallback)
  cachedResult = {
    available:   true,
    encoder:     cpuCandidate.encoder,
    label:       cpuCandidate.label,
    icon:        cpuCandidate.icon,
    vendor:      'CPU',
    extraArgs:   cpuCandidate.extraArgs,
    isFallback:  true,
    allResults,
    ffmpegPath:  ffmpegBin,
  }
  console.log(`[gpu-detect] ⚙️ No GPU encoder found, using CPU libx264`)
  return cachedResult
}

// ── Clear cache (call if user swaps GPU) ─────────────────────
function clearCache() { cachedResult = null }

module.exports = { detectGPUEncoder, clearCache, CANDIDATES, findFfmpeg }
