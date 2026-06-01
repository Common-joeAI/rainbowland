import React, { useRef, useEffect, useState, useCallback } from 'react'
import {
  ArrowLeft, Mic, MicOff, Camera, CameraOff, FlipHorizontal,
  Users, MessageCircle, Heart, Share2, X, Send, Sparkles, Wifi, WifiOff
} from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { generateCaption } from '../../api/grok'
import { HostStreamer } from '../../api/liveStream'

const MOCK_CHAT = [
  { id: 1, user: 'Nova ✨',    avatar: '🌟', text: 'lets gooo queen!!!' },
  { id: 2, user: 'Zephyr',    avatar: '💙', text: '🌈🌈🌈' },
  { id: 3, user: 'Marigold',  avatar: '🌻', text: 'omg ur stunning' },
  { id: 4, user: 'Celestia',  avatar: '🌙', text: 'first time here — love the energy!!!' },
]

const SIM_CHAT = [
  { user: 'Rainbow Ray 🌈', avatar: '🌈', text: 'this is everything 💜' },
  { user: 'Jade 💎',        avatar: '💎', text: 'LOVEEE the energy!!!!' },
  { user: 'Orion 🌊',       avatar: '🌊', text: 'just joined — already obsessed' },
  { user: 'Starfish ⭐',    avatar: '⭐', text: '🏳️‍🌈🏳️‍🌈🏳️‍🌈' },
  { user: 'Axel 🔥',        avatar: '🔥', text: 'you look amazing' },
  { user: 'Nova ✨',         avatar: '✨', text: '❤️❤️❤️' },
]

function generateRoomId() {
  return Math.random().toString(36).slice(2, 10)
}

