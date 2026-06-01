import React, { useRef, useEffect, useState } from 'react'
import { ArrowLeft, Heart, MessageCircle, Share2, Eye, Send, Music2, ExternalLink } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { loudmanArtistUrl } from '../../api/loudman'
import { formatCount } from '../../api/mockData'
import clsx from 'clsx'

const LIVE_COLORS = [
  'text-rainbow-pink', 'text-rainbow-purple', 'text-rainbow-blue',
  'text-rainbow-green', 'text-rainbow-yellow', 'text-rainbow-orange',
]

const INITIAL_CHAT = [
  { id: 1, user: 'Rainbow Ray 🌈', color: LIVE_COLORS[0], text: 'omg HI 💜💜💜' },
  { id: 2, user: 'Jade 💎',        color: LIVE_COLORS[2], text: 'been waiting for this stream!!' },
  { id: 3, user: 'Orion 🌊',       color: LIVE_COLORS[3], text: '🏳️‍🌈🏳️‍🌈🏳️‍🌈' },
  { id: 4, user: 'Starfish ⭐',    color: LIVE_COLORS[1], text: 'first time watching — already love this' },
  { id: 5, user: 'Nova ✨',         color: LIVE_COLORS[4], text: 'the VIBES rn 🔥' },
]

const SIM_MESSAGES = [
  { user: 'Marigold 🌻',  color: LIVE_COLORS[0], text: 'queen behavior only' },
  { user: 'Axel 🔥',      color: LIVE_COLORS[3], text: 'chat is popping off' },
  { user: 'Zephyr 💙',    color: LIVE_COLORS[2], text: 'I came from TikTok and I\'m staying here lol' },
  { user: 'Celestia 🌙',  color: LIVE_COLORS[1], text: '💜💜💜' },
  { user: 'Prism 🌈',     color: LIVE_COLORS[5], text: 'this platform is everything' },
  { user: 'Jade 💎',      color: LIVE_COLORS[2], text: 'never leaving Rainbow Land' },
  { user: 'Ray 🌈',       color: LIVE_COLORS[0], text: 'YASSSS' },
  { user: 'Orion 🌊',     color: LIVE_COLORS[3], text: 'can you do a shoutout??' },
]

