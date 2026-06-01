import React, { useState } from 'react'
import { Radio, Eye, ExternalLink, Video } from 'lucide-react'
import { MOCK_LIVE_CREATORS, formatCount } from '../api/mockData'
import { loudmanArtistUrl } from '../api/loudman'
import HostBroadcast from '../components/live/HostBroadcast'
import ViewerStream from '../components/live/ViewerStream'

const PRIDE_FLAGS = [
  { name: 'All',       emoji: '🌈' },
  { name: 'Rainbow',   emoji: '🏳️‍🌈' },
  { name: 'Trans',     emoji: '⚧️'  },
  { name: 'Bi',        emoji: '💜'  },
  { name: 'Non-binary',emoji: '🟡'  },
  { name: 'Lesbian',   emoji: '🧡'  },
]

export default function LivePage() {
  const [selectedFlag, setSelectedFlag] = useState(0)
  const [mode, setMode]       = useState(null) // null | 'host' | 'viewer'
  const [viewingRoom, setViewingRoom] = useState(null)

  if (mode === 'host')   return <HostBroadcast onExit={() => setMode(null)} />
  if (mode === 'viewer') return <ViewerStream room={viewingRoom} onExit={() => { setMode(null); setViewingRoom(null) }} />

  return (
    <div className="h-full overflow-y-auto pt-14 pb-20">
      {/* Header */}
      <div className="px-4 mb-4">
        <h1 className="text-white font-black text-2xl">
          <span className="rainbow-text">Live</span> 🔴
        </h1>
        <p className="text-white/40 text-sm">Real-time creators & Loudman Radio rooms</p>
      </div>

      {/* GO LIVE button */}
      <div className="px-4 mb-5">
        <button
          onClick={() => setMode('host')}
          className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-lg text-white
            bg-gradient-to-r from-rainbow-red via-rainbow-pink to-rainbow-purple
            shadow-lg shadow-rainbow-pink/30 active:scale-95 transition-transform"
        >
          <Video className="w-6 h-6" />
          Go Live Now
        </button>
        <p className="text-white/30 text-xs text-center mt-2">Free. No followers required. Your community waits.</p>
      </div>

      {/* Pride filter */}
      <div className="px-4 mb-5">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {PRIDE_FLAGS.map((flag, idx) => (
            <button
              key={flag.name}
              onClick={() => setSelectedFlag(idx)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm transition-all
                ${idx === selectedFlag
                  ? 'border-rainbow-purple bg-rainbow-purple/15 text-white font-bold'
                  : 'border-white/10 glass text-white/60'}`}
            >
              <span>{flag.emoji}</span>
              <span>{flag.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Live rooms */}
      <div className="px-4 mb-6">
        <p className="text-white font-bold mb-3">🎙️ Live Now</p>
        <div className="space-y-3">
          {MOCK_LIVE_CREATORS.map(creator => (
            <button
              key={creator.id}
              onClick={() => { setViewingRoom(creator); setMode('viewer') }}
              className="w-full flex items-center gap-4 glass rounded-2xl p-4 border border-white/10 hover:border-rainbow-pink/40 transition-all text-left"
            >
              {/* Thumbnail */}
              <div className="relative flex-shrink-0">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-rainbow-pink to-rainbow-purple flex items-center justify-center text-3xl">
                  {creator.thumbnail}
                </div>
                <span className="absolute -top-1 -left-1 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">LIVE</span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold truncate">{creator.name}</p>
                <p className="text-white/50 text-sm">{creator.handle}</p>
                <div className="flex items-center gap-1 mt-1">
                  <Eye className="w-3 h-3 text-rainbow-green" />
                  <span className="text-rainbow-green text-xs font-semibold">{formatCount(creator.viewers)} watching</span>
                </div>
              </div>

              {/* Loudman badge */}
              <div className="flex flex-col items-center gap-1 flex-shrink-0">
                <div className="glass px-2 py-1 rounded-lg border border-rainbow-yellow/30">
                  <span className="text-rainbow-yellow text-xs font-bold">Loudman</span>
                </div>
                <a
                  href={loudmanArtistUrl(creator.loudmanHandle)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                >
                  <ExternalLink className="w-3 h-3 text-white/30" />
                </a>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Loudman host CTA */}
      <div className="px-4">
        <div className="glass rounded-2xl p-4 border border-rainbow-yellow/20 flex items-center gap-3">
          <Radio className="w-7 h-7 text-rainbow-yellow flex-shrink-0" />
          <div className="flex-1">
            <p className="text-white font-bold text-sm">Host on Loudman Radio</p>
            <p className="text-white/40 text-xs">Run your own DJ room with live music queues</p>
          </div>
          <a
            href="https://loudman.live/become-a-host"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 glass border border-rainbow-yellow/40 text-rainbow-yellow font-bold py-2 px-3 rounded-xl text-xs"
          >
            Join
          </a>
        </div>
      </div>
    </div>
  )
}
