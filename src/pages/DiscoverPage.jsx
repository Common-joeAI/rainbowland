import React, { useState, useRef } from 'react'
import { Search, TrendingUp, Upload, X, CheckCircle, Plus, Play, Volume2, VolumeX } from 'lucide-react'
import { MOCK_VIDEOS, MOCK_TRENDING_TAGS, formatCount } from '../api/mockData'
import { suggestHashtags } from '../api/grok'
import { useStore } from '../hooks/useStore'

function VideoUploadModal({ onClose, onPublish }) {
  const { user } = useStore()
  const fileRef = useRef(null)
  const [file, setFile]           = useState(null)
  const [preview, setPreview]     = useState(null)
  const [caption, setCaption]     = useState('')
  const [hashtags, setHashtags]   = useState('')
  const [uploading, setUploading] = useState(false)
  const [done, setDone]           = useState(false)

  function handleFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('video/')) { alert('Please select a video file'); return }
    if (f.size > 500 * 1024 * 1024) { alert('Max file size is 500 MB'); return }
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  async function handlePublish() {
    if (!file || !caption.trim()) return
    setUploading(true)
    await new Promise(r => setTimeout(r, 1200))
    setUploading(false)
    setDone(true)
    onPublish?.({
      id: String(Date.now()),
      creator: {
        name: user?.name || 'Creator',
        handle: user?.handle || '@creator',
        avatar: user?.avatar || 'rainbow',
        pronouns: user?.pronouns,
        prideFlag: user?.prideFlag,
      },
      videoUrl: preview,
      caption,
      hashtags: hashtags.split(/[\s,]+/).filter(Boolean).map(h => h.replace(/^#/, '')),
      likes: 0, comments: 0, shares: 0,
    })
    setTimeout(onClose, 1200)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-dark-800 rounded-t-3xl p-6 pb-10 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-black text-lg"><span className="rainbow-text">Upload</span> Video</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        {done ? (
          <div className="flex flex-col items-center py-8 gap-3">
            <CheckCircle className="w-16 h-16 text-green-400" />
            <p className="text-white font-bold text-lg">Posted!</p>
            <p className="text-white/50 text-sm">Your video is live on Rainbow Land</p>
          </div>
        ) : (
          <>
            {!file ? (
              <button className="w-full aspect-video rounded-2xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-3 hover:border-rainbow-purple/60 transition-all" onClick={() => fileRef.current?.click()}>
                <Upload className="w-10 h-10 text-white/30" />
                <p className="text-white/50 text-sm">Tap to select a video</p>
                <p className="text-white/30 text-xs">MP4, MOV, WebM up to 500 MB</p>
              </button>
            ) : (
              <div className="relative rounded-2xl overflow-hidden aspect-video mb-4">
                <video src={preview} className="w-full h-full object-cover" controls playsInline />
                <button className="absolute top-2 right-2 glass rounded-full p-1" onClick={() => { setFile(null); setPreview(null) }}>
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            )}
            <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={handleFile} />
            <div className="mt-4">
              <label className="text-white/50 text-xs mb-1 block">Caption *</label>
              <textarea className="w-full bg-dark-600 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 outline-none focus:border-rainbow-purple/60 resize-none" rows={3} maxLength={300} placeholder="What's this video about?" value={caption} onChange={e => setCaption(e.target.value)} />
              <p className="text-white/20 text-[10px] text-right mt-1">{caption.length}/300</p>
            </div>
            <div className="mt-3">
              <label className="text-white/50 text-xs mb-1 block">Hashtags</label>
              <input className="w-full bg-dark-600 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/30 outline-none focus:border-rainbow-purple/60" placeholder="#pride #rainbow #lgbt" value={hashtags} onChange={e => setHashtags(e.target.value)} />
            </div>
            <button className="mt-5 w-full py-4 rounded-2xl font-black text-white text-base disabled:opacity-50 transition-all" style={{ background: 'linear-gradient(135deg, #9B59FF, #FF59A0)' }} disabled={!file || !caption.trim() || uploading} onClick={handlePublish}>
              {uploading ? 'Uploading...' : 'Post Video'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function VideoPlayer({ video, onClose }) {
  const videoRef = useRef(null)
  const [muted, setMuted]     = useState(false)
  const [playing, setPlaying] = useState(true)

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play(); setPlaying(true) }
    else          { v.pause(); setPlaying(false) }
  }

  const toggleMute = (e) => {
    e.stopPropagation()
    const next = !muted
    setMuted(next)
    if (videoRef.current) videoRef.current.muted = next
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" onClick={onClose}>
      <button className="absolute top-4 right-4 z-10 glass rounded-full p-2" onClick={onClose}>
        <X className="w-5 h-5 text-white" />
      </button>
      <button className="absolute top-4 left-4 z-10 glass rounded-full p-2" onClick={toggleMute}>
        {muted ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
      </button>
      <div className="flex-1 flex items-center justify-center relative" onClick={e => { e.stopPropagation(); togglePlay() }}>
        <video
          ref={videoRef}
          src={video.videoUrl}
          className="max-h-full max-w-full object-contain"
          autoPlay loop playsInline muted={muted}
        />
        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Play className="w-20 h-20 text-white/80 fill-white/80" />
          </div>
        )}
      </div>
      <div className="p-5 pb-8" onClick={e => e.stopPropagation()}>
        <p className="text-white font-bold">{video.creator?.name || 'Creator'}</p>
        <p className="text-white/70 text-sm mt-1">{video.caption}</p>
        <div className="flex flex-wrap gap-1 mt-2">
          {(video.hashtags || []).slice(0, 5).map(tag => (
            <span key={tag} className="text-rainbow-blue text-xs">#{tag}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

function GridCard({ video, onClick }) {
  const [errored, setErrored] = useState(false)
  return (
    <div className="relative rounded-2xl overflow-hidden bg-dark-600 aspect-[9/16] cursor-pointer group" onClick={() => onClick(video)}>
      {errored ? (
        <div className="w-full h-full flex items-center justify-center bg-dark-700 text-4xl">🎬</div>
      ) : (
        <video
          src={video.videoUrl}
          className="w-full h-full object-cover"
          muted playsInline preload="metadata"
          onError={() => setErrored(true)}
        />
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
        <Play className="w-10 h-10 text-white/0 group-hover:text-white/90 fill-white/0 group-hover:fill-white/90 transition-all drop-shadow-lg" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
      <div className="absolute bottom-2 left-2 right-2 pointer-events-none">
        <p className="text-white text-xs font-semibold line-clamp-2">{video.creator?.name || 'Creator'}</p>
        <p className="text-white/60 text-[10px]">❤️ {formatCount(video.likes || 0)}</p>
      </div>
    </div>
  )
}

export default function DiscoverPage() {
  const { user } = useStore()
  const [query, setQuery]             = useState('')
  const [aiTags, setAiTags]           = useState([])
  const [showUpload, setShowUpload]   = useState(false)
  const [extraVideos, setExtraVideos] = useState([])
  const [activeVideo, setActiveVideo] = useState(null)

  const isHost = user?.role === 'host' || user?.role === 'admin'

  const handleSearch = async (q) => {
    setQuery(q)
    if (q.length > 3) {
      try {
        const tags = await suggestHashtags(q)
        setAiTags(Array.isArray(tags) ? tags : [])
      } catch { setAiTags([]) }
    } else {
      setAiTags([])
    }
  }

  const allVideos = [...extraVideos, ...MOCK_VIDEOS]

  const filtered = query
    ? allVideos.filter(v =>
        v.caption?.toLowerCase().includes(query.toLowerCase()) ||
        (v.hashtags || []).some(h => h.toLowerCase().includes(query.toLowerCase())) ||
        v.creator?.name?.toLowerCase().includes(query.toLowerCase())
      )
    : allVideos

  const trendingTags = (MOCK_TRENDING_TAGS || [])
    .map(t => (typeof t === 'string' ? t : t?.tag))
    .filter(Boolean)

  return (
    <div className="h-full overflow-y-auto px-4 pt-14 pb-20">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-white font-black text-2xl"><span className="rainbow-text">Explore</span> 🌈</h1>
        {isHost && (
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg, #9B59FF, #FF59A0)' }} onClick={() => setShowUpload(true)}>
            <Plus className="w-4 h-4" /> Post Video
          </button>
        )}
      </div>

      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
        <input className="w-full bg-dark-600 border border-white/10 rounded-2xl pl-10 pr-4 py-3 text-white text-sm placeholder-white/30 outline-none focus:border-rainbow-purple/60" placeholder="Search creators, hashtags, sounds..." value={query} onChange={e => handleSearch(e.target.value)} />
      </div>

      {aiTags.length > 0 && (
        <div className="mb-5">
          <p className="text-white/40 text-xs mb-2">AI suggested tags</p>
          <div className="flex flex-wrap gap-2">
            {aiTags.map(tag => (
              <button key={tag} onClick={() => setQuery(tag)} className="glass px-3 py-1 rounded-full text-rainbow-purple text-sm border border-rainbow-purple/30">{tag}</button>
            ))}
          </div>
        </div>
      )}

      {!query && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-rainbow-pink" />
            <span className="text-white font-bold">Trending</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {trendingTags.map(tag => (
              <button key={tag} onClick={() => setQuery(tag)} className="glass px-3 py-1.5 rounded-full text-sm border border-white/10 hover:border-rainbow-pink/40 transition-all">
                <span className="rainbow-text font-semibold">#{tag}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mb-3"><span className="text-white/40 text-xs">{filtered.length} videos</span></div>

      <div className="grid grid-cols-2 gap-2">
        {filtered.map(video => (
          <GridCard key={video.id} video={video} onClick={setActiveVideo} />
        ))}
      </div>

      {activeVideo && <VideoPlayer video={activeVideo} onClose={() => setActiveVideo(null)} />}

      {showUpload && (
        <VideoUploadModal
          onClose={() => setShowUpload(false)}
          onPublish={(newVid) => { setExtraVideos(prev => [newVid, ...prev]); setShowUpload(false) }}
        />
      )}
    </div>
  )
}
