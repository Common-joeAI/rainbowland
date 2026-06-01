import React, { useState, useRef, useEffect } from 'react'
import clsx from 'clsx'
import {
  Mic, MicOff, Camera, CameraOff, Monitor, MonitorOff,
  FlipHorizontal, Settings, Radio, Square, Send,
  Eye, Heart, Clock, Sparkles, ChevronDown, ChevronUp,
  CheckCircle, XCircle, AlertCircle, Loader,
  Twitch, Youtube, Facebook
} from 'lucide-react'
import { useStream, QUALITY_PRESETS } from '../hooks/useStream'
import { useStore } from '../hooks/useStore'
import { generateCaption } from '../api/grok'
import DestinationManager from '../components/studio/DestinationManager'

// ── Pride overlays ────────────────────────────────────────────
const OVERLAYS = [
  { id: 'none',      label: 'None',         style: '' },
  { id: 'rainbow',   label: '🌈 Rainbow',   style: 'linear-gradient(90deg,#FF3366,#FF7A00,#FFD700,#00E676,#00B4FF,#9B59FF)' },
  { id: 'trans',     label: '⚧️ Trans',     style: 'linear-gradient(90deg,#55CDFC,#F7A8B8,#FFFFFF,#F7A8B8,#55CDFC)' },
  { id: 'bi',        label: '💜 Bi',        style: 'linear-gradient(90deg,#D60270,#D60270,#9B4F96,#0038A8,#0038A8)' },
  { id: 'nonbinary', label: '🟡 Non-Binary', style: 'linear-gradient(90deg,#FCF434,#FFFFFF,#9C59D1,#2C2C2C)' },
  { id: 'lesbian',   label: '🧡 Lesbian',   style: 'linear-gradient(90deg,#D52D00,#EF7627,#FF9A56,#FFFFFF,#D162A4,#B55690,#A50062)' },
]

const DEST_ICONS = {
  rainbowland: '🌈',
  tiktok:      '🎵',
  youtube:     '▶️',
  facebook:    '📘',
  twitch:      '🎮',
  custom:      '📡',
}

const DEST_COLORS = {
  rainbowland: '#9B59FF',
  tiktok:      '#69C9D0',
  youtube:     '#FF0000',
  facebook:    '#1877F2',
  twitch:      '#9146FF',
  custom:      '#FF7A00',
}

// Simulated live chat
const CHAT_POOL = [
  { user: 'Nova ✨',      color: '#9B59FF', text: 'omg youre live!!!!' },
  { user: 'Jade 💎',      color: '#00E676', text: 'the camera looks amazing' },
  { user: 'Zephyr 🌊',   color: '#00B4FF', text: '🌈🌈🌈' },
  { user: 'Marigold 🌻', color: '#FFD700', text: 'QUEEN BEHAVIOR' },
  { user: 'Orion 🌌',    color: '#FF69B4', text: 'first time watching — already obsessed' },
  { user: 'Axel 🔥',     color: '#FF3366', text: 'the pride overlay is everything' },
  { user: 'Celestia 🌙', color: '#9B59FF', text: '💜💜💜' },
  { user: 'Ray 🌈',      color: '#FF7A00', text: 'going live on all platforms at once wtf' },
  { user: 'Prism ⭐',    color: '#FFD700', text: 'this app is so good' },
]

