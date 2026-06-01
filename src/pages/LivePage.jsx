import React, { useState, useEffect, useRef } from 'react'
import { Radio, Eye, Users, ExternalLink, Loader, Video } from 'lucide-react'
import { MOCK_LIVE_CREATORS, formatCount } from '../api/mockData'
import { loudmanArtistUrl } from '../api/loudman'
import HostBroadcast from '../components/live/HostBroadcast'
import ViewerStream  from '../components/live/ViewerStream'

const RL_LIVE = 'https://live.rainbowland.cc'

const PRIDE_FLAGS = [
  { name: 'All',        emoji: '🌈' },
  { name: 'Rainbow',    emoji: '🏳️‍🌈' },
  { name: 'Trans',      emoji: '⚧️'  },
  { name: 'Bi',         emoji: '💜'  },
  { name: 'Non-binary', emoji: '🟡'  },
  { name: 'Lesbian',    emoji: '🧡'  },
]

// ── HLS Viewer ────────────────────────────────────────────────
function HLSViewer({ stream, onExit }) {
  const videoRef  = useRef(null)
  const [viewers, setViewers] = useState(0)
  const [chat,    setChat]    = useState([])
  const wsRef     = useRef(null)

  useEffect(() => {
    // Load HLS.js dynamically
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest'
    script.onload = () => {
      if (!videoRef.current) return
      if (window.Hls?.isSupported()) {
        const hls = new window.Hls({ lowLatencyMode: true })
        hls.loadSource(stream.hlsUrl)
        hls.attachMedia(videoRef.current)
      } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        videoRef.current.src = stream.hlsUrl
      }
    }
    document.head.appendChild(script)
    return () => document.head.removeChild(script)
  }, [stream.hlsUrl])

  useEffect(() => {
    // WebSocket chat
    const ws = new WebSocket(`wss://live.rainbowland.cc/ws`)
    wsRef.current = ws
    ws.onopen = () => ws.send(JSON.stringify({ type: 'join', streamKey: stream.key }))
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'chat')         setChat(c => [...c.slice(-50), msg])
      if (msg.type === 'viewer_count') setViewers(msg.count)
      if (msg.type === 'stream_end')   onExit()
    }
    return () => ws.close()
  }, [stream.key])

  const sendChat = (text) => {
    wsRef.current?.send(JSON.stringify({ type: 'chat', streamKey: stream.key, user: 'Viewer', text }))
  }

  return (
    <div className="h-full flex flex-col bg-dark-900">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <button onClick={onExit} className="text-white/50 hover:text-white text-sm">← Back</button>
        <span className="text-white font-bold text-sm">{stream.title}</span>
        <span className="flex items-center gap-1 text-white/50 text-xs">
          <Users className="w-3 h-3" /> {viewers}
        </span>
      </div>

      <div className="relative bg-black flex-shrink-0" style={{ aspectRatio: '16/9' }}>
        <video ref={videoRef} className="w-full h-full object-contain" autoPlay controls playsInline />
        <div className="absolute top-2 left-2 flex items-center gap-1 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
          <Radio className="w-2.5 h-2.5 animate-pulse" /> LIVE
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {chat.map((m, i) => (
          <div key={i} className="flex items-start gap-1.5 text-xs">
            <span className="font-bold" style={{ color: m.color || '#9B59FF' }}>{m.user}</span>
            <span className="text-white/70">{m.text}</span>
          </div>
        ))}
      </div>

      <ChatInput onSend={sendChat} />
    </div>
  )
}

function ChatInput({ onSend }) {
  const [text, setText] = useState('')
  const submit = () => { if (text.trim()) { onSend(text.trim()); setText('') } }
  return (
    <div className="flex gap-2 px-3 pb-4 pt-2 border-t border-white/10">
      <input
        className="flex-1 bg-dark-700 rounded-full px-3 py-2 text-white text-xs placeholder-white/30 outline-none"
        placeholder="Say something…"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
      />
      <button onClick={submit}
        className="px-3 py-2 rounded-full bg-rainbow-purple text-white text-xs font-bold">
        Send
      </button>
    </div>
  )
}

