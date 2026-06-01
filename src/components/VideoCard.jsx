import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Heart, MessageCircle, Share2, Music2, Volume2, VolumeX, ExternalLink, Disc3 } from 'lucide-react'
import MutualAidSheet, { MutualAidTrigger, MUTUAL_AID_TAGS, pickOrg } from './MutualAidButton'
import GiftSheet, { GiftTrigger, CoinBadge, CoinShop, GiftFlyAnimation } from './GiftPanel'
import { useStore } from '../hooks/useStore'
import { formatCount, PRIDE_FLAGS } from '../api/mockData'
import { loudmanArtistUrl } from '../api/loudman'
import clsx from 'clsx'

export default function VideoCard({ video, isActive }) {
  const videoRef = useRef(null)
  const audioRef = useRef(null)
  const { toggleLike, isLiked, setShowComments, setActiveVideoId, isMuted, toggleMute } = useStore()
  const liked = isLiked(video.id)
  const [localLikes, setLocalLikes] = useState(video.likes)
  const [showHeart, setShowHeart] = useState(false)
  const [doubleTapTimer, setDoubleTapTimer] = useState(null)

  const isAudio = video.type === 'audio'

  // Mutual Aid — show button if video has relevant tags
  const videoTags = (video.hashtags || []).map(t => t.toLowerCase().replace('#',''))
  const hasMutualAidTag = videoTags.some(t => MUTUAL_AID_TAGS.includes(t))
  const mutualAidOrg = hasMutualAidTag ? pickOrg(video.hashtags) : null
  const [showMutualAid, setShowMutualAid] = useState(false)

  // Gift state
  const [showGift, setShowGift]         = useState(false)
  const [showCoinShop, setShowCoinShop] = useState(false)
  const [flyingGift, setFlyingGift]     = useState(null)

  const handleGiftSuccess = (gift, qty) => {
    setFlyingGift(gift)
  }

  // Play/pause video based on visibility
  useEffect(() => {
    if (isAudio) return
    const el = videoRef.current
    if (!el) return
    if (isActive) {
      el.play().catch(() => {})
    } else {
      el.pause()
      el.currentTime = 0
    }
  }, [isActive, isAudio])

  // Play/pause audio based on visibility
  useEffect(() => {
    if (!isAudio) return
    const el = audioRef.current
    if (!el) return
    if (isActive) {
      el.play().catch(() => {})
    } else {
      el.pause()
      el.currentTime = 0
    }
  }, [isActive, isAudio])

  // Sync mute for video
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = isMuted
  }, [isMuted])

  // Sync mute for audio
  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = isMuted
  }, [isMuted])

  const handleLike = useCallback(() => {
    toggleLike(video.id)
    setLocalLikes(n => liked ? n - 1 : n + 1)
    if (!liked) {
      setShowHeart(true)
      setTimeout(() => setShowHeart(false), 900)
    }
  }, [liked, toggleLike, video.id])

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

      {/* ── MEDIA LAYER ───────────────────────────────────────── */}
      {isAudio ? (
        <>
          {/* Cover art background */}
          <div className="absolute inset-0">
            {video.music?.coverArt ? (
              <img
                src={video.music.coverArt}
                alt="Cover art"
                className="w-full h-full object-cover"
              />
            ) : (
              /* Fallback gradient when no cover art */
              <div className="w-full h-full bg-gradient-to-br from-rainbow-purple via-rainbow-pink to-rainbow-orange" />
            )}
            {/* Darken so text is readable */}
            <div className="absolute inset-0 bg-black/50" />
          </div>

          {/* Spinning disc in center */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className={clsx(
              "w-40 h-40 rounded-full shadow-2xl border-4 border-white/10 flex items-center justify-center",
              isActive ? "animate-spin" : ""
            )} style={{ animationDuration: '4s' }}>
              {video.music?.coverArt ? (
                <img
                  src={video.music.coverArt}
                  alt="Disc"
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <Disc3 className="w-24 h-24 text-white/60" />
              )}
            </div>
            {/* Center hole */}
            <div className="absolute w-6 h-6 rounded-full bg-dark-900 border-2 border-white/20" />
          </div>

          {/* Hidden audio element — src would be Loudman stream URL in production */}
          <audio
            ref={audioRef}
            src={video.audioUrl || ''}
            loop
            muted={isMuted}
            preload="none"
          />
        </>
      ) : (
        <video
          ref={videoRef}
          src={video.videoUrl}
          className="absolute inset-0 w-full h-full object-cover"
          loop
          playsInline
          muted={isMuted}
          preload="metadata"
        />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />

      {/* Double-tap heart flash */}
      {showHeart && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <Heart className="w-28 h-28 text-red-500 fill-red-500 animate-ping opacity-80" />
        </div>
      )}

      {/* Mute toggle */}
      <button
        className="absolute top-16 right-4 z-10 p-2 glass rounded-full"
        onClick={e => { e.stopPropagation(); toggleMute() }}
      >
        {isMuted
          ? <VolumeX className="w-5 h-5 text-white/80" />
          : <Volume2 className="w-5 h-5 text-white/80" />}
      </button>

      {/* Audio badge */}
      {isAudio && (
        <div className="absolute top-16 left-4 z-10 flex items-center gap-1.5 glass rounded-full px-3 py-1">
          <Music2 className="w-3.5 h-3.5 text-rainbow-yellow" />
          <span className="text-white/80 text-xs font-medium">Audio</span>
        </div>
      )}

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
          <button onClick={(e) => { e.stopPropagation(); setActiveVideoId(video.id); setShowComments(true); }} className="p-1">
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

        {/* Mutual Aid — only shows on tagged videos */}
        {hasMutualAidTag && mutualAidOrg && (
          <MutualAidTrigger
            color={mutualAidOrg.color}
            onOpen={() => { setShowMutualAid(true) }}
          />
        )}

        {/* Gift button */}
        <GiftTrigger onOpen={() => setShowGift(true)} />

        {/* Coin balance badge */}
        <CoinBadge coins={coinBalance} onOpenShop={() => setShowCoinShop(true)} />
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-20 left-4 right-16 z-10">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-bold text-white text-base">{video.creator.name}</span>
          {video.creator.verified && (
            <span className="text-xs bg-gradient-to-r from-rainbow-blue to-rainbow-purple px-1.5 py-0.5 rounded-full text-white font-semibold">✓</span>
          )}
          {/* Pronoun badge */}
          {video.creator.pronouns && (
            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}>
              {video.creator.pronouns}
            </span>
          )}
          {/* Pride flag stripe badge */}
          {video.creator.prideFlag && PRIDE_FLAGS[video.creator.prideFlag] && (
            <span
              title={video.creator.prideFlag}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium overflow-hidden"
              style={{
                background: `linear-gradient(90deg, ${PRIDE_FLAGS[video.creator.prideFlag].colors.join(',')})`,
                color: '#fff',
                textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                fontWeight: 700,
                fontSize: 10,
              }}
            >
              {PRIDE_FLAGS[video.creator.prideFlag].emoji}
            </span>
          )}
        </div>

        <p className="text-white/90 text-sm mb-2 leading-snug line-clamp-2">{video.caption}</p>

        <div className="flex flex-wrap gap-1 mb-2">
          {(video.hashtags || video.tags || []).slice(0, 3).map(tag => (
            <span key={tag} className="text-rainbow-blue text-xs font-medium">{tag}</span>
          ))}
        </div>

        {/* Music strip */}
        {video.music && (
          <a
            href={loudmanArtistUrl(video.music?.loudmanHandle)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-2 glass rounded-full px-3 py-1.5 w-fit"
          >
            <Music2 className={clsx('w-4 h-4 text-rainbow-yellow', isActive && 'animate-spin')} style={{ animationDuration: '3s' }} />
            <span className="text-white text-xs truncate max-w-[160px]">{video.music?.title || 'Unknown'} · {video.music?.artist || ''}</span>
            <ExternalLink className="w-3 h-3 text-white/40 flex-shrink-0" />
          </a>
        )}
      </div>

      {/* Pride strip */}
      <div className="absolute bottom-16 left-0 right-0 pride-strip z-10" />

      {/* Mutual Aid donation sheet */}
      {showMutualAid && mutualAidOrg && (
        <MutualAidSheet org={mutualAidOrg} onClose={() => setShowMutualAid(false)} />
      )}

      {/* Gift sheet */}
      {showGift && (
        <GiftSheet
          creator={video.creator}
          streamKey={null}
          onSendSuccess={handleGiftSuccess}
          onOpenShop={() => { setShowGift(false); setShowCoinShop(true) }}
          onClose={() => setShowGift(false)}
        />
      )}

      {/* Coin shop */}
      {showCoinShop && (
        <CoinShop onClose={() => setShowCoinShop(false)} />
      )}

      {/* Flying gift animation */}
      {flyingGift && (
        <GiftFlyAnimation gift={flyingGift} onDone={() => setFlyingGift(null)} />
      )}
    </div>
  )
}
