/**
 * LiveGiftTicker — real-time gift overlay during live streams.
 *
 * Connects to the WebSocket, listens for 'gift' events on the stream room,
 * and renders floating gift cards that stack + auto-dismiss.
 *
 * Also shows a top-gifter leaderboard sidebar that updates live.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Trophy, X } from 'lucide-react'
import clsx from 'clsx'
import { GIFTS } from './GiftPanel'
import { LIVE_SERVER_HTTP } from '../api/liveServer'

const WS_URL = LIVE_SERVER_HTTP.replace('https://', 'wss://').replace('http://', 'ws://')

// Max gift cards shown at once before older ones pop off
const MAX_VISIBLE = 5

// Auto-dismiss each card after N ms
const DISMISS_MS = 4000

export function useLiveGifts(streamKey) {
  const [gifts, setGifts]   = useState([])   // { id, giftId, qty, totalCoins, senderHandle, ts }
  const [leaderboard, setLeaderboard] = useState([])
  const wsRef = useRef(null)

  const addGift = useCallback((event) => {
    const entry = { ...event, id: `${Date.now()}-${Math.random()}` }
    setGifts(prev => [...prev, entry].slice(-MAX_VISIBLE))

    // Update live leaderboard
    setLeaderboard(prev => {
      const existing = prev.find(r => r.handle === event.senderHandle)
      if (existing) {
        return prev
          .map(r => r.handle === event.senderHandle
            ? { ...r, total: r.total + event.totalCoins, count: r.count + 1 }
            : r)
          .sort((a, b) => b.total - a.total)
      }
      return [...prev, { handle: event.senderHandle, total: event.totalCoins, count: 1 }]
        .sort((a, b) => b.total - a.total)
        .slice(0, 10)
    })

    // Auto-dismiss
    setTimeout(() => {
      setGifts(prev => prev.filter(g => g.id !== entry.id))
    }, DISMISS_MS)
  }, [])

  const dismiss = useCallback((id) => {
    setGifts(prev => prev.filter(g => g.id !== id))
  }, [])

  useEffect(() => {
    if (!streamKey) return

    const ws = new WebSocket(`${WS_URL}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', streamKey }))
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'gift') addGift(msg)
      } catch {}
    }

    ws.onclose = () => {
      // Reconnect after 3s if still mounted
      setTimeout(() => {
        if (wsRef.current === ws) {
          // will be cleaned up by next effect
        }
      }, 3000)
    }

    return () => {
      ws.send(JSON.stringify({ type: 'leave' }))
      ws.close()
    }
  }, [streamKey, addGift])

  return { gifts, leaderboard, dismiss }
}

// ── Individual gift toast card ─────────────────────────────────────────────────
function GiftToast({ gift, onDismiss }) {
  const giftDef = GIFTS.find(g => g.id === gift.giftId)
  const qty = gift.qty || 1

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-2xl animate-slide-up"
      style={{
        background: `linear-gradient(135deg, ${giftDef?.color || '#9B59FF'}22, rgba(13,13,24,0.95))`,
        border: `1px solid ${giftDef?.color || '#9B59FF'}50`,
        backdropFilter: 'blur(12px)',
        boxShadow: `0 4px 24px ${giftDef?.color || '#9B59FF'}30`,
      }}
    >
      {giftDef
        ? <img src={giftDef.img} alt={giftDef.name} className="w-10 h-10 flex-shrink-0" />
        : <span className="text-2xl">🎁</span>
      }
      <div className="flex-1 min-w-0">
        <p className="text-white font-black text-sm leading-tight">
          {gift.senderHandle}
          <span className="text-white/50 font-normal"> sent </span>
          {qty > 1 && <span className="font-black" style={{ color: giftDef?.color }}>{qty}× </span>}
          <span style={{ color: giftDef?.color }}>{giftDef?.name || gift.giftId}</span>
        </p>
        <p className="text-white/40 text-xs">{gift.totalCoins.toLocaleString()} 🪙</p>
      </div>
      <button onClick={() => onDismiss(gift.id)} className="p-1 text-white/30 hover:text-white/60">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ── Gift ticker overlay (position over video player bottom-left) ───────────────
export function GiftTickerOverlay({ streamKey }) {
  const { gifts, dismiss } = useLiveGifts(streamKey)

  if (gifts.length === 0) return null

  return (
    <div className="absolute bottom-24 left-3 right-16 z-30 flex flex-col gap-2 pointer-events-none">
      {gifts.map(g => (
        <div key={g.id} className="pointer-events-auto">
          <GiftToast gift={g} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  )
}

// ── Live leaderboard panel (shown on stream page) ──────────────────────────────
export function LiveLeaderboard({ streamKey, onClose }) {
  const { leaderboard } = useLiveGifts(streamKey)
  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full rounded-t-3xl overflow-hidden animate-slide-up"
        style={{ background: '#0d0d18', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}>

        <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg,#FFD700,#FF9A56)' }} />
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-white/20" /></div>
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full"
          style={{ background: 'rgba(255,255,255,0.07)' }}>
          <X className="w-4 h-4 text-white/50" />
        </button>

        <div className="px-5 pb-8 pt-2">
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="w-5 h-5 text-yellow-400" />
            <span className="text-white font-black text-lg">Top Gifters</span>
            <span className="text-white/30 text-xs ml-auto">Live · updates in real-time</span>
          </div>
          <p className="text-white/30 text-xs mb-4">This stream only</p>

          {leaderboard.length === 0 ? (
            <p className="text-white/20 text-sm text-center py-6">
              No gifts yet — be the first! 🎁
            </p>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((row, i) => (
                <div key={row.handle}
                  className="flex items-center gap-3 p-3 rounded-2xl transition-all"
                  style={{ background: i === 0 ? 'rgba(255,215,0,0.08)' : 'rgba(255,255,255,0.04)' }}>
                  <span className="text-xl w-7 text-center flex-shrink-0">
                    {medals[i] || `#${i + 1}`}
                  </span>
                  <span className="text-white font-bold flex-1 truncate">{row.handle}</span>
                  <div className="text-right">
                    <p className="text-yellow-300 font-black text-sm">{row.total.toLocaleString()}🪙</p>
                    <p className="text-white/30 text-[10px]">{row.count} {row.count === 1 ? 'gift' : 'gifts'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Trophy button (shown in stream UI to open leaderboard) ─────────────────────
export function LeaderboardTrigger({ onOpen, count }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onOpen() }}
      className="flex flex-col items-center gap-1"
      title="Top gifters"
    >
      <div className="w-10 h-10 rounded-full flex items-center justify-center relative"
        style={{ background: 'rgba(255,215,0,0.15)', border: '1.5px solid rgba(255,215,0,0.4)' }}>
        <Trophy className="w-5 h-5 text-yellow-400" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 text-[9px] font-black bg-yellow-400 text-black rounded-full w-4 h-4 flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </div>
      <span className="text-[10px] font-bold text-yellow-400">Top</span>
    </button>
  )
}