export default function ViewerStream({ room, onExit }) {
  const { user } = useStore()
  const chatEndRef = useRef(null)
  const [chat, setChat]         = useState(INITIAL_CHAT)
  const [input, setInput]       = useState('')
  const [viewers, setViewers]   = useState(room?.viewers || 1200)
  const [likes, setLikes]       = useState(0)
  const [liked, setLiked]       = useState(false)
  const [showChat, setShowChat] = useState(true)
  const [elapsed, setElapsed]   = useState(0)
  const [hearts, setHearts]     = useState([]) // floating hearts

  // Timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Simulate live activity
  useEffect(() => {
    const viewSim = setInterval(() => {
      setViewers(v => v + Math.floor(Math.random() * 8 - 2))
    }, 4000)
    const chatSim = setInterval(() => {
      const m = SIM_MESSAGES[Math.floor(Math.random() * SIM_MESSAGES.length)]
      setChat(c => [...c.slice(-50), { ...m, id: Date.now() }])
    }, 3500)
    const likeSim = setInterval(() => {
      setLikes(l => l + Math.floor(Math.random() * 15))
      // floating hearts
      const newHearts = Array.from({ length: Math.floor(Math.random() * 4) + 1 }, (_, i) => ({
        id: Date.now() + i,
        x: 20 + Math.random() * 40,
        emoji: ['❤️','🧡','💛','💚','💙','💜','🩷','🏳️‍🌈'][Math.floor(Math.random()*8)],
      }))
      setHearts(h => [...h.slice(-15), ...newHearts])
      setTimeout(() => setHearts(h => h.filter(hh => !newHearts.find(n => n.id === hh.id))), 2200)
    }, 2000)

    return () => { clearInterval(viewSim); clearInterval(chatSim); clearInterval(likeSim) }
  }, [])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat])

  const handleLike = () => {
    setLiked(l => !l)
    setLikes(l => liked ? l - 1 : l + 1)
    if (!liked) {
      const newHearts = Array.from({ length: 5 }, (_, i) => ({
        id: Date.now() + i,
        x: 30 + Math.random() * 40,
        emoji: ['❤️','💜','🏳️‍🌈','💖','🩷'][i],
      }))
      setHearts(h => [...h, ...newHearts])
      setTimeout(() => setHearts(h => h.filter(hh => !newHearts.find(n => n.id === hh.id))), 2200)
    }
  }

  const sendChat = () => {
    if (!input.trim()) return
    setChat(c => [...c, {
      id: Date.now(),
      user: user.name,
      color: LIVE_COLORS[0],
      text: input.trim(),
    }])
    setInput('')
  }

  const formatTime = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  return (
    <div className="h-full flex flex-col bg-dark-900 relative overflow-hidden">

      {/* Background — simulated stream */}
      <div className="absolute inset-0 bg-gradient-to-br from-dark-900 via-dark-800 to-dark-700">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center opacity-20">
            <div className="text-8xl mb-4">{room?.thumbnail || '🌈'}</div>
            <p className="text-white text-xl font-bold">{room?.name}</p>
          </div>
        </div>
        {/* Animated rainbow ring */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-64 h-64 rounded-full rainbow-border opacity-10 animate-pulse" />
        </div>
      </div>

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/50 pointer-events-none" />

      {/* Floating hearts */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
        {hearts.map(h => (
          <div
            key={h.id}
            className="absolute text-2xl animate-bounce"
            style={{
              bottom: '25%',
              left: `${h.x}%`,
              animation: 'floatUp 2.2s ease-out forwards',
            }}
          >
            {h.emoji}
          </div>
        ))}
      </div>

      {/* ── TOP BAR ── */}
      <div className="relative z-10 flex items-center gap-3 px-4 pt-4">
        <button onClick={onExit} className="glass p-2 rounded-full flex-shrink-0">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>

        {/* Creator info */}
        <div className="flex items-center gap-2 flex-1 glass rounded-full px-3 py-1.5">
          <div className="rainbow-border rounded-full p-0.5">
            <div className="w-7 h-7 rounded-full bg-dark-600 flex items-center justify-center text-base">
              {room?.thumbnail || '🌈'}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm truncate">{room?.name || 'Live Creator'}</p>
            <p className="text-white/50 text-xs">{room?.handle}</p>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-red-400 text-xs font-bold">LIVE</span>
          </div>
        </div>

        {/* Viewers */}
        <div className="glass px-2.5 py-1.5 rounded-full flex items-center gap-1 flex-shrink-0">
          <Eye className="w-3.5 h-3.5 text-rainbow-green" />
          <span className="text-white text-xs font-bold">{formatCount(viewers)}</span>
        </div>
      </div>

      {/* ── STREAM TIMER ── */}
      <div className="relative z-10 flex justify-center mt-2">
        <span className="text-white/40 text-xs">{formatTime(elapsed)}</span>
      </div>

      {/* ── CHAT (bottom left) ── */}
      {showChat && (
        <div className="absolute left-3 right-16 bottom-28 z-10 max-h-56 flex flex-col justify-end overflow-hidden">
          <div className="space-y-2">
            {chat.slice(-10).map(c => (
              <div key={c.id} className="flex items-start gap-2 animate-fade-in">
                <div className="glass rounded-2xl px-3 py-1.5 max-w-full">
                  <span className={clsx('text-xs font-bold mr-1', c.color)}>{c.user}</span>
                  <span className="text-white/80 text-xs">{c.text}</span>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        </div>
      )}

      {/* ── RIGHT ACTIONS ── */}
      <div className="absolute right-3 bottom-32 z-10 flex flex-col items-center gap-4">
        <button onClick={handleLike} className="flex flex-col items-center gap-1">
          <Heart className={clsx('w-8 h-8 transition-all', liked ? 'text-red-500 fill-red-500 scale-110' : 'text-white')} />
          <span className="text-white text-xs">{formatCount(likes)}</span>
        </button>
        <button onClick={() => setShowChat(s => !s)} className="flex flex-col items-center gap-1">
          <MessageCircle className={clsx('w-7 h-7', showChat ? 'text-rainbow-blue' : 'text-white/50')} />
          <span className="text-white text-xs">Chat</span>
        </button>
        <button className="flex flex-col items-center gap-1">
          <Share2 className="w-7 h-7 text-white" />
          <span className="text-white text-xs">Share</span>
        </button>
      </div>

      {/* ── LOUDMAN STRIP ── */}
      {room?.loudmanHandle && (
        <div className="absolute bottom-20 left-4 z-10">
          <a
            href={loudmanArtistUrl(room.loudmanHandle)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 glass rounded-full px-3 py-1.5"
          >
            <Music2 className="w-4 h-4 text-rainbow-yellow animate-spin" style={{ animationDuration: '3s' }} />
            <span className="text-white text-xs">Listen on Loudman</span>
            <ExternalLink className="w-3 h-3 text-white/30" />
          </a>
        </div>
      )}

      {/* ── PRIDE STRIP ── */}
      <div className="absolute bottom-16 left-0 right-0 z-10 pride-strip" />

      {/* ── CHAT INPUT ── */}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-4 pb-5">
        <div className="flex gap-2">
          <div className="w-8 h-8 rounded-full bg-dark-600 flex items-center justify-center text-sm flex-shrink-0">
            {user.avatar}
          </div>
          <input
            className="flex-1 bg-dark-600/90 backdrop-blur border border-white/15 rounded-full px-4 py-2 text-white text-sm placeholder-white/30 outline-none focus:border-rainbow-purple/50"
            placeholder="Say something..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendChat()}
          />
          <button
            onClick={sendChat}
            disabled={!input.trim()}
            className={clsx('p-2 rounded-full transition-all',
              input.trim() ? 'bg-rainbow-purple' : 'bg-dark-500')}
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes floatUp {
          0%   { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-200px) scale(1.4); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