// ── Main Live Page ────────────────────────────────────────────
export default function LivePage() {
  const [selectedFlag, setSelectedFlag] = useState(0)
  const [mode,         setMode]         = useState(null) // null | 'host' | 'viewer' | 'hls'
  const [viewingRoom,  setViewingRoom]  = useState(null)
  const [liveStreams,  setLiveStreams]  = useState([])
  const [loading,      setLoading]      = useState(true)

  // Fetch real Rainbow Land streams
  useEffect(() => {
    const fetchStreams = async () => {
      try {
        const r = await fetch(`${RL_LIVE}/api/streams`)
        const data = await r.json()
        setLiveStreams(data)
      } catch {
        setLiveStreams([])
      } finally {
        setLoading(false)
      }
    }
    fetchStreams()
    const interval = setInterval(fetchStreams, 10000)
    return () => clearInterval(interval)
  }, [])

  if (mode === 'host')   return <HostBroadcast onExit={() => setMode(null)} />
  if (mode === 'viewer') return <ViewerStream room={viewingRoom} onExit={() => { setMode(null); setViewingRoom(null) }} />
  if (mode === 'hls')    return <HLSViewer stream={viewingRoom} onExit={() => { setMode(null); setViewingRoom(null) }} />

  return (
    <div className="h-full overflow-y-auto pt-14 pb-20">
      <div className="px-4 mb-4">
        <h1 className="text-white font-black text-2xl">
          <span className="rainbow-text">Live</span> 🔴
        </h1>
        <p className="text-white/50 text-sm mt-0.5">Real-time streams from the community</p>
      </div>

      {/* Pride filter */}
      <div className="flex gap-2 px-4 mb-4 overflow-x-auto scrollbar-hide">
        {PRIDE_FLAGS.map((f, i) => (
          <button key={f.name}
            onClick={() => setSelectedFlag(i)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all ${
              selectedFlag === i ? 'bg-rainbow-purple text-white' : 'glass text-white/60 hover:text-white'
            }`}>
            {f.emoji} {f.name}
          </button>
        ))}
      </div>

      {/* Rainbow Land live streams */}
      {liveStreams.length > 0 && (
        <div className="px-4 mb-4">
          <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Radio className="w-3 h-3 text-red-400 animate-pulse" /> Live on Rainbow Land
          </p>
          <div className="space-y-2">
            {liveStreams.map(stream => (
              <button key={stream.key}
                onClick={() => { setViewingRoom(stream); setMode('hls') }}
                className="w-full text-left rounded-xl border border-rainbow-purple/20 bg-rainbow-purple/5 p-3 hover:bg-rainbow-purple/10 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-rainbow-purple/20 flex items-center justify-center text-xl">🌈</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm truncate">{stream.title}</p>
                    <p className="text-white/50 text-xs">{stream.creator}</p>
                  </div>
                  <div className="flex items-center gap-1 text-red-400 text-xs font-bold">
                    <Radio className="w-3 h-3 animate-pulse" /> LIVE
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-4">
          <Loader className="w-5 h-5 text-white/30 animate-spin" />
        </div>
      )}

      {/* Mock creators (community / other platforms) */}
      <div className="px-4">
        <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2">Community Streams</p>
        <div className="space-y-3">
          {MOCK_LIVE_CREATORS.map((creator) => (
            <div key={creator.id} className="glass rounded-2xl overflow-hidden">
              <div className="relative">
                <div className="w-full h-40 bg-gradient-to-br from-dark-700 to-dark-800 flex items-center justify-center">
                  <span className="text-6xl">{creator.thumbnail}</span>
                </div>
                <div className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  LIVE
                </div>
                <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Eye className="w-3 h-3" /> {formatCount(creator.viewers)}
                </div>
              </div>
              <div className="p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="rainbow-border rounded-full p-0.5">
                    <div className="w-8 h-8 rounded-full bg-dark-600 flex items-center justify-center text-sm">{creator.avatar}</div>
                  </div>
                  <div>
                    <p className="text-white text-sm font-bold">{creator.name}</p>
                    <p className="text-white/50 text-xs">{creator.handle}</p>
                  </div>
                </div>
                <p className="text-white/80 text-sm mb-2">{creator.title}</p>
                <div className="flex gap-1 flex-wrap">
                  {(creator.hashtags || creator.tags || []).map(tag => (
                    <span key={tag} className="text-rainbow-purple text-xs bg-rainbow-purple/10 px-2 py-0.5 rounded-full">{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
