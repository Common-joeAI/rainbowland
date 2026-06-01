import React, { useState } from 'react'
import { Search, TrendingUp, Hash } from 'lucide-react'
import { MOCK_VIDEOS, MOCK_TRENDING_TAGS, formatCount } from '../api/mockData'
import { suggestHashtags } from '../api/grok'

export default function DiscoverPage() {
  const [query, setQuery] = useState('')
  const [aiTags, setAiTags] = useState([])
  const [loading, setLoading] = useState(false)

  const handleSearch = async (q) => {
    setQuery(q)
    if (q.length > 3) {
      setLoading(true)
      try {
        const tags = await suggestHashtags(q)
        setAiTags(tags)
      } catch { }
      setLoading(false)
    } else {
      setAiTags([])
    }
  }

  const filtered = query
    ? MOCK_VIDEOS.filter(v =>
        v.caption.toLowerCase().includes(query.toLowerCase()) ||
        v.hashtags.some(h => h.toLowerCase().includes(query.toLowerCase())) ||
        v.creator.name.toLowerCase().includes(query.toLowerCase())
      )
    : MOCK_VIDEOS

  return (
    <div className="h-full overflow-y-auto px-4 pt-14 pb-20">
      <h1 className="text-white font-black text-2xl mb-4">
        <span className="rainbow-text">Explore</span> 🌈
      </h1>

      {/* Search bar */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
        <input
          className="w-full bg-dark-600 border border-white/10 rounded-2xl pl-10 pr-4 py-3 text-white text-sm placeholder-white/30 outline-none focus:border-rainbow-purple/60"
          placeholder="Search creators, hashtags, sounds..."
          value={query}
          onChange={e => handleSearch(e.target.value)}
        />
      </div>

      {/* AI suggested tags */}
      {aiTags.length > 0 && (
        <div className="mb-5">
          <p className="text-white/40 text-xs mb-2">✨ AI suggested tags</p>
          <div className="flex flex-wrap gap-2">
            {aiTags.map(tag => (
              <button key={tag} onClick={() => setQuery(tag)}
                className="glass px-3 py-1 rounded-full text-rainbow-purple text-sm border border-rainbow-purple/30">
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Trending hashtags */}
      {!query && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-rainbow-pink" />
            <span className="text-white font-bold">Trending</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {MOCK_TRENDING_TAGS.map(tag => (
              <button key={tag} onClick={() => setQuery(tag)}
                className="glass px-3 py-1.5 rounded-full text-sm border border-white/10 hover:border-rainbow-pink/40 transition-all">
                <span className="rainbow-text font-semibold">{tag}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Video grid */}
      <div className="mb-3">
        <span className="text-white/40 text-xs">{filtered.length} videos</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {filtered.map(video => (
          <div key={video.id} className="relative rounded-2xl overflow-hidden bg-dark-600 aspect-[9/16]">
            <video
              src={video.videoUrl}
              className="w-full h-full object-cover"
              muted
              preload="metadata"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
            <div className="absolute bottom-2 left-2 right-2">
              <p className="text-white text-xs font-semibold line-clamp-2">{video.creator.name}</p>
              <p className="text-white/60 text-[10px]">❤️ {formatCount(video.likes)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
