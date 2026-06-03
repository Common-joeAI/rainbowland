import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Search, TrendingUp, Plus, Upload, X, CheckCircle,
         Heart, MessageCircle, Share2, Volume2, VolumeX, Play, Music2 } from 'lucide-react'
import { MOCK_TRENDING_TAGS } from '../api/mockData'
import { suggestHashtags } from '../api/grok'
import { fetchVideos, uploadVideo, likeVideo } from '../api/videos'
import { useStore } from '../hooks/useStore'
import clsx from 'clsx'

const LIVE_SERVER = (() => {
  try {
    const { LIVE_SERVER_HTTP } = require('../api/liveServer')
    return LIVE_SERVER_HTTP
  } catch { return 'https://live.rainbowland.cc' }
})()

// ── Upload Modal ──────────────────────────────────────────────────────────────
function UploadModal({ onClose, onPublished }) {
  const { user } = useStore()
  const fileRef   = useRef(null)
  const [file, setFile]           = useState(null)
  const [preview, setPreview]     = useState(null)
  const [caption, setCaption]     = useState('')
  const [hashtags, setHashtags]   = useState('')
  const [progress, setProgress]   = useState(0)   // 0-100
  const [uploading, setUploading] = useState(false)
  const [done, setDone]           = useState(false)
  const [err, setErr]             = useState('')

  function handleFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('video/')) { setErr('Please pick a video file (MP4, MOV, WebM)'); return }
    if (f.size > 500 * 1024 * 1024)  { setErr('Max file size is 500 MB'); return }
    setErr('')
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  async function handlePost() {
    if (!file || !caption.trim()) return
    setUploading(true)
    setErr('')
    try {
      const tags = hashtags.split(/[\s,]+/).filter(Boolean).map(h => h.replace(/^#/, ''))
      // Fake progress while uploading
      const interval = setInterval(() => setProgress(p => Math.min(p + 4, 90)), 200)
      const result = await uploadVideo({ file, caption, hashtags: tags })
      clearInterval(interval)
      setProgress(100)
      if (result.ok && result.video) {
        setDone(true)
        onPublished?.(result.video)
      } else {
        setErr(result.error || 'Upload failed — try again')
        setProgress(0)
      }
    } catch (e) {
      setErr('Upload failed — check your connection')
      setProgress(0)
    }
    setUploading(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl p-6 pb-10 max-h-[92vh] overflow-y-auto"
           style={{ background: '#12121f' }}
           onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-black text-lg"><span className="rainbow-text">Post</span> a Short ✨</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {done ? (
          <div className="flex flex-col items-center py-10 gap-3">
            <CheckCircle className="w-16 h-16 text-green-400" />
            <p className="text-white font-bold text-xl">Posted! 🎉</p>
            <p className="text-white/50 text-sm text-center">Your video is live for everyone to see</p>
            <button onClick={onClose} className="mt-4 px-6 py-2 rounded-full text-white font-bold text-sm"
              style={{ background: 'linear-gradient(135deg,#9B59FF,#FF59A0)' }}>Done</button>
          </div>
        ) : (
          <>
            {!file ? (
              <button className="w-full aspect-video rounded-2xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-3 hover:border-rainbow-purple/60 transition-all"
                onClick={() => fileRef.current?.click()}>
                <Upload className="w-12 h-12 text-white/25" />
                <p className="text-white/50 text-sm font-semibold">Tap to pick a video</p>
                <p className="text-white/25 text-xs">MP4 · MOV · WebM · Max 500 MB</p>
              </button>
            ) : (
              <div className="relative rounded-2xl overflow-hidden aspect-video mb-1">
                <video src={preview} className="w-full h-full object-cover" controls playsInline />
                <button className="absolute top-2 right-2 bg-black/60 rounded-full p-1"
                  onClick={() => { setFile(null); setPreview(null); setProgress(0) }}>
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            )}
            <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={handleFile} />

            {err && <p className="text-red-400 text-xs mt-2 mb-1">{err}</p>}

            <div className="mt-4">
              <label className="text-white/40 text-xs mb-1 block">Caption *</label>
              <textarea className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/25 outline-none focus:border-rainbow-purple/60 resize-none"
                rows={3} maxLength={300}
                placeholder="What's this about? ✨"
                value={caption} onChange={e => setCaption(e.target.value)} />
              <p className="text-white/20 text-[10px] text-right">{caption.length}/300</p>
            </div>

            <div className="mt-2">
              <label className="text-white/40 text-xs mb-1 block">Hashtags</label>
              <input className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/25 outline-none focus:border-rainbow-purple/60"
                placeholder="#pride #rainbow #queer"
                value={hashtags} onChange={e => setHashtags(e.target.value)} />
            </div>

            {uploading && (
              <div className="mt-4">
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-200"
                    style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#9B59FF,#FF59A0)' }} />
                </div>
                <p className="text-white/40 text-xs mt-1 text-center">Uploading {progress}%...</p>
              </div>
            )}

            <button className="mt-5 w-full py-4 rounded-2xl font-black text-white text-base disabled:opacity-40 transition-all"
              style={{ background: 'linear-gradient(135deg,#9B59FF,#FF59A0)' }}
              disabled={!file || !caption.trim() || uploading}
              onClick={handlePost}>
              {uploading ? 'Uploading...' : '🚀 Post Video'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Single TikTok-style Video Card ────────────────────────────────────────────
function VideoSlide({ video, isActive, serverBase, onLikeChange }) {
  const videoRef = useRef(null)
  const [muted, setMuted]       = useState(true)
  const [playing, setPlaying]   = useState(true)
  const [liked, setLiked]       = useState(video.liked || false)
  const [likes, setLikes]       = useState(video.likes || 0)
  const [showHeart, setShowHeart] = useState(false)
  const lastTap = useRef(0)

  const fullUrl = video.videoUrl?.startsWith('http')
    ? video.videoUrl
    : `${serverBase}${video.videoUrl}`

  // Play/pause based on visibility
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (isActive) { el.play().catch(() => {}) }
    else          { el.pause(); el.currentTime = 0 }
  }, [isActive])

  // Sync mute
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted
  }, [muted])

  const togglePlay = () => {
    const el = videoRef.current
    if (!el) return
    if (el.paused) { el.play(); setPlaying(true) }
    else           { el.pause(); setPlaying(false) }
  }

  const handleTap = (e) => {
    const now = Date.now()
    if (now - lastTap.current < 300) {
      // Double-tap = like
      doLike()
      setShowHeart(true)
      setTimeout(() => setShowHeart(false), 900)
    } else {
      togglePlay()
    }
    lastTap.current = now
  }

  const doLike = async () => {
    const newLiked = !liked
    setLiked(newLiked)
    setLikes(l => newLiked ? l + 1 : Math.max(0, l - 1))
    try { await likeVideo(video.id) } catch {}
  }

  const fmt = n => n >= 1000000 ? `${(n/1000000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(1)}K` : String(n)

  return (
    <div className="feed-item bg-black relative overflow-hidden flex-shrink-0" style={{ height: '100%', width: '100%' }}>
      {/* Video */}
      <video
        ref={videoRef}
        src={fullUrl}
        className="absolute inset-0 w-full h-full object-cover"
        loop playsInline muted={muted}
        onError={e => { e.target.poster = ''; e.target.style.background = '#111' }}
        onClick={handleTap}
      />

      {/* Gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />

      {/* Pause indicator */}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Play className="w-20 h-20 text-white/70 fill-white/70 drop-shadow-2xl" />
        </div>
      )}

      {/* Double-tap heart */}
      {showHeart && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <Heart className="w-28 h-28 text-red-500 fill-red-500 animate-ping opacity-90" />
        </div>
      )}

      {/* Mute button */}
      <button className="absolute top-16 right-4 z-10 bg-black/40 backdrop-blur rounded-full p-2"
        onClick={e => { e.stopPropagation(); setMuted(m => !m) }}>
        {muted
          ? <VolumeX className="w-5 h-5 text-white" />
          : <Volume2 className="w-5 h-5 text-white" />}
      </button>

      {/* Right-side actions */}
      <div className="absolute right-3 bottom-28 z-10 flex flex-col items-center gap-5"
           onClick={e => e.stopPropagation()}>
        {/* Avatar */}
        <div className="rainbow-border rounded-full p-0.5">
          <div className="w-12 h-12 rounded-full bg-dark-600 flex items-center justify-center text-2xl">
            {video.creator?.avatar || '🌈'}
          </div>
        </div>

        {/* Like */}
        <div className="flex flex-col items-center gap-0.5">
          <button onClick={doLike} className="p-1">
            <Heart className={clsx('w-8 h-8 transition-all', liked ? 'text-red-500 fill-red-500 scale-110' : 'text-white')} />
          </button>
          <span className="text-white text-xs font-semibold">{fmt(likes)}</span>
        </div>

        {/* Comment */}
        <div className="flex flex-col items-center gap-0.5">
          <button className="p-1">
            <MessageCircle className="w-8 h-8 text-white" />
          </button>
          <span className="text-white text-xs font-semibold">{fmt(video.comments || 0)}</span>
        </div>

        {/* Share */}
        <div className="flex flex-col items-center gap-0.5">
          <button className="p-1" onClick={() => navigator.share?.({ url: window.location.href }).catch(() => {})}>
            <Share2 className="w-8 h-8 text-white" />
          </button>
          <span className="text-white text-xs font-semibold">{fmt(video.shares || 0)}</span>
        </div>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-20 left-4 right-20 z-10">
        <p className="font-bold text-white text-base">{video.creator?.name || 'Creator'}</p>
        {video.creator?.pronouns && (
          <span className="text-[11px] px-2 py-0.5 rounded-full mr-2"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
            {video.creator.pronouns}
          </span>
        )}
        <p className="text-white/80 text-sm mt-1 leading-snug line-clamp-2">{video.caption}</p>
        <div className="flex flex-wrap gap-1 mt-1">
          {(video.hashtags || []).slice(0, 4).map(tag => (
            <span key={tag} className="text-rainbow-blue text-xs">#{tag}</span>
          ))}
        </div>
      </div>

      {/* Pride strip */}
      <div className="absolute bottom-16 left-0 right-0 pride-strip z-10" />
    </div>
  )
}

