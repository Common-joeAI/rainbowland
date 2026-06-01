import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Heart, MessageCircle, Share2, Music2, Volume2, VolumeX, ExternalLink } from 'lucide-react'
import { useStore } from '../hooks/useStore'
import { formatCount } from '../api/mockData'
import { loudmanArtistUrl } from '../api/loudman'
import clsx from 'clsx'

export default function VideoCard({ video, isActive }) {
  const videoRef = useRef(null)
  const { toggleLike, isLiked, setShowComments, isMuted, toggleMute, setTab } = useStore()
  const liked = isLiked(video.id)
  const [localLikes, setLocalLikes] = useState(video.likes)
  const [showHeart, setShowHeart] = useState(false)
  const [doubleTapTimer, setDoubleTapTimer] = useState(null)

  // Play/pause based on visibility
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (isActive) {
      el.play().catch(() => {})
    } else {
      el.pause()
      el.currentTime = 0
    }
  }, [isActive])

  // Sync mute
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = isMuted
  }, [isMuted])

  const handleLike = useCallback(() => {
    toggleLike(video.id)
    setLocalLikes(n => liked ? n - 1 : n + 1)
    if (!liked) {
      setShowHeart(true)
      setTimeout(() => setShowHeart(false), 900)
    }
  }, [liked, toggleLike, video.id])

  // Double-tap to like
  const handleTap = useCallback(() => {
    if (doubleTapTimer) {
      clearTimeout(doubleTapTimer)
      setDoubleTapTimer(null)
      handleLike()
    } else {
      const t = setTimeout(() => setDoubleTapTimer(null), 300)
      setDoubleTapTimer(t)
    }
  }, [doubleTapTimer, handleLike])

  return (
    <div className="feed-item bg-dark-900 relative overflow-hidden" onClick={handleTap}>
      {/* Video */}
      <video
        ref={videoRef}
        src={video.videoUrl}
        className="absolute inset-0 w-full h-full object-cover"
        loop
        playsInline
        muted={isMuted}
        preload="metadata"
      />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />

      {/* Double-tap heart flash */}
      {showHeart && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <Heart className="w-28 h-28 text-red-500 fill-red-500 animate-ping opacity-80" />
        </div>
      )}

      {/* Mute toggle (top right) */}
      <button
        className="absolute top-16 right-4 z-10 p-2 glass rounded-full"
        onClick={e => { e.stopPropagation(); toggleMute() }}
      >
        {isMuted
          ? <VolumeX className="w-5 h-5 text-white/80" />
          : <Volume2 className="w-5 h-5 text-white/80" />}
      </button>

      {/* Right-side action buttons */}
      <div className="absolute right-3 bottom-28 z-10 flex flex-col items-center gap-5" onClick={e => e.stopPropagation()}>
        {/* Creator avatar */}
        <div className="relative">
          <div className="rainbow-border rounded-full p-0.5">
            <div className="w-12 h-12 rounded-full bg-dark-600 flex items-center justify-center text-2xl">
              {video.creator.avatar}
            </div>
          </div>
          <button className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-5 bg-gradient-to-r from-rainbow-pink to-rainbow-purple rounded-full flex items-center justify-center text-xs font-bold">+</button>
        </div>

        {/* Like */}
        <div className="flex flex-col items-center gap-1">
          <button onClick={handleLike} className="p-1">
            <Heart className={clsx('w-8 h-8 transition-all duration-200',
              liked ? 'text-red-500 fill-red-500 scale-110' : 'text-white')} />
          </button>
          <span className="text-white text-xs font-semibold">{formatCount(localLikes)}</span>
        </div>

        {/* Comment */}
        <div className="flex flex-col items-center gap-1">
          <button onClick={() => setShowComments(true)} className="p-1">
            <MessageCircle className="w-8 h-8 text-white" />
          </button>
          <span className="text-white text-xs font-semibold">{formatCount(video.comments)}</span>
        </div>

        {/* Share */}
        <div className="flex flex-col items-center gap-1">
          <button className="p-1">
            <Share2 className="w-8 h-8 text-white" />
          </button>
          <span className="text-white text-xs font-semibold">{formatCount(video.shares)}</span>
        </div>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-20 left-4 right-16 z-10">
        {/* Creator name */}
        <div className="flex items-center gap-2 mb-1">
          <span className="font-bold text-white text-base">{video.creator.name}</span>
          {video.creator.verified && (
            <span className="text-xs bg-gradient-to-r from-rainbow-blue to-rainbow-purple px-1.5 py-0.5 rounded-full text-white font-semibold">✓</span>
          )}
          <span className="text-white/50 text-xs">{video.creator.pronouns}</span>
        </div>

        {/* Caption */}
        <p className="text-white/90 text-sm mb-2 leading-snug line-clamp-2">{video.caption}</p>

        {/* Hashtags */}
        <div className="flex flex-wrap gap-1 mb-2">
          {video.hashtags.slice(0, 3).map(tag => (
            <span key={tag} className="text-rainbow-blue text-xs font-medium">{tag}</span>
          ))}
        </div>

        {/* Music strip — Loudman integration */}
        <a
          href={loudmanArtistUrl(video.music.loudmanHandle)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="flex items-center gap-2 glass rounded-full px-3 py-1.5 w-fit"
        >
          <Music2 className="w-4 h-4 text-rainbow-yellow animate-spin" style={{ animationDuration: '3s' }} />
          <span className="text-white text-xs truncate max-w-[160px]">{video.music.title} · {video.music.artist}</span>
          <ExternalLink className="w-3 h-3 text-white/40 flex-shrink-0" />
        </a>
      </div>

      {/* Pride strip at very bottom */}
      <div className="absolute bottom-16 left-0 right-0 pride-strip z-10" />
    </div>
  )
}
