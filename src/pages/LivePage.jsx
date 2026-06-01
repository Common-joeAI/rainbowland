import React, { useState } from 'react'
import { Radio, Eye, ExternalLink } from 'lucide-react'
import { MOCK_LIVE_CREATORS, formatCount } from '../api/mockData'
import { loudmanArtistUrl } from '../api/loudman'

const PRIDE_FLAGS = [
  { name: 'Rainbow', emoji: '🏳️‍🌈', colors: ['#FF3366','#FF7A00','#FFD700','#00E676','#00B4FF','#9B59FF'] },
  { name: 'Trans', emoji: '⚧️', colors: ['#55CDFC','#F7A8B8','#FFFFFF','#F7A8B8','#55CDFC'] },
  { name: 'Bi', emoji: '💜', colors: ['#D60270','#9B4F96','#0038A8'] },
  { name: 'Non-binary', emoji: '🟡', colors: ['#FCF434','#FFFFFF','#9C59D1','#2D2D2D'] },
  { name: 'Lesbian', emoji: '🧡', colors: ['#D52D00','#EF7627','#FF9A56','#FFFFFF','#D162A4','#B55690','#A50062'] },
]

export default function LivePage() {
  const [selectedFlag, setSelectedFlag] = useState(0)

  return (
    <div className="h-full overflow-y-auto pt-14 pb-20">
      {/* Header */}
      <div className="px-4 mb-6">
        <h1 className="text-white font-black text-2xl">
          <span className="rainbow-text">Live</span> 🔴
        </h1>
        <p className="text-white/40 text-sm">Real-time creators & Loudman Radio rooms</p>
      </div>

      {/* Pride flags selector */}
      <div className="px-4 mb-6">
        <p className="text-white/60 text-xs mb-2 font-semibold uppercase tracking-wider">Filter by community</p>
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
          {PRIDE_FLAGS.map((flag, idx) => (
            <button
              key={flag.name}
              onClick={() => setSelectedFlag(idx)}
              className={`flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl border transition-all
                ${idx === selectedFlag ? 'border-rainbow-purple bg-rainbow-purple/10' : 'border-white/10 glass'}`}
            >
              <span className="text-xl">{flag.emoji}</span>
              <span className="text-white/70 text-[10px] whitespace-nowrap">{flag.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Live rooms */}
      <div className="px-4 mb-6">
        <p className="text-white font-bold mb-3">🎙️ Live Now</p>
        <div className="space-y-3">
          {MOCK_LIVE_CREATORS.map(creator => (
            <a
              key={creator.id}
              href={loudmanArtistUrl(creator.loudmanHandle)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 glass rounded-2xl p-4 border border-white/10 hover:border-rainbow-pink/40 transition-all"
            >
              {/* Live avatar */}
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-rainbow-pink to-rainbow-purple flex items-center justify-center text-3xl">
                  {creator.thumbnail}
                </div>
                <span className="absolute -top-1 -left-1 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">LIVE</span>
              </div>

              {/* Info */}
              <div className="flex-1">
                <p className="text-white font-bold">{creator.name}</p>
                <p className="text-white/50 text-sm">{creator.handle}</p>
                <div className="flex items-center gap-1 mt-1">
                  <Eye className="w-3 h-3 text-rainbow-green" />
                  <span className="text-rainbow-green text-xs font-semibold">{formatCount(creator.viewers)} watching</span>
                </div>
              </div>

              {/* Loudman badge */}
              <div className="flex flex-col items-center gap-1">
                <div className="glass px-2 py-1 rounded-lg border border-rainbow-yellow/30">
                  <span className="text-rainbow-yellow text-xs font-bold">Loudman</span>
                </div>
                <ExternalLink className="w-3 h-3 text-white/30" />
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* Start your own live */}
      <div className="px-4">
        <div className="glass rounded-2xl p-5 border border-rainbow-purple/30 text-center">
          <Radio className="w-8 h-8 text-rainbow-purple mx-auto mb-2" />
          <p className="text-white font-bold mb-1">Go Live on Rainbow Land</p>
          <p className="text-white/50 text-sm mb-4">Stream to your community. Free. Always.</p>
          <div className="flex gap-2 justify-center">
            <button className="bg-gradient-to-r from-rainbow-pink to-rainbow-purple text-white font-bold py-2 px-5 rounded-full text-sm">
              Start Stream
            </button>
            <a
              href="https://loudman.live/become-a-host"
              target="_blank"
              rel="noopener noreferrer"
              className="glass border border-rainbow-yellow/40 text-rainbow-yellow font-bold py-2 px-4 rounded-full text-sm"
            >
              Host on Loudman
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
