import React, { useRef, useEffect, useMemo } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useStore } from '../hooks/useStore'
import { MOCK_VIDEOS, SAFESPACE_TRUSTED_TAGS } from '../api/mockData'
import VideoCard from '../components/VideoCard'
import CommentsDrawer from '../components/CommentsDrawer'
import clsx from 'clsx'

export default function FeedPage() {
  const { currentVideoIndex, setVideoIndex, showComments, safeSpaceEnabled, toggleSafeSpace } = useStore()
  const containerRef = useRef(null)

  // Filter feed based on SafeSpace mode
  const videos = useMemo(() => {
    if (!safeSpaceEnabled) return MOCK_VIDEOS
    return MOCK_VIDEOS.filter(v =>
      (v.hashtags || []).some(tag => SAFESPACE_TRUSTED_TAGS.includes(tag.toLowerCase()))
    )
  }, [safeSpaceEnabled])

  // Intersection observer to track which video is visible
  useEffect(() => {
    const items = containerRef.current?.querySelectorAll('.feed-item')
    if (!items?.length) return

    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
          const idx = parseInt(entry.target.dataset.index)
          setVideoIndex(idx)
        }
      })
    }, { threshold: 0.5 })

    items.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [setVideoIndex, videos])

  return (
    <div className="h-full relative">
      {/* Top header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-4 pb-2 pointer-events-none">
        <div className="pointer-events-auto pl-10">
          <span className="rainbow-text text-xl font-black tracking-wide">Rainbow Land</span>
          <span className="text-white/30 text-xs block">🌈 safe space for all</span>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          {/* SafeSpace toggle */}
          <button
            onClick={toggleSafeSpace}
            title={safeSpaceEnabled ? 'SafeSpace ON — showing trusted content only' : 'SafeSpace OFF — tap to enable'}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border',
              safeSpaceEnabled
                ? 'border-green-500/60 text-green-400 bg-green-500/15'
                : 'border-white/15 text-white/40 glass'
            )}
          >
            <ShieldCheck className={clsx('w-3.5 h-3.5', safeSpaceEnabled ? 'text-green-400' : 'text-white/30')} />
            {safeSpaceEnabled ? 'SafeSpace' : 'SafeSpace'}
          </button>

          <button className="glass px-3 py-1 rounded-full text-white text-xs">
            Following · For You
          </button>
        </div>
      </div>

      {/* SafeSpace banner */}
      {safeSpaceEnabled && (
        <div className="absolute top-16 left-0 right-0 z-20 px-4 pointer-events-none">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium"
            style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', color: '#86efac' }}>
            <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
            SafeSpace mode — showing community-trusted content only
          </div>
        </div>
      )}

      {/* Feed */}
      <div ref={containerRef} className={clsx('feed-scroll h-full', safeSpaceEnabled && 'pt-8')}>
        {videos.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-8">
            <ShieldCheck className="w-16 h-16 text-green-400 mb-4" />
            <p className="text-white font-bold text-lg mb-2">All clear 🌈</p>
            <p className="text-white/40 text-sm">No content matches the SafeSpace filter right now. More creators coming soon.</p>
          </div>
        ) : (
          videos.map((video, idx) => (
            <div key={video.id} data-index={idx} className="feed-item">
              <VideoCard video={video} isActive={currentVideoIndex === idx} key={video?.id || idx} />
            </div>
          ))
        )}
      </div>

      {/* Comments drawer */}
      {showComments && (
        <CommentsDrawer videoId={videos[currentVideoIndex]?.id || null} />
      )}
    </div>
  )
}