export default function HostBroadcast({ onExit }) {
  const { user } = useStore()
  const videoRef   = useRef(null)
  const streamRef  = useRef(null)
  const streamerRef = useRef(null)
  const chatEndRef = useRef(null)

  const [camOn,      setCamOn]      = useState(false)
  const [micOn,      setMicOn]      = useState(true)
  const [facing,     setFacing]     = useState('user')
  const [live,       setLive]       = useState(false)
  const [streamStatus, setStreamStatus] = useState('idle') // idle|connecting|live|error|ended
  const [viewers,    setViewers]    = useState(0)
  const [likes,      setLikes]      = useState(0)
  const [chat,       setChat]       = useState([])
  const [chatMsg,    setChatMsg]    = useState('')
  const [title,      setTitle]      = useState('')
  const [aiTitle,    setAiTitle]    = useState(false)
  const [elapsed,    setElapsed]    = useState(0)
  const [showChat,   setShowChat]   = useState(true)
  const [error,      setError]      = useState(null)
  const [roomId]                    = useState(() => generateRoomId())
  const [streamUrl,  setStreamUrl]  = useState(null)

  // ── Camera ───────────────────────────────────────────────────
  const startCamera = useCallback(async (facingMode = facing) => {
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play() }
      setCamOn(true); setMicOn(true); setError(null)
    } catch (err) {
      setError('Camera/mic access denied. Please allow in browser settings.')
      setCamOn(false)
    }
  }, [facing])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCamOn(false)
  }, [])

  const toggleCamera = () => camOn ? stopCamera() : startCamera()

  const toggleMic = useCallback(() => {
    streamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
    setMicOn(m => !m)
  }, [])

  const flipCamera = useCallback(() => {
    const next = facing === 'user' ? 'environment' : 'user'
    setFacing(next)
    if (camOn) startCamera(next)
  }, [facing, camOn, startCamera])

  // ── Go Live ──────────────────────────────────────────────────
  const goLive = async () => {
    if (!camOn) await startCamera()

    const mediaStream = streamRef.current
    if (!mediaStream) { setError('Could not access camera'); return }

    // Initialise mock chat immediately for UX
    setChat(MOCK_CHAT.map(c => ({ ...c, id: Date.now() + c.id })))
    setLive(true)

    // Real WebSocket streamer
    const streamer = new HostStreamer({
      roomId,
      title: title || 'Rainbow Land Live 🌈',
      onStatusChange: (s) => {
        setStreamStatus(s)
        if (s === 'error') setError('Stream relay unreachable — broadcasting in demo mode')
      },
      onViewerCount: (count) => setViewers(count),
      onChatMessage: (msg)   => setChat(c => [...c.slice(-50), { ...msg, id: Date.now() }]),
      onError: (msg) => setError(msg),
    })
    streamerRef.current = streamer

    // Set the shareable HLS URL
    setStreamUrl(`https://live.rainbowland.cc/hls/${roomId}/index.m3u8`)

    await streamer.start(mediaStream)
  }

  const endStream = () => {
    streamerRef.current?.stop()
    streamerRef.current = null
    stopCamera()
    setLive(false)
    setStreamStatus('idle')
    setElapsed(0)
    setViewers(0)
  }

  // ── Timer ────────────────────────────────────────────────────
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [live])

  // ── Simulate activity if WS not connected (demo fallback) ────
  useEffect(() => {
    if (!live) return
    const joins = setInterval(() => {
      if (streamStatus !== 'live') setViewers(v => v + Math.floor(Math.random() * 8))
    }, 3500)
    const chatSim = setInterval(() => {
      if (streamStatus !== 'live') {
        const m = SIM_CHAT[Math.floor(Math.random() * SIM_CHAT.length)]
        setChat(c => [...c.slice(-40), { ...m, id: Date.now() }])
      }
    }, 4500)
    const likesSim = setInterval(() => setLikes(l => l + Math.floor(Math.random() * 20)), 2500)
    return () => { clearInterval(joins); clearInterval(chatSim); clearInterval(likesSim) }
  }, [live, streamStatus])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat])

  // ── AI title ─────────────────────────────────────────────────
  const handleAiTitle = async () => {
    setAiTitle(true)
    try {
      const res = await generateCaption(`${user.name} going live on Rainbow Land`, 'hype')
      setTitle(res.caption || 'Rainbow Land Live 🌈')
    } catch {}
    setAiTitle(false)
  }

  const sendChat = () => {
    if (!chatMsg.trim()) return
    const msg = { id: Date.now(), user: user.name, avatar: user.avatar || '🌈', text: chatMsg.trim() }
    setChat(c => [...c, msg])
    streamerRef.current?.sendChat(chatMsg.trim(), user.name)
    setChatMsg('')
  }

  // ── Share ─────────────────────────────────────────────────────
  const shareStream = async () => {
    const url = `https://rainbowland.cc/live/${roomId}`
    if (navigator.share) {
      await navigator.share({ title: title || 'Watch me live on Rainbow Land 🌈', url })
    } else {
      await navigator.clipboard.writeText(url)
      alert('Stream link copied!')
    }
  }

  const formatTime = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  const statusColor = {
    connecting: 'text-yellow-400',
    live:       'text-green-400',
    error:      'text-red-400',
    ended:      'text-white/40',
  }[streamStatus] || 'text-white/40'

  return (
    <div className="h-full flex flex-col bg-dark-900 relative overflow-hidden">

      {/* Camera preview */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay playsInline muted
        style={{ transform: facing === 'user' ? 'scaleX(-1)' : 'none' }}
      />

      {/* Cam-off overlay */}
      {!camOn && (
        <div className="absolute inset-0 bg-dark-900 flex items-center justify-center">
          <div className="text-center">
            <Camera className="w-16 h-16 text-white/20 mx-auto mb-3" />
            <p className="text-white/40 text-sm">Camera is off</p>
            {error && <p className="text-red-400 text-xs mt-2 px-8">{error}</p>}
          </div>
        </div>
      )}

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />

      {/* ── TOP BAR ── */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-4 pb-2">
        <button onClick={onExit} className="glass p-2 rounded-full">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>

        {live ? (
          <div className="flex items-center gap-2">
            {/* Connection status icon */}
            {streamStatus === 'live'
              ? <Wifi className={`w-4 h-4 ${statusColor}`} />
              : <WifiOff className={`w-4 h-4 ${statusColor}`} />
            }
            {/* LIVE badge */}
            <div className="flex items-center gap-1.5 bg-red-600 px-3 py-1 rounded-full">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              <span className="text-white text-xs font-black">LIVE</span>
              <span className="text-white/80 text-xs">{formatTime(elapsed)}</span>
            </div>
            {/* Viewers */}
            <div className="glass px-3 py-1 rounded-full flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-rainbow-green" />
              <span className="text-white text-xs font-bold">{viewers.toLocaleString()}</span>
            </div>
          </div>
        ) : (
          <span className="rainbow-text font-black text-lg">Rainbow Land</span>
        )}

        <button onClick={flipCamera} className="glass p-2 rounded-full">
          <FlipHorizontal className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* ── PRE-LIVE SETUP ── */}
      {!live && (
        <div className="relative z-10 px-4 mt-4 space-y-3">
          <div className="glass rounded-2xl p-4 space-y-3">
            <p className="text-white font-bold text-sm">Stream title</p>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-dark-700 border border-white/15 rounded-xl px-3 py-2 text-white text-sm outline-none placeholder-white/30 focus:border-rainbow-purple/60"
                placeholder="What's your stream about?"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
              <button
                onClick={handleAiTitle}
                disabled={aiTitle}
                className="glass px-3 py-2 rounded-xl border border-rainbow-purple/40 text-rainbow-purple text-xs flex items-center gap-1 flex-shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {aiTitle ? '...' : 'AI'}
              </button>
            </div>
          </div>

          {/* Room ID / share preview */}
          <div className="glass rounded-xl px-3 py-2 flex items-center gap-2">
            <span className="text-white/40 text-xs">Room ID:</span>
            <span className="text-rainbow-purple text-xs font-mono font-bold">{roomId}</span>
          </div>
        </div>
      )}

      {/* ── LIVE CHAT ── */}
      {live && showChat && (
        <div className="absolute right-2 bottom-32 z-10 w-56 max-h-64 flex flex-col">
          <div className="flex-1 overflow-y-auto space-y-2 flex flex-col justify-end">
            {chat.slice(-12).map(c => (
              <div key={c.id} className="flex items-start gap-1.5 animate-fade-in">
                <span className="text-sm flex-shrink-0">{c.avatar}</span>
                <div className="glass rounded-xl px-2 py-1 max-w-[180px]">
                  <span className="rainbow-text text-[10px] font-bold">{c.user} </span>
                  <span className="text-white/80 text-xs">{c.text}</span>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        </div>
      )}

      {/* ── LIVE STATS ── */}
      {live && (
        <div className="absolute left-3 bottom-40 z-10 flex flex-col gap-2 items-center">
          <div className="flex flex-col items-center glass rounded-xl p-2">
            <Heart className="w-5 h-5 text-red-500 fill-red-500" />
            <span className="text-white text-xs font-bold mt-0.5">{likes.toLocaleString()}</span>
          </div>
          <button onClick={() => setShowChat(s => !s)} className="flex flex-col items-center glass rounded-xl p-2">
            <MessageCircle className={`w-5 h-5 ${showChat ? 'text-rainbow-blue' : 'text-white/40'}`} />
          </button>
          <button onClick={shareStream} className="flex flex-col items-center glass rounded-xl p-2">
            <Share2 className="w-5 h-5 text-white" />
          </button>
        </div>
      )}

      {/* ── STREAM ERROR BANNER ── */}
      {error && live && (
        <div className="absolute top-16 left-4 right-4 z-10">
          <div className="bg-orange-900/80 border border-orange-500/40 rounded-xl px-3 py-2 flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-orange-400 flex-shrink-0" />
            <p className="text-orange-200 text-xs flex-1">{error}</p>
            <button onClick={() => setError(null)}><X className="w-3 h-3 text-white/40" /></button>
          </div>
        </div>
      )}

      {/* ── BOTTOM CONTROLS ── */}
      <div className="absolute bottom-0 left-0 right-0 z-10">

        {/* Chat input when live */}
        {live && (
          <div className="px-4 pb-3 flex gap-2">
            <div className="w-8 h-8 rounded-full bg-dark-600 flex items-center justify-center text-sm flex-shrink-0">
              {user.avatar || '🌈'}
            </div>
            <input
              className="flex-1 bg-dark-600/90 backdrop-blur border border-white/15 rounded-full px-4 py-2 text-white text-sm placeholder-white/30 outline-none"
              placeholder="Say something..."
              value={chatMsg}
              onChange={e => setChatMsg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendChat()}
            />
            <button onClick={sendChat} className="glass p-2 rounded-full border border-rainbow-purple/40">
              <Send className="w-4 h-4 text-rainbow-purple" />
            </button>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-around px-6 pb-6 pt-2">
          {/* Mic */}
          <button
            onClick={toggleMic}
            className={`flex flex-col items-center gap-1 p-3 rounded-2xl ${micOn ? 'glass' : 'bg-red-600/30'}`}
          >
            {micOn ? <Mic className="w-6 h-6 text-white" /> : <MicOff className="w-6 h-6 text-red-400" />}
            <span className="text-white/60 text-[10px]">{micOn ? 'Mute' : 'Unmute'}</span>
          </button>

          {/* Go Live / End */}
          {!live ? (
            <button
              onClick={goLive}
              className="flex flex-col items-center gap-1 px-8 py-3 rounded-2xl font-black text-base text-white
                bg-gradient-to-r from-rainbow-red via-rainbow-pink to-rainbow-purple
                shadow-lg shadow-rainbow-pink/30 active:scale-95 transition-transform"
            >
              <span>Go Live</span>
            </button>
          ) : (
            <button
              onClick={endStream}
              className="flex flex-col items-center gap-1 px-8 py-3 rounded-2xl font-black text-base text-white
                bg-red-600 shadow-lg active:scale-95 transition-transform"
            >
              <span>End</span>
            </button>
          )}

          {/* Camera */}
          <button
            onClick={toggleCamera}
            className={`flex flex-col items-center gap-1 p-3 rounded-2xl ${camOn ? 'glass' : 'bg-red-600/30'}`}
          >
            {camOn ? <Camera className="w-6 h-6 text-white" /> : <CameraOff className="w-6 h-6 text-red-400" />}
            <span className="text-white/60 text-[10px]">{camOn ? 'Cam' : 'Off'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
