import React, { useRef, useEffect, useState } from 'react'
import { useStore } from '../hooks/useStore'
import { MOCK_VIDEOS } from '../api/mockData'
import VideoCard from '../components/VideoCard'
import CommentsDrawer from '../components/CommentsDrawer'

export default function FeedPage() {
  const { currentVideoIndex, setVideoIndex, showComments } = useStore()
  const containerRef = useRef(null)

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
  }, [setVideoIndex])

  return (
    <div className="h-full relative">
      {/* Top header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-4 pb-2 pointer-events-none">
        <div className="pointer-events-auto">
          <span className="rainbow-text text-xl font-black tracking-wide">Rainbow Land</span>
          <span className="text-white/30 text-xs block">🌈 safe space for all</span>
        </div>
        <button className="pointer-events-auto glass px-3 py-1 rounded-full text-white text-xs">
          Following · For You
        </button>
      </div>

      {/* Feed */}
      <div ref={containerRef} className="feed-scroll h-full">
        {MOCK_VIDEOS.map((video, idx) => (
          <div key={video.id} data-index={idx} className="feed-item">
            <VideoCard video={video} isActive={currentVideoIndex === idx} />
          </div>
        ))}
      </div>

      {/* Comments drawer */}
      {showComments && (
        <CommentsDrawer videoId={MOCK_VIDEOS[currentVideoIndex]?.id} />
      )}
    </div>
  )
}
