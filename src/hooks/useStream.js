/**
 * useStream — camera, mic, screen share, and multi-RTMP streaming.
 * GPU encoder is auto-detected by the Electron main process.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { useStore } from './useStore'

const IS_ELECTRON = typeof window !== 'undefined' && !!window.electronAPI

export const QUALITY_PRESETS = {
  low:    { label: '480p',  width: 854,  height: 480,  fps: 24, videoBitrate: '1000k', audioBitrate: '96k'  },
  medium: { label: '720p',  width: 1280, height: 720,  fps: 30, videoBitrate: '2500k', audioBitrate: '128k' },
  high:   { label: '1080p', width: 1920, height: 1080, fps: 30, videoBitrate: '4500k', audioBitrate: '160k' },
}

export function useStream() {
  const { destinations, secrets, quality: storeQuality } = useStore()

  const videoRef     = useRef(null)
  const camStream    = useRef(null)
  const screenStream = useRef(null)
  const recorder     = useRef(null)

  const [camOn,         setCamOn]         = useState(false)
  const [micOn,         setMicOn]         = useState(true)
  const [screenOn,      setScreenOn]      = useState(false)
  const [facingMode,    setFacingMode]    = useState('user')
  const [quality,       setQuality]       = useState(storeQuality || 'medium')
  const [isLive,        setIsLive]        = useState(false)
  const [activeStreams, setActiveStreams]  = useState({})
  const [elapsed,       setElapsed]       = useState(0)
  const [error,         setError]         = useState(null)
  const [ffmpegLogs,    setFfmpegLogs]    = useState([])
  const [ffmpegFound,   setFfmpegFound]   = useState(null)
  const [encoderInfo,   setEncoderInfo]   = useState(null)   // { label, icon, encoder, isFallback }
  const [encoderOverride, setEncoderOverride] = useState(null)

  // ── ffmpeg check on mount ────────────────────────────────────
  useEffect(() => {
    if (!IS_ELECTRON) return
    window.electronAPI.checkFfmpeg().then(r => setFfmpegFound(r?.found))
  }, [])

  // ── Listen for events from main process ─────────────────────
  useEffect(() => {
    if (!IS_ELECTRON) return

    const handler = (msg) => {
      if (!msg) return
      switch (msg.type) {
        case 'encoder-selected':
          setEncoderInfo({ label: msg.label, icon: msg.icon, encoder: msg.encoder, isFallback: msg.isFallback })
          break
        case 'log':
          setFfmpegLogs(l => [...l.slice(-150), { destId: msg.destId, line: msg.line, ts: Date.now() }])
          break
        case 'stats':
          // Could update per-dest stats here
          break
        case 'stopped':
          setActiveStreams(s => {
            const n = { ...s }
            delete n[msg.destId]
            return n
          })
          break
        case 'error':
          setActiveStreams(s => ({ ...s, [msg.destId]: 'error' }))
          break
      }
    }

    window.electronAPI.on('rtmp:event', handler)
    return () => window.electronAPI.off('rtmp:event', handler)
  }, [])

  // ── Timer ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLive) return
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [isLive])

  // ── Camera ───────────────────────────────────────────────────
  const startCamera = useCallback(async (facing = facingMode) => {
    try {
      camStream.current?.getTracks().forEach(t => t.stop())
      const preset = QUALITY_PRESETS[quality]
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: preset.width }, height: { ideal: preset.height }, frameRate: { ideal: preset.fps } },
        audio: micOn,
      })
      camStream.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play() }
      setCamOn(true)
      setError(null)
    } catch (e) {
      setError(`Camera: ${e.message}`)
      setCamOn(false)
    }
  }, [facingMode, micOn, quality])

  const stopCamera = useCallback(() => {
    camStream.current?.getTracks().forEach(t => t.stop())
    camStream.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCamOn(false)
  }, [])

  const toggleCamera = () => camOn ? stopCamera() : startCamera()

  const flipCamera = useCallback(() => {
    const next = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(next)
    if (camOn) startCamera(next)
  }, [facingMode, camOn, startCamera])

  const toggleMic = useCallback(() => {
    camStream.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
    setMicOn(m => !m)
  }, [])

  // ── Screen share ─────────────────────────────────────────────
  const toggleScreen = useCallback(async () => {
    if (screenOn) {
      screenStream.current?.getTracks().forEach(t => t.stop())
      screenStream.current = null
      if (videoRef.current && camStream.current) videoRef.current.srcObject = camStream.current
      setScreenOn(false)
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        screenStream.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        setScreenOn(true)
        stream.getVideoTracks()[0].addEventListener('ended', () => {
          setScreenOn(false)
          if (videoRef.current && camStream.current) videoRef.current.srcObject = camStream.current
        })
      } catch (e) { setError(`Screen share: ${e.message}`) }
    }
  }, [screenOn])

  // ── Go Live ──────────────────────────────────────────────────
  const goLive = useCallback(async () => {
    if (!camOn) await startCamera()

    const enabled = Object.entries(destinations).filter(([, d]) => d.enabled)
    if (!enabled.length) { setError('Enable at least one destination first.'); return }

    setElapsed(0)
    setFfmpegLogs([])

    if (IS_ELECTRON) {
      const result = await window.electronAPI.startStream({
        destinations,
        secrets,
        quality: QUALITY_PRESETS[quality],
        encoderOverride,
      })

      if (!result.ok) { setError(result.error || 'Failed to start stream'); return }

      // Start MediaRecorder → pipe to Electron → ffmpeg workers
      const activeStream = screenStream.current || camStream.current
      if (!activeStream) { setError('No video stream available.'); return }

      const mimeType = ['video/webm;codecs=h264', 'video/webm;codecs=vp8', 'video/webm']
        .find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm'

      recorder.current = new MediaRecorder(activeStream, {
        mimeType,
        videoBitsPerSecond: parseInt(QUALITY_PRESETS[quality].videoBitrate) * 1000,
      })

      recorder.current.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          const buf = await e.data.arrayBuffer()
          window.electronAPI.sendChunkAll(buf)
        }
      }

      recorder.current.start(250)  // 250ms chunks — low latency

      const streams = {}
      result.started.forEach(id => { streams[id] = 'streaming' })
      result.failed.forEach(({ destId }) => { streams[destId] = 'error' })
      setActiveStreams(streams)

    } else {
      // Browser fallback (simulated)
      const streams = {}
      enabled.forEach(([id]) => { streams[id] = 'streaming' })
      setActiveStreams(streams)
    }

    setIsLive(true)
    setError(null)
  }, [camOn, destinations, secrets, quality, encoderOverride, startCamera])

  // ── End stream ───────────────────────────────────────────────
  const endStream = useCallback(async () => {
    try { recorder.current?.stop() } catch {}
    recorder.current = null

    if (IS_ELECTRON) {
      await window.electronAPI.stopStream()
    }

    stopCamera()
    screenStream.current?.getTracks().forEach(t => t.stop())
    screenStream.current = null
    setIsLive(false)
    setActiveStreams({})
    setElapsed(0)
  }, [stopCamera])

  const formatTime = (s) =>
    [Math.floor(s/3600), Math.floor((s%3600)/60), s%60]
      .map(n => String(n).padStart(2,'0')).join(':')

  return {
    videoRef,
    camOn, micOn, screenOn, facingMode, quality, isLive,
    activeStreams, elapsed, error, ffmpegLogs, ffmpegFound,
    encoderInfo, encoderOverride, setEncoderOverride,
    startCamera, stopCamera, toggleCamera, flipCamera,
    toggleMic, toggleScreen, goLive, endStream,
    setQuality, setError,
    formatTime,
    isElectron: IS_ELECTRON,
    QUALITY_PRESETS,
  }
}