// ── Search / Explore Grid Mode ────────────────────────────────────────────────
function ExploreGrid({ videos, onVideoClick, serverBase }) {
  return (
    <div className="grid grid-cols-2 gap-2 pb-4">
      {videos.map(v => {
        const url = v.videoUrl?.startsWith('http') ? v.videoUrl : `${serverBase}${v.videoUrl}`
        return (
          <div key={v.id} className="relative rounded-2xl overflow-hidden bg-dark-600 aspect-[9/16] cursor-pointer group"
            onClick={() => onVideoClick(v)}>
            <video src={url} className="w-full h-full object-cover" muted playsInline preload="metadata"
              onError={e => { e.target.style.display = 'none' }} />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
              <Play className="w-10 h-10 text-white/0 group-hover:text-white fill-white/0 group-hover:fill-white transition-all" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
            <div className="absolute bottom-2 left-2 right-2 pointer-events-none">
              <p className="text-white text-xs font-semibold line-clamp-1">{v.creator?.name}</p>
              <p className="text-white/60 text-[10px]">❤️ {v.likes || 0}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main DiscoverPage ─────────────────────────────────────────────────────────
export default function DiscoverPage() {
  const { user } = useStore()
  const [videos, setVideos]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [query, setQuery]           = useState('')
  const [aiTags, setAiTags]         = useState([])
  const [showUpload, setShowUpload] = useState(false)
  const [activeIdx, setActiveIdx]   = useState(0)
  const [searchMode, setSearchMode] = useState(false)
  const containerRef                = useRef(null)

  const isHost = user?.role === 'host' || user?.role === 'admin'
  const SERVER = 'https://live.rainbowland.cc'

  // Load videos from server
  const loadVideos = useCallback(async (q = null, tag = null) => {
    setLoading(true)
    try {
      const data = await fetchVideos({ limit: 30, q, tag })
      setVideos(data.videos || [])
    } catch {
      setVideos([])
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadVideos() }, [loadVideos])

  // Intersection observer for vertical scroll — track active video
  useEffect(() => {
    if (searchMode) return
    const items = containerRef.current?.querySelectorAll('.feed-item')
    if (!items?.length) return
    const obs = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          setActiveIdx(parseInt(entry.target.dataset.index))
        }
      })
    }, { threshold: 0.6 })
    items.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [videos, searchMode])

  const handleSearch = async (q) => {
    setQuery(q)
    if (q.length > 0) {
      setSearchMode(true)
      loadVideos(q)
      if (q.length > 3) {
        try { setAiTags(await suggestHashtags(q)) } catch {}
      }
    } else {
      setSearchMode(false)
      setAiTags([])
      loadVideos()
    }
  }

  const trendingTags = (MOCK_TRENDING_TAGS || [])
    .map(t => typeof t === 'string' ? t : t?.tag)
    .filter(Boolean)

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* Top bar — always visible */}
      <div className="absolute top-0 left-0 right-0 z-30 px-4 pt-12 pb-3"
           style={{ background: 'linear-gradient(to bottom, rgba(13,13,24,0.95) 70%, transparent)' }}>
        <div className="flex items-center gap-2 mb-0">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              className="w-full bg-white/8 border border-white/10 rounded-2xl pl-9 pr-4 py-2.5 text-white text-sm placeholder-white/30 outline-none focus:border-rainbow-purple/60"
              placeholder="Search videos, creators..."
              value={query}
              onChange={e => handleSearch(e.target.value)}
            />
          </div>
          {/* Post button for hosts */}
          {isHost && (
            <button className="flex items-center gap-1 px-3 py-2.5 rounded-xl font-bold text-sm text-white flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#9B59FF,#FF59A0)' }}
              onClick={() => setShowUpload(true)}>
              <Plus className="w-4 h-4" />
              Post
            </button>
          )}
        </div>
      </div>

      {/* ── FEED MODE — TikTok vertical scroll ─────────────────────────────── */}
      {!searchMode && (
        <div ref={containerRef} className="feed-scroll h-full" style={{ paddingTop: 0 }}>
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="text-5xl mb-3 animate-pulse">🌈</div>
                <p className="text-white/40 text-sm">Loading videos...</p>
              </div>
            </div>
          ) : videos.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-8">
              <p className="text-5xl mb-4">🎬</p>
              <p className="text-white font-bold text-lg mb-2">No videos yet</p>
              <p className="text-white/40 text-sm">
                {isHost ? 'Be the first — tap Post to share a short!' : 'Check back soon for community videos.'}
              </p>
            </div>
          ) : (
            videos.map((video, idx) => (
              <div key={video.id} data-index={idx} className="feed-item" style={{ height: '100%' }}>
                <VideoSlide
                  video={video}
                  isActive={activeIdx === idx}
                  serverBase={SERVER}
                />
              </div>
            ))
          )}
        </div>
      )}

      {/* ── SEARCH MODE — grid + tags ───────────────────────────────────────── */}
      {searchMode && (
        <div className="h-full overflow-y-auto px-4 pt-24 pb-20">
          {aiTags.length > 0 && (
            <div className="mb-4">
              <p className="text-white/40 text-xs mb-2">✨ AI suggested</p>
              <div className="flex flex-wrap gap-2">
                {aiTags.map(tag => (
                  <button key={tag} onClick={() => handleSearch(tag)}
                    className="glass px-3 py-1 rounded-full text-rainbow-purple text-sm border border-rainbow-purple/30">{tag}</button>
                ))}
              </div>
            </div>
          )}

          {!query && (
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-rainbow-pink" />
                <span className="text-white font-bold">Trending</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {trendingTags.map(tag => (
                  <button key={tag} onClick={() => handleSearch(tag)}
                    className="glass px-3 py-1.5 rounded-full text-sm border border-white/10 hover:border-rainbow-pink/40 transition-all">
                    <span className="rainbow-text font-semibold">#{tag}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-white/40 text-xs mb-3">{videos.length} videos</p>
          {loading
            ? <div className="text-center text-white/30 py-10">Searching...</div>
            : <ExploreGrid videos={videos} serverBase={SERVER} onVideoClick={() => {}} />
          }
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onPublished={(newVid) => {
            setVideos(prev => [newVid, ...prev])
            setShowUpload(false)
          }}
        />
      )}
    </div>
  )
}
