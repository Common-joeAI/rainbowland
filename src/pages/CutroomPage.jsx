import React, { useState, useEffect } from 'react'
import { Scissors, ExternalLink, Mic2, Users, Star, Send, Play } from 'lucide-react'
import {
  CUTROOM_BASE, CUTROOM_SUBMIT_URL, CUTROOM_CURATOR_URL, CUTROOM_ARTIST_URL,
  cutroomUserUrl, fetchCutroomUser, FEATURED_CUTROOM_ARTISTS
} from '../api/cutroom'

export default function CutroomPage() {
  const [profiles, setProfiles] = useState({})
  const [loading, setLoading]   = useState(true)

  // Try to fetch live profile data via proxy
  useEffect(() => {
    async function loadProfiles() {
      const results = {}
      await Promise.all(
        FEATURED_CUTROOM_ARTISTS.map(async (a) => {
          const data = await fetchCutroomUser(a.username)
          if (data) results[a.username] = data
        })
      )
      setProfiles(results)
      setLoading(false)
    }
    loadProfiles()
  }, [])

  return (
    <div className="h-full overflow-y-auto pt-14 pb-20">
      {/* Header */}
      <div className="px-4 mb-2">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-white font-black text-2xl">
            <span className="rainbow-text">Cutroom</span>
          </h1>
          <span className="text-2xl">✂️</span>
        </div>
        <p className="text-white/40 text-sm">The stage before the stage — live music feedback rooms</p>
      </div>

      {/* Pride strip */}
      <div className="pride-strip mx-4 rounded-full mb-5" />

      {/* Main embed — Cutroom homepage */}
      <div className="mx-4 mb-6">
        <div className="glass rounded-2xl overflow-hidden border border-rainbow-pink/20" style={{ height: 420 }}>
          <div className="pride-strip" />
          <iframe
            src={CUTROOM_BASE}
            title="Cutroom"
            className="w-full h-full border-0"
            allow="autoplay; camera; microphone"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-white/40 text-xs">🎙️ Live music review rooms from Cutroom.fm</p>
          <a
            href={CUTROOM_BASE}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-rainbow-pink text-xs"
          >
            Open full site <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Quick action buttons */}
      <div className="px-4 mb-6 grid grid-cols-2 gap-3">
        <a
          href={CUTROOM_SUBMIT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="glass rounded-2xl p-4 border border-rainbow-pink/20 flex flex-col items-center gap-2 text-center"
        >
          <Send className="w-6 h-6 text-rainbow-pink" />
          <p className="text-white font-bold text-sm">Submit a Track</p>
          <p className="text-white/40 text-xs">Get live feedback from real curators</p>
        </a>
        <a
          href={CUTROOM_CURATOR_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="glass rounded-2xl p-4 border border-rainbow-purple/20 flex flex-col items-center gap-2 text-center"
        >
          <Play className="w-6 h-6 text-rainbow-purple" />
          <p className="text-white font-bold text-sm">Host a Room</p>
          <p className="text-white/40 text-xs">Run your own review stream</p>
        </a>
      </div>

      {/* Featured Artists / Curators */}
      <div className="px-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Star className="w-4 h-4 text-rainbow-pink" />
          <span className="text-white font-bold">Featured on Cutroom</span>
        </div>
        <div className="space-y-2">
          {FEATURED_CUTROOM_ARTISTS.map(artist => (
            <div
              key={artist.username}
              className="flex items-center gap-4 glass rounded-xl p-3 border border-white/10"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rainbow-pink to-rainbow-purple flex items-center justify-center flex-shrink-0">
                {artist.role === 'Curator'
                  ? <Mic2 className="w-6 h-6 text-white" />
                  : <Scissors className="w-6 h-6 text-white" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-white font-semibold text-sm truncate">{artist.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                    artist.role === 'Curator'
                      ? 'bg-rainbow-purple/20 text-rainbow-purple'
                      : 'bg-rainbow-pink/20 text-rainbow-pink'
                  }`}>{artist.role}</span>
                </div>
                <p className="text-white/40 text-xs">{artist.genre}</p>
                <p className="text-white/30 text-xs mt-0.5 truncate">{artist.bio}</p>
              </div>
              <a
                href={cutroomUserUrl(artist.username)}
                target="_blank"
                rel="noopener noreferrer"
                className="glass px-3 py-1.5 rounded-full text-xs text-rainbow-pink border border-rainbow-pink/30 flex items-center gap-1 flex-shrink-0"
              >
                View <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Why Cutroom section */}
      <div className="mx-4 glass rounded-2xl p-5 border border-rainbow-pink/20 mb-6">
        <h3 className="text-white font-bold mb-3">🤝 Why Rainbow Land ♥ Cutroom</h3>
        <div className="space-y-3">
          {[
            { icon: '✂️', title: 'Real-time feedback', desc: 'Submit your tracks and get live reactions from curators and listeners as they happen.' },
            { icon: '🏳️‍🌈', title: 'Safe creative space', desc: 'Inclusive rooms where independent and LGBTQ+ artists can test music before release.' },
            { icon: '🎙️', title: 'Host your own show', desc: 'Run a curator stream, build your audience, and discover new music together.' },
            { icon: '🚀', title: 'The stage before the stage', desc: 'Cutroom gets your music heard before it officially drops — no label required.' },
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
          href={CUTROOM_ARTIST_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center justify-center gap-2 w-full bg-gradient-to-r from-rainbow-pink to-rainbow-purple text-white font-bold py-3 rounded-xl text-sm"
        >
          <Scissors className="w-4 h-4" /> Get Started on Cutroom
        </a>
      </div>
    </div>
  )
}