export default function StudioPage() {
  const {
    videoRef, camOn, micOn, screenOn, quality, isLive,
    activeStreams, elapsed, error, ffmpegFound, isElectron,
    toggleCamera, flipCamera, toggleMic, toggleScreen,
    goLive, endStream, setQuality, setError, formatTime, QUALITY_PRESETS,
  } = useStream()

  const { user, destinations, streamTitle, setStreamTitle } = useStore()

  const [overlay,       setOverlay]       = useState('none')
  const [showSettings,  setShowSettings]  = useState(false)
  const [showDest,      setShowDest]      = useState(false)
  const [chat,          setChat]          = useState([])
  const [chatInput,     setChatInput]     = useState('')
  const [viewers,       setViewers]       = useState(0)
  const [likes,         setLikes]         = useState(0)
  const [aiLoading,     setAiLoading]     = useState(false)
  const [hearts,        setHearts]        = useState([])
  const chatEndRef = useRef(null)

  const enabledCount = Object.values(destinations).filter(d => d.enabled).length
  const selectedOverlay = OVERLAYS.find(o => o.id === overlay)

  // ── Simulate live activity ────────────────────────────────────
  useEffect(() => {
    if (!isLive) return
    const viewerSim = setInterval(() => setViewers(v => v + Math.floor(Math.random() * 15)), 4000)
    const chatSim   = setInterval(() => {
      const m = CHAT_POOL[Math.floor(Math.random() * CHAT_POOL.length)]
      setChat(c => [...c.slice(-60), { ...m, id: Date.now() }])
    }, 3000)
    const likeSim   = setInterval(() => {
      setLikes(l => l + Math.floor(Math.random() * 20))
      setHearts(h => [...h, { id: Date.now(), x: 20 + Math.random() * 60 }])
      setTimeout(() => setHearts(h => h.slice(1)), 2500)
    }, 2500)
    return () => { clearInterval(viewerSim); clearInterval(chatSim); clearInterval(likeSim) }
  }, [isLive])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat])

  // ── AI title generator ────────────────────────────────────────
  const handleAiTitle = async () => {
    setAiLoading(true)
    try {
      const res = await generateCaption(`${user.name} live stream on Rainbow Land`, 'hype')
      setStreamTitle(res.caption || 'Rainbow Land Live 🌈')
    } catch { }
    setAiLoading(false)
  }

  const sendChat = () => {
    if (!chatInput.trim()) return
    setChat(c => [...c, { id: Date.now(), user: user.name, color: '#9B59FF', text: chatInput.trim() }])
    setChatInput('')
  }

  // ── Destination status badge ──────────────────────────────────
  const DestBadge = ({ id }) => {
    const status = activeStreams[id]
    if (!status) return null
    return (
      <span className={clsx(
        'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
        status === 'streaming' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
      )}>
        {status === 'streaming' ? '● LIVE' : '✕ ERR'}
      </span>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-dark-900 overflow-hidden">

      {/* ── Title bar (custom, Electron only) ── */}
      {isElectron && (
        <div className="flex-shrink-0 h-8 bg-dark-900 flex items-center justify-between px-4 select-none"
          style={{ WebkitAppRegion: 'drag' }}>
          <div className="flex items-center gap-2">
            <span className="rainbow-text font-black text-sm">🌈 Rainbow Land Studio</span>
          </div>
          <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' }}>
            <button onClick={() => window.electronAPI.minimize()} className="w-3 h-3 rounded-full bg-yellow-400 hover:bg-yellow-300 transition-colors" />
            <button onClick={() => window.electronAPI.maximize()} className="w-3 h-3 rounded-full bg-green-400 hover:bg-green-300 transition-colors" />
            <button onClick={() => window.electronAPI.close()}    className="w-3 h-3 rounded-full bg-red-400 hover:bg-red-300 transition-colors" />
          </div>
        </div>
      )}

      {/* ── Main layout: camera | controls | chat ── */}
      <div className="flex flex-1 overflow-hidden gap-0">

        {/* ═══ LEFT: Camera preview ═══ */}
        <div className="relative flex-1 bg-dark-800 flex flex-col">

          {/* Video element */}
          <div className="relative flex-1 overflow-hidden">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              autoPlay playsInline muted
              style={{ transform: 'scaleX(-1)' }}
            />

            {/* No cam placeholder */}
            {!camOn && (
              <div className="absolute inset-0 flex items-center justify-center bg-dark-900">
                <div className="text-center">
                  <div className="text-6xl mb-3">{user.avatar}</div>
                  <p className="text-white/40 text-sm">Camera is off</p>
                  {error && <p className="text-red-400 text-xs mt-2 max-w-xs">{error}</p>}
                </div>
              </div>
            )}

            {/* Pride overlay strip */}
            {overlay !== 'none' && selectedOverlay?.style && (
              <>
                {/* Top bar */}
                <div className="absolute top-0 left-0 right-0 h-2 opacity-80"
                  style={{ background: selectedOverlay.style }} />
                {/* Bottom bar */}
                <div className="absolute bottom-0 left-0 right-0 h-2 opacity-80"
                  style={{ background: selectedOverlay.style }} />
              </>
            )}

            {/* Floating hearts */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {hearts.map(h => (
                <div key={h.id} className="absolute text-2xl"
                  style={{ bottom: '20%', left: `${h.x}%`, animation: 'floatUp 2.5s ease-out forwards' }}>
                  ❤️
                </div>
              ))}
            </div>

            {/* LIVE badge + stats overlay */}
            {isLive && (
              <div className="absolute top-4 left-4 flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-red-600/90 backdrop-blur px-3 py-1.5 rounded-full">
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  <span className="text-white text-xs font-black">LIVE</span>
                  <span className="text-white/80 text-xs ml-1">{formatTime(elapsed)}</span>
                </div>
                <div className="glass px-2.5 py-1.5 rounded-full flex items-center gap-1 backdrop-blur">
                  <Eye className="w-3 h-3 text-green-400" />
                  <span className="text-white text-xs font-bold">{viewers.toLocaleString()}</span>
                </div>
                <div className="glass px-2.5 py-1.5 rounded-full flex items-center gap-1 backdrop-blur">
                  <Heart className="w-3 h-3 text-red-400" />
                  <span className="text-white text-xs font-bold">{likes.toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Active destination badges */}
            {isLive && (
              <div className="absolute top-4 right-4 flex flex-col gap-1">
                {Object.entries(activeStreams).map(([id, status]) => (
                  <div key={id} className="flex items-center gap-1.5 glass px-2.5 py-1 rounded-full backdrop-blur">
                    <span style={{ color: DEST_COLORS[id] || '#fff' }} className="text-sm">
                      {DEST_ICONS[id]}
                    </span>
                    <span className={clsx('text-[10px] font-bold',
                      status === 'streaming' ? 'text-green-400' : 'text-red-400')}>
                      {status === 'streaming' ? 'LIVE' : 'ERR'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Stream title overlay */}
            {streamTitle && (
              <div className="absolute bottom-4 left-4 right-4">
                <div className="glass px-3 py-2 rounded-xl inline-block max-w-sm">
                  <p className="text-white font-bold text-sm truncate">{streamTitle}</p>
                  <p className="text-white/40 text-xs">{user.handle}</p>
                </div>
              </div>
            )}
          </div>

          {/* ── Camera toolbar ── */}
          <div className="flex-shrink-0 bg-dark-800 border-t border-white/5 px-4 py-3 flex items-center gap-3">
            {/* Cam toggle */}
            <button onClick={toggleCamera}
              className={clsx('p-2.5 rounded-xl border transition-all',
                camOn ? 'border-rainbow-blue/50 bg-rainbow-blue/10 text-rainbow-blue'
                       : 'border-white/10 glass text-white/40')}>
              {camOn ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
            </button>

            {/* Mic toggle */}
            <button onClick={toggleMic}
              className={clsx('p-2.5 rounded-xl border transition-all',
                micOn ? 'border-rainbow-green/50 bg-rainbow-green/10 text-rainbow-green'
                       : 'border-red-500/30 bg-red-500/10 text-red-400')}>
              {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </button>

            {/* Screen share */}
            <button onClick={toggleScreen}
              className={clsx('p-2.5 rounded-xl border transition-all',
                screenOn ? 'border-rainbow-yellow/50 bg-rainbow-yellow/10 text-rainbow-yellow'
                          : 'border-white/10 glass text-white/40')}>
              {screenOn ? <Monitor className="w-5 h-5" /> : <MonitorOff className="w-5 h-5" />}
            </button>

            {/* Flip camera */}
            <button onClick={flipCamera}
              className="p-2.5 rounded-xl border border-white/10 glass text-white/40 hover:text-white transition-colors">
              <FlipHorizontal className="w-5 h-5" />
            </button>

            <div className="flex-1" />

            {/* Pride overlay selector */}
            <select
              value={overlay}
              onChange={e => setOverlay(e.target.value)}
              className="bg-dark-600 border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none"
            >
              {OVERLAYS.map(o => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>

            {/* Quality selector */}
            <select
              value={quality}
              onChange={e => setQuality(e.target.value)}
              className="bg-dark-600 border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none"
            >
              {Object.entries(QUALITY_PRESETS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ═══ RIGHT: Controls + Chat ═══ */}
        <div className="w-80 flex-shrink-0 flex flex-col bg-dark-800 border-l border-white/5">

          {/* Stream title */}
          <div className="flex-shrink-0 p-4 border-b border-white/5">
            <p className="text-white/60 text-xs font-bold uppercase tracking-wider mb-2">Stream Title</p>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-dark-700 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-white/30 outline-none focus:border-rainbow-purple/50"
                placeholder="What's your stream about?"
                value={streamTitle}
                onChange={e => setStreamTitle(e.target.value)}
              />
              <button
                onClick={handleAiTitle}
                disabled={aiLoading}
                className="px-3 py-2 rounded-xl glass border border-rainbow-purple/30 text-rainbow-purple text-xs flex items-center gap-1"
              >
                <Sparkles className={clsx('w-3.5 h-3.5', aiLoading && 'animate-spin')} />
                AI
              </button>
            </div>
          </div>

          {/* Destinations */}
          <div className="flex-shrink-0 border-b border-white/5">
            <button
              onClick={() => setShowDest(s => !s)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-rainbow-purple" />
                <span className="text-white font-bold text-sm">Destinations</span>
                <span className="text-xs text-rainbow-purple glass px-2 py-0.5 rounded-full border border-rainbow-purple/30">
                  {enabledCount} active
                </span>
              </div>
              {showDest ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
            </button>
            {showDest && <DestinationManager />}
          </div>

          {/* ffmpeg status */}
          {isElectron && (
            <div className="flex-shrink-0 px-4 py-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                {ffmpegFound === null ? (
                  <Loader className="w-3.5 h-3.5 text-white/30 animate-spin" />
                ) : ffmpegFound ? (
                  <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-yellow-400" />
                )}
                <span className="text-xs text-white/40">
                  {ffmpegFound === null ? 'Checking ffmpeg...'
                    : ffmpegFound ? 'ffmpeg ready'
                    : 'ffmpeg not found — install to stream'}
                </span>
              </div>
            </div>
          )}

          {/* Live chat */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
            {!isLive && (
              <div className="flex items-center justify-center h-full">
                <p className="text-white/20 text-xs text-center">Chat will appear here when you go live</p>
              </div>
            )}
            {chat.map(m => (
              <div key={m.id} className="flex items-start gap-2">
                <div className="flex-1 glass rounded-xl px-2.5 py-1.5">
                  <span className="text-xs font-bold mr-1.5" style={{ color: m.color }}>{m.user}</span>
                  <span className="text-white/70 text-xs">{m.text}</span>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Chat input */}
          {isLive && (
            <div className="flex-shrink-0 p-3 border-t border-white/5">
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-dark-700 border border-white/10 rounded-xl px-3 py-2 text-white text-xs placeholder-white/30 outline-none focus:border-rainbow-purple/50"
                  placeholder="Reply to chat..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendChat()}
                />
                <button onClick={sendChat} className="bg-rainbow-purple p-2 rounded-xl">
                  <Send className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          )}

          {/* ── GO LIVE / END button ── */}
          <div className="flex-shrink-0 p-4 border-t border-white/5">
            {!isLive ? (
              <button
                onClick={goLive}
                disabled={enabledCount === 0}
                className={clsx(
                  'w-full py-4 rounded-2xl font-black text-lg text-white transition-all',
                  enabledCount > 0
                    ? 'bg-gradient-to-r from-red-600 via-rainbow-pink to-rainbow-purple shadow-xl shadow-red-600/25 active:scale-95'
                    : 'bg-dark-600 text-white/20 cursor-not-allowed'
                )}
              >
                {enabledCount === 0 ? 'Add a destination first' : `🔴 Go Live to ${enabledCount} platform${enabledCount > 1 ? 's' : ''}`}
              </button>
            ) : (
              <button
                onClick={endStream}
                className="w-full py-4 rounded-2xl font-black text-lg text-white bg-red-700 hover:bg-red-600 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Square className="w-5 h-5 fill-white" />
                End Stream
              </button>
            )}

            {/* Destination mini-status row */}
            {isLive && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {Object.entries(activeStreams).map(([id, status]) => (
                  <div key={id}
                    className={clsx('flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold',
                      status === 'streaming' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400')}>
                    <span>{DEST_ICONS[id]}</span>
                    <span>{destinations[id]?.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes floatUp {
          0%   { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-180px) scale(1.3); opacity: 0; }
        }
        .glass {
          background: rgba(255,255,255,0.05);
          backdrop-filter: blur(8px);
        }
      `}</style>
    </div>
  )
}
