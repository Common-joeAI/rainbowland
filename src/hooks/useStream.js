/**
 * useStream — manages camera, mic, screen share, and multi-RTMP broadcasting
 * Works in both browser (mock) and Electron (real ffmpeg) modes.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { useStore } from './useStore'

const IS_ELECTRON = typeof window !== 'undefined' && !!window.electronAPI

// ── Quality presets ───────────────────────────────────────────
export const QUALITY_PRESETS = {
  low:    { label: '480p',  width: 854,  height: 480,  fps: 24, videoBitrate: '1000k', audioBitrate: '96k'  },
  medium: { label: '720p',  width: 1280, height: 720,  fps: 30, videoBitrate: '2500k', audioBitrate: '128k' },
  high:   { label: '1080p', width: 1920, height: 1080, fps: 30, videoBitrate: '4500k', audioBitrate: '160k' },
}

export function useStream() {
  const { user, destinations, secrets } = useStore()

  const videoRef      = useRef(null)
  const cameraStream  = useRef(null)
  const screenStream  = useRef(null)
  const mediaRecorder = useRef(null)
  const canvasRef     = useRef(null)
  const canvasCtx     = useRef(null)
  const animFrame     = useRef(null)

  const [camOn,        setCamOn]        = useState(false)
  const [micOn,        setMicOn]        = useState(true)
  const [screenOn,     setScreenOn]     = useState(false)
  const [facingMode,   setFacingMode]   = useState('user')
  const [quality,      setQuality]      = useState('medium')
  const [isLive,       setIsLive]       = useState(false)
  const [activeStreams, setActiveStreams] = useState({})  // destId → 'streaming'|'error'
  const [elapsed,      setElapsed]      = useState(0)
  const [error,        setError]        = useState(null)
  const [ffmpegLogs,   setFfmpegLogs]   = useState([])
  const [ffmpegFound,  setFfmpegFound]  = useState(null)

  // ── Check ffmpeg on mount ────────────────────────────────────
  useEffect(() => {
    if (!IS_ELECTRON) return
    window.electronAPI.invoke?.('rtmp:check-ffmpeg').then?.(r => setFfmpegFound(r?.found))
  }, [])

  // ── Electron IPC logs ────────────────────────────────────────
  useEffect(() => {
    if (!IS_ELECTRON) return
    const handler = (destId, line) => {
      setFfmpegLogs(l => [...l.slice(-100), { destId, line, ts: Date.now() }])
    }
    window.electronAPI.on('rtmp:log', handler)
    return () => window.electronAPI.off('rtmp:log', handler)
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
      if (cameraStream.current) {
        cameraStream.current.getTracks().forEach(t => t.stop())
      }
      const preset = QUALITY_PRESETS[quality]
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width:  { ideal: preset.width },
          height: { ideal: preset.height },
          frameRate: { ideal: preset.fps },
        },
        audio: micOn,
      })
      cameraStream.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
      setCamOn(true)
      setError(null)
    } catch (e) {
      setError(`Camera error: ${e.message}`)
      setCamOn(false)
    }
  }, [facingMode, micOn, quality])

  const stopCamera = useCallback(() => {
    cameraStream.current?.getTracks().forEach(t => t.stop())
    cameraStream.current = null
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
    cameraStream.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
    setMicOn(m => !m)
  }, [])

  // ── Screen Share ──────────────────────────────────────────────
  const toggleScreen = useCallback(async () => {
    if (screenOn) {
      screenStream.current?.getTracks().forEach(t => t.stop())
      screenStream.current = null
      // Restore camera to video element
      if (videoRef.current && cameraStream.current) {
        videoRef.current.srcObject = cameraStream.current
      }
      setScreenOn(false)
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        screenStream.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        setScreenOn(true)
        stream.getVideoTracks()[0].addEventListener('ended', () => {
          setScreenOn(false)
          if (videoRef.current && cameraStream.current) {
            videoRef.current.srcObject = cameraStream.current
          }
        })
      } catch (e) {
        setError(`Screen share error: ${e.message}`)
      }
    }
  }, [screenOn])

  // ── Go Live ────────────────────────────────────────────────────
  const goLive = useCallback(async () => {
    if (!camOn) await startCamera()

    const activeDestinations = Object.entries(destinations)
      .filter(([, d]) => d.enabled)

    if (activeDestinations.length === 0) {
      setError('Enable at least one streaming destination first.')
      return
    }

    setElapsed(0)
    setFfmpegLogs([])

    if (IS_ELECTRON) {
      // ── Electron: real ffmpeg multi-RTMP ──────────────────────
      const result = await window.electronAPI.invoke('rtmp:start', {
        destinations,
        secrets,
        quality: QUALITY_PRESETS[quality],
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      // Start MediaRecorder → pipe chunks to Electron → ffmpeg
      const activeStream = screenStream.current || cameraStream.current
      if (!activeStream) { setError('No video stream available.'); return }

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=h264')
        ? 'video/webm;codecs=h264'
        : 'video/webm'

      mediaRecorder.current = new MediaRecorder(activeStream, { mimeType, videoBitsPerSecond: 2500000 })
      mediaRecorder.current.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          const buf = await e.data.arrayBuffer()
          window.electronAPI.invoke('rtmp:chunk-all', { buffer: buf })
        }
      }
      mediaRecorder.current.start(250) // 250ms chunks

      const started = {}
      result.started.forEach(id => { started[id] = 'streaming' })
      result.failed.forEach(({ destId }) => { started[destId] = 'error' })
      setActiveStreams(started)
    } else {
      // ── Browser: simulate streaming (no ffmpeg) ──────────────
      const mockStreams = {}
      activeDestinations.forEach(([id]) => { mockStreams[id] = 'streaming' })
      setActiveStreams(mockStreams)
    }

    setIsLive(true)
    setError(null)
  }, [camOn, destinations, secrets, quality, startCamera])

  // ── End stream ────────────────────────────────────────────────
  const endStream = useCallback(async () => {
    mediaRecorder.current?.stop()
    mediaRecorder.current = null

    if (IS_ELECTRON) {
      await window.electronAPI.invoke('rtmp:stop')
    }

    stopCamera()
    screenStream.current?.getTracks().forEach(t => t.stop())
    screenStream.current = null
    setIsLive(false)
    setActiveStreams({})
    setElapsed(0)
    cancelAnimationFrame(animFrame.current)
  }, [stopCamera])

  const formatTime = (s) =>
    `${String(Math.floor(s / 3600)).padStart(2,'0')}:${String(Math.floor((s % 3600)/60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`

  return {
    // Refs
    videoRef,
    // State
    camOn, micOn, screenOn, facingMode, quality, isLive,
    activeStreams, elapsed, error, ffmpegLogs, ffmpegFound,
    // Actions
    startCamera, stopCamera, toggleCamera, flipCamera,
    toggleMic, toggleScreen, goLive, endStream,
    setQuality, setError,
    // Utils
    formatTime,
    isElectron: IS_ELECTRON,
    QUALITY_PRESETS,
  }
}
