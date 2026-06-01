import React, { useState } from 'react'
import { Music2, ExternalLink, Radio, Users, Star } from 'lucide-react'
import { FEATURED_LOUDMAN_ARTISTS, LOUDMAN_BASE, LOUDMAN_HOST_URL, loudmanArtistUrl } from '../api/loudman'

export default function LoudmanPage() {
  const [activeArtist, setActiveArtist] = useState(null)

  return (
    <div className="h-full overflow-y-auto pt-14 pb-20">
      {/* Header */}
      <div className="px-4 mb-2">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-white font-black text-2xl">
            <span className="rainbow-text">Loudman</span>
          </h1>
          <span className="text-2xl">📻</span>
        </div>
        <p className="text-white/40 text-sm">Independent music radio — free, forever</p>
      </div>

      {/* Pride strip */}
      <div className="pride-strip mx-4 rounded-full mb-5" />

      {/* Main embed player */}
      <div className="mx-4 mb-6">
        <div className="glass rounded-2xl overflow-hidden border border-rainbow-yellow/20" style={{ height: 420 }}>
          <div className="pride-strip" />
          <iframe
            src={LOUDMAN_BASE}
            title="Loudman Radio"
            className="w-full h-full border-0"
            allow="autoplay"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-white/40 text-xs">🎵 Live independent music from Loudman.live</p>
          <a
            href={LOUDMAN_BASE}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-rainbow-yellow text-xs"
          >
            Open full site <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Featured Artists */}
      <div className="px-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Star className="w-4 h-4 text-rainbow-yellow" />
          <span className="text-white font-bold">Featured Artists</span>
        </div>
        <div className="space-y-2">
          {FEATURED_LOUDMAN_ARTISTS.map(artist => (
            <div key={artist.handle}
              className={`flex items-center gap-4 glass rounded-xl p-3 border transition-all cursor-pointer
                ${activeArtist === artist.handle ? 'border-rainbow-yellow/60' : 'border-white/10'}`}
              onClick={() => setActiveArtist(a => a === artist.handle ? null : artist.handle)}
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rainbow-orange to-rainbow-yellow flex items-center justify-center">
                <Music2 className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold text-sm">{artist.name}</p>
                <p className="text-white/50 text-xs">{artist.genre}</p>
              </div>
              <a
                href={loudmanArtistUrl(artist.handle)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="glass px-3 py-1.5 rounded-full text-xs text-rainbow-yellow border border-rainbow-yellow/30 flex items-center gap-1"
              >
                Listen <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Why Loudman section */}
      <div className="mx-4 glass rounded-2xl p-5 border border-rainbow-purple/20 mb-6">
        <h3 className="text-white font-bold mb-3">🤝 Why Rainbow Land ♥ Loudman</h3>
        <div className="space-y-3">
          {[
            { icon: '🎵', title: 'Real music, real artists', desc: 'No major labels, no algorithms. Pure independent talent.' },
            { icon: '🆓', title: 'Free forever', desc: 'No subscriptions, no paywalls. Loudman Radio is 100% free.' },
            { icon: '🏳️‍🌈', title: 'Inclusive by design', desc: 'LGBT+ creators can cross-post and link their Loudman tracks on Rainbow Land.' },
            { icon: '🎙️', title: 'Host your own show', desc: 'DJ rooms, live queues, and listener interaction — built for creators.' },
          ].map(item => (
            <div key={item.title} className="flex gap-3">
              <span className="text-xl">{item.icon}</span>
              <div>
                <p className="text-white text-sm font-semibold">{item.title}</p>
                <p className="text-white/50 text-xs">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <a
          href={LOUDMAN_HOST_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center justify-center gap-2 w-full bg-gradient-to-r from-rainbow-yellow to-rainbow-orange text-dark-900 font-bold py-3 rounded-xl text-sm"
        >
          <Radio className="w-4 h-4" /> Become a Loudman Host
        </a>
      </div>
    </div>
  )
}
