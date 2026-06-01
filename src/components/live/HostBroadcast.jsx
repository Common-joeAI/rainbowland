import React, { useRef, useEffect, useState, useCallback } from 'react'
import {
  ArrowLeft, Mic, MicOff, Camera, CameraOff, FlipHorizontal,
  Users, MessageCircle, Heart, Share2, X, Send, Sparkles
} from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { generateCaption } from '../../api/grok'

const MOCK_CHAT = [
  { id: 1, user: 'Nova ✨', avatar: '🌟', text: 'lets gooo queen!!!', ts: 5 },
  { id: 2, user: 'Zephyr',   avatar: '💙', text: '🌈🌈🌈',           ts: 8 },
  { id: 3, user: 'Marigold', avatar: '🌻', text: 'omg ur stunning',  ts: 12 },
  { id: 4, user: 'Celestia', avatar: '🌙', text: 'first time here — love the energy!!!', ts: 18 },
]

export default function HostBroadcast({ onExit }) {
  const { user } = useStore()
  const videoRef   = useRef(null)
  const streamRef  = useRef(null)
  const chatEndRef = useRef(null)

  const [camOn,    setCamOn]    = useState(false)
  const [micOn,    setMicOn]    = useState(false)
  const [facing,   setFacing]   = useState('user') // 'user' | 'environment'
  const [live,     setLive]     = useState(false)
  const [viewers,  setViewers]  = useState(0)
  const [likes,    setLikes]    = useState(0)
  const [chat,     setChat]     = useState([])
  const [chatMsg,  setChatMsg]  = useState('')
  const [title,    setTitle]    = useState('')
  const [aiTitle,  setAiTitle]  = useState(false)
  const [elapsed,  setElapsed]  = useState(0)
  const [showChat, setShowChat] = useState(true)
  const [error,    setError]    = useState(null)

  // ── Start camera ──────────────────────────────────────────────────────
  const startCamera = useCallback(async (facingMode = facing) => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: micOn,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
      setCamOn(true)
      setError(null)
    } catch (err) {
      setError('Camera access denied. Please allow camera in your browser settings.')
      setCamOn(false)
    }
  }, [facing, micOn])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setCamOn(false)
  }, [])

  const toggleCamera = () => camOn ? stopCamera() : startCamera()

  const toggleMic = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
    }
    setMicOn(m => !m)
  }, [])

  const flipCamera = useCallback(() => {
    const next = facing === 'user' ? 'environment' : 'user'
    setFacing(next)
    if (camOn) startCamera(next)
  }, [facing, camOn, startCamera])

  // ── Go live ───────────────────────────────────────────────────────────
  const goLive = async () => {
    if (!camOn) await startCamera()
    setLive(true)
    setViewers(0)
    setLikes(0)
    setChat(MOCK_CHAT.map(c => ({ ...c, id: Date.now() + c.id })))
  }

  const endStream = () => {
    stopCamera()
    setLive(false)
    setElapsed(0)
  }

  // ── Timer ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [live])

  // ── Simulate viewer + chat activity ───────────────────────────────────
  useEffect(() => {
    if (!live) return
    const joins = setInterval(() => {
      setViewers(v => v + Math.floor(Math.random() * 12))
    }, 3000)
    const chatSim = setInterval(() => {
      const msgs = [
        { user: 'Rainbow Ray 🌈', avatar: '🌈', text: 'this is everything 💜' },
        { user: 'Jade',           avatar: '💎', text: 'LOVEEE the energy!!!!' },
        { user: 'Orion',          avatar: '🌊', text: 'just joined — already obsessed' },
        { user: 'Starfish',       avatar: '⭐', text: '🏳️‍🌈🏳️‍🌈🏳️‍🌈' },
        { user: 'Axel 🔥',        avatar: '🔥', text: 'you look amazing' },
        { user: 'Nova ✨',         avatar: '✨', text: '❤️❤️❤️' },
      ]
      const m = msgs[Math.floor(Math.random() * msgs.length)]
      setChat(c => [...c.slice(-40), { ...m, id: Date.now(), ts: elapsed }])
    }, 4000)
    const likesSim = setInterval(() => {
      setLikes(l => l + Math.floor(Math.random() * 25))
    }, 2500)
    return () => { clearInterval(joins); clearInterval(chatSim); clearInterval(likesSim) }
  }, [live, elapsed])

  // Auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat])

  // AI title generator
  const handleAiTitle = async () => {
    setAiTitle(true)
    try {
      const res = await generateCaption(`${user.name} going live on Rainbow Land`, 'hype')
      setTitle(res.caption || 'Rainbow Land Live 🌈')
    } catch { }
    setAiTitle(false)
  }

  const sendChat = () => {
    if (!chatMsg.trim()) return
    setChat(c => [...c, { id: Date.now(), user: user.name, avatar: user.avatar, text: chatMsg.trim(), ts: elapsed }])
    setChatMsg('')
  }

  const formatTime = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  return (
    <div className="h-full flex flex-col bg-dark-900 relative overflow-hidden">
      {/* Camera preview — full background */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay playsInline muted
        style={{ transform: facing === 'user' ? 'scaleX(-1)' : 'none' }}
      />

      {/* Dark overlay when cam off */}
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
          <div className="flex items-center gap-3">
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

        {/* Flip camera */}
        <button onClick={flipCamera} className="glass p-2 rounded-full">
          <FlipHorizontal className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* ── PRE-LIVE SETUP ── */}
      {!live && (
        <div className="relative z-10 px-4 mt-4">
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
        </div>
      )}

      {/* ── LIVE CHAT (right side) ── */}
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

      {/* ── LIVE STATS (left side) ── */}
      {live && (
        <div className="absolute left-3 bottom-32 z-10 flex flex-col gap-2 items-center">
          <div className="flex flex-col items-center glass rounded-xl p-2">
            <Heart className="w-5 h-5 text-red-500 fill-red-500" />
            <span className="text-white text-xs font-bold mt-0.5">{likes.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* ── BOTTOM CONTROLS ── */}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-4 pb-6 pt-2">
        <div className="pride-strip rounded-full mb-4" />

        {live ? (
          /* Live controls */
          <div className="space-y-3">
            {/* Chat input */}
            <div className="flex gap-2">
              <input
                className="flex-1 bg-dark-600/80 backdrop-blur border border-white/15 rounded-full px-4 py-2.5 text-white text-sm outline-none placeholder-white/30"
                placeholder="Say something to your viewers..."
                value={chatMsg}
                onChange={e => setChatMsg(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendChat()}
              />
              <button onClick={sendChat} className="bg-rainbow-purple p-2.5 rounded-full">
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* Action row */}
            <div className="flex items-center justify-between">
              <div className="flex gap-3">
                <button onClick={toggleMic}
                  className={`glass p-3 rounded-full border ${micOn ? 'border-rainbow-green' : 'border-red-500/50'}`}>
                  {micOn ? <Mic className="w-5 h-5 text-rainbow-green" /> : <MicOff className="w-5 h-5 text-red-400" />}
                </button>
                <button onClick={toggleCamera}
                  className={`glass p-3 rounded-full border ${camOn ? 'border-rainbow-blue' : 'border-red-500/50'}`}>
                  {camOn ? <Camera className="w-5 h-5 text-rainbow-blue" /> : <CameraOff className="w-5 h-5 text-red-400" />}
                </button>
                <button onClick={() => setShowChat(s => !s)}
                  className={`glass p-3 rounded-full border ${showChat ? 'border-white/30' : 'border-white/10'}`}>
                  <MessageCircle className="w-5 h-5 text-white" />
                </button>
                <button className="glass p-3 rounded-full border border-white/10">
                  <Share2 className="w-5 h-5 text-white" />
                </button>
              </div>

              <button
                onClick={endStream}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-5 py-3 rounded-full font-bold text-white text-sm"
              >
                <X className="w-4 h-4" /> End
              </button>
            </div>
          </div>
        ) : (
          /* Pre-live controls */
          <div className="space-y-3">
            <div className="flex justify-center gap-4">
              <button onClick={toggleCamera}
                className={`glass p-4 rounded-full border-2 transition-all ${camOn ? 'border-rainbow-blue' : 'border-white/20'}`}>
                {camOn ? <Camera className="w-6 h-6 text-rainbow-blue" /> : <CameraOff className="w-6 h-6 text-white/50" />}
              </button>
              <button onClick={toggleMic}
                className={`glass p-4 rounded-full border-2 transition-all ${micOn ? 'border-rainbow-green' : 'border-white/20'}`}>
                {micOn ? <Mic className="w-6 h-6 text-rainbow-green" /> : <MicOff className="w-6 h-6 text-white/50" />}
              </button>
              <button onClick={flipCamera} className="glass p-4 rounded-full border-2 border-white/20">
                <FlipHorizontal className="w-6 h-6 text-white/50" />
              </button>
            </div>

            <button
              onClick={goLive}
              className="w-full py-4 rounded-2xl font-black text-xl text-white
                bg-gradient-to-r from-red-600 via-rainbow-pink to-rainbow-purple
                shadow-xl shadow-red-600/30 active:scale-95 transition-transform"
            >
              🔴 Go Live
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
