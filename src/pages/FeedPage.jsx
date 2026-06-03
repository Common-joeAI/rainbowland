import React, { useRef, useEffect, useMemo } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useStore } from '../hooks/useStore'
import { MOCK_VIDEOS, SAFESPACE_TRUSTED_TAGS } from '../api/mockData'
import { fetchVideos } from '../api/videos'
import VideoCard from '../components/VideoCard'
import CommentsDrawer from '../components/CommentsDrawer'

export default function FeedPage() {
  const {
    currentVideoIndex, setVideoIndex,
    showComments, safeSpaceEnabled, toggleSafeSpace,
    videos: liveVideos, setVideos,
  } = useStore()

  const containerRef = useRef(null)

  // Load live videos on mount, fall back to mock
  useEffect(() => {
    fetchVideos({ limit: 30 })
      .then(data => {
        const vids = data?.videos || []
        if (vids.length > 0) {
          // Normalize: server returns { url, handle, displayName, ... }
          // VideoCard expects { videoUrl, creator: { handle, name }, ... }
          const normalized = vids.map(v => ({
            ...v,
            videoUrl: v.url || v.videoUrl,
            creator: v.creator || { handle: v.handle, name: v.displayName, avatar: v.avatar },
          }))
          setVideos(normalized)
        }
      })
      .catch(() => {}) // silently fall back to mock
  }, [])

  const videos = useMemo(() => {
    const src = liveVideos.length > 0 ? liveVideos : MOCK_VIDEOS
    if (!safeSpaceEnabled) return src
    return src.filter(v =>
      (v.hashtags || []).some(tag => SAFESPACE_TRUSTED_TAGS.includes(tag.toLowerCase()))
    )
  }, [safeSpaceEnabled, liveVideos])

  // Intersection observer — snap active video index
  useEffect(() => {
    if (!containerRef.current) return
    const items = containerRef.current.querySelectorAll('.feed-item')
    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const idx = parseInt(entry.target.dataset.index)
            if (!isNaN(idx)) setVideoIndex(idx)
          }
        })
      },
      { root: containerRef.current, threshold: 0.6 }
    )
    items.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [setVideoIndex, videos])

  return (
    <div className="h-full w-full relative overflow-hidden bg-black">
      {/* Top header overlay */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-3 pb-2 pointer-events-none">
        <div className="pointer-events-auto pl-10">
          <span className="rainbow-text text-xl font-black tracking-wide">Rainbow Land</span>
          <span className="text-white/30 text-xs block">🌈 safe space for all</span>
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={toggleSafeSpace}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              safeSpaceEnabled
                ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/40'
                : 'bg-white/10 text-white/60'
            }`}
          >
            <ShieldCheck size={12} />
            SafeSpace
          </button>
          <button className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/10 text-white/60">
            Following
          </button>
          <span className="text-white/40 text-xs">For You</span>
        </div>
      </div>

      {/* Snap scroll feed */}
      <div
        ref={containerRef}
        className="h-full w-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
        style={{ scrollbarWidth: 'none' }}
      >
        {videos.map((video, idx) => (
          <VideoCard
            key={video.id || idx}
            video={video}
            isActive={idx === currentVideoIndex}
            data-index={idx}
          />
        ))}
      </div>

      {/* Comments drawer */}
      {showComments && <CommentsDrawer />}
    </div>
  )
}
