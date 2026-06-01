/**
 * GiftPanel — virtual gifting system for Rainbow Land.
 *
 * Economy model (zero infra cost):
 *  - Viewers hold a "rainbow coin" balance stored locally (Zustand persist)
 *  - Buying coins opens a PayPal.me link — PayPal handles payment, we handle nothing server-side
 *  - Sending a gift deducts coins locally and fires an animated overlay on the video
 *  - Creators see gifted coins in their balance; cash-out also opens PayPal.me
 *  - Exchange rate: 100 coins = $1 USD  (viewer pays ~$1.10 after PayPal fee)
 */
import React, { useState, useEffect, useRef } from 'react'
import { Gift, Coins, X, ShoppingBag, Zap, ChevronRight } from 'lucide-react'
import clsx from 'clsx'

// ── Gift catalogue ───────────────────────────────────────────────────────────
export const GIFTS = [
  { id: 'rose',      emoji: '🌹', name: 'Rose',         coins: 5,    color: '#FF4B6E' },
  { id: 'rainbow',   emoji: '🌈', name: 'Rainbow',      coins: 20,   color: '#9B59FF' },
  { id: 'sparkle',   emoji: '✨', name: 'Sparkles',     coins: 50,   color: '#FFD700' },
  { id: 'crown',     emoji: '👑', name: 'Crown',        coins: 100,  color: '#FFB800' },
  { id: 'heart',     emoji: '💜', name: 'Purple Heart', coins: 200,  color: '#9B59FF' },
  { id: 'rocket',    emoji: '🚀', name: 'Rocket',       coins: 500,  color: '#00C3FF' },
  { id: 'diamond',   emoji: '💎', name: 'Diamond',      coins: 1000, color: '#A8EFFF' },
  { id: 'galaxy',    emoji: '🌌', name: 'Galaxy',       coins: 5000, color: '#FF6FD8' },
]

// ── Coin packs — opens PayPal.me; 100 coins = $1 ────────────────────────────
const COIN_PACKS = [
  { coins: 100,  price: '$0.99',  label: 'Starter',  emoji: '💫', popular: false },
  { coins: 500,  price: '$4.99',  label: 'Boost',    emoji: '⚡', popular: true  },
  { coins: 1200, price: '$9.99',  label: 'Super',    emoji: '🌈', popular: false },
  { coins: 5000, price: '$39.99', label: 'Elite',    emoji: '👑', popular: false },
]

const PAYPAL_ME = 'https://paypal.me/josephbennett99'

function openExternal(url) {
  if (window.electronAPI?.invoke) {
    window.electronAPI.invoke('shell:openExternal', url)
  } else {
    window.open(url, '_blank', 'noopener')
  }
}

// ── Flying gift animation overlay ────────────────────────────────────────────
export function GiftFlyAnimation({ gift, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2400)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
      <div className="flex flex-col items-center animate-gift-fly">
        <span className="text-7xl drop-shadow-lg">{gift.emoji}</span>
        <span className="mt-2 text-white font-black text-lg drop-shadow-lg">{gift.name}!</span>
        <span className="text-white/60 text-sm">−{gift.coins} coins</span>
      </div>
    </div>
  )
}

// ── Coin balance badge (shown in video right-side actions) ────────────────────
export function CoinBadge({ coins, onOpenShop }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onOpenShop() }}
      className="flex flex-col items-center gap-1"
      title="Your coin balance — tap to buy more"
    >
      <div className="w-10 h-10 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(255,215,0,0.15)', border: '1.5px solid rgba(255,215,0,0.4)' }}>
        <span className="text-lg">🪙</span>
      </div>
      <span className="text-[10px] font-bold text-yellow-300">{coins >= 1000 ? `${(coins/1000).toFixed(1)}k` : coins}</span>
    </button>
  )
}

// ── Gift trigger button (shown per-video) ─────────────────────────────────────
export function GiftTrigger({ onOpen }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onOpen() }}
      className="flex flex-col items-center gap-1"
      title="Send a gift 🎁"
    >
      <div className="w-10 h-10 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(155,89,255,0.15)', border: '1.5px solid rgba(155,89,255,0.5)' }}>
        <Gift className="w-5 h-5 text-purple-400" />
      </div>
      <span className="text-[10px] font-bold text-purple-400">Gift</span>
    </button>
  )
}

// ── Coin Shop bottom sheet ────────────────────────────────────────────────────
export function CoinShop({ onClose, onBought }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full rounded-t-3xl overflow-hidden"
        style={{ background: '#0d0d18', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}>

        <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg,#FFD700,#FF9A56,#9B59FF)' }} />
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full"
          style={{ background: 'rgba(255,255,255,0.07)' }}>
          <X className="w-4 h-4 text-white/50" />
        </button>

        <div className="px-5 pb-8 pt-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🪙</span>
            <span className="text-white font-black text-xl">Get Rainbow Coins</span>
          </div>
          <p className="text-white/40 text-xs mb-5">100 coins = $1 · Goes directly to creators you love</p>

          <div className="grid grid-cols-2 gap-3 mb-4">
            {COIN_PACKS.map(pack => (
              <button key={pack.coins}
                onClick={() => {
                  openExternal(`${PAYPAL_ME}/${parseFloat(pack.price.replace('$',''))}`)
                  // Optimistically credit coins (honor system until we add backend)
                  onBought(pack.coins)
                  onClose()
                }}
                className={clsx(
                  'relative flex flex-col items-center gap-1.5 py-4 rounded-2xl border transition-all active:scale-95',
                  pack.popular
                    ? 'border-yellow-400/60'
                    : 'border-white/8'
                )}
                style={{ background: pack.popular ? 'rgba(255,215,0,0.08)' : 'rgba(255,255,255,0.04)' }}>
                {pack.popular && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-black px-2 py-0.5 rounded-full"
                    style={{ background: '#FFD700', color: '#000' }}>POPULAR</span>
                )}
                <span className="text-3xl">{pack.emoji}</span>
                <span className="text-white font-black text-base">{pack.coins.toLocaleString()} coins</span>
                <span className="text-yellow-400 font-bold text-sm">{pack.price}</span>
                <span className="text-white/30 text-[10px]">{pack.label}</span>
              </button>
            ))}
          </div>
          <p className="text-white/20 text-[11px] text-center">
            Secure checkout via PayPal · Rainbow Land takes 0% fee
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Main Gift Sheet ───────────────────────────────────────────────────────────
export default function GiftSheet({ creator, coinBalance, onSend, onOpenShop, onClose }) {
  const [selected, setSelected]   = useState(null)
  const [sent, setSent]           = useState(false)
  const [qty, setQty]             = useState(1)

  const gift = selected ? GIFTS.find(g => g.id === selected) : null
  const totalCost = gift ? gift.coins * qty : 0
  const canAfford = coinBalance >= totalCost
  const canSend = gift && canAfford

  const handleSend = () => {
    if (!canSend) return
    onSend(gift, qty)
    setSent(true)
    setTimeout(() => {
      setSent(false)
      onClose()
    }, 1600)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full rounded-t-3xl overflow-hidden"
        style={{ background: '#0d0d18', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}>

        <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg,#FF4B6E,#9B59FF,#00C3FF)' }} />
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full"
          style={{ background: 'rgba(255,255,255,0.07)' }}>
          <X className="w-4 h-4 text-white/50" />
        </button>

        <div className="px-5 pb-7 pt-2">

          {sent ? (
            <div className="flex flex-col items-center py-8 text-center">
              <span className="text-6xl mb-3">{gift?.emoji}</span>
              <p className="text-white font-black text-xl mb-1">Gift sent! 🎉</p>
              <p className="text-white/40 text-sm">You just made {creator?.name}'s day 💜</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-white font-black text-lg">Send a Gift</p>
                  <p className="text-white/40 text-xs">to {creator?.name || 'this creator'}</p>
                </div>
                {/* Coin balance */}
                <button onClick={() => { onClose(); onOpenShop() }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                  style={{ background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)' }}>
                  <span className="text-sm">🪙</span>
                  <span className="text-yellow-300 font-black text-sm">{coinBalance.toLocaleString()}</span>
                  <ChevronRight className="w-3 h-3 text-yellow-400/60" />
                </button>
              </div>

              {/* Gift grid */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                {GIFTS.map(g => (
                  <button key={g.id}
                    onClick={() => setSelected(g.id)}
                    className={clsx(
                      'flex flex-col items-center gap-1 py-3 rounded-2xl border transition-all',
                      selected === g.id ? 'scale-105 border-2' : 'border-white/8'
                    )}
                    style={{
                      background:  selected === g.id ? `${g.color}20` : 'rgba(255,255,255,0.04)',
                      borderColor: selected === g.id ? g.color : 'rgba(255,255,255,0.08)',
                    }}>
                    <span className="text-2xl">{g.emoji}</span>
                    <span className="text-white font-bold text-[10px]">{g.coins}🪙</span>
                  </button>
                ))}
              </div>

              {/* Qty picker (only show for cheaper gifts) */}
              {gift && gift.coins <= 200 && (
                <div className="flex items-center justify-center gap-4 mb-4">
                  <button onClick={() => setQty(q => Math.max(1, q - 1))}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-black"
                    style={{ background: 'rgba(255,255,255,0.08)' }}>−</button>
                  <span className="text-white font-black text-lg w-8 text-center">{qty}</span>
                  <button onClick={() => setQty(q => Math.min(99, q + 1))}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-black"
                    style={{ background: 'rgba(255,255,255,0.08)' }}>+</button>
                </div>
              )}

              {/* Send button */}
              <button onClick={handleSend} disabled={!canSend}
                className={clsx(
                  'w-full py-4 rounded-2xl font-black text-white text-base transition-all flex items-center justify-center gap-2',
                  canSend ? 'active:scale-95' : 'opacity-40 cursor-not-allowed'
                )}
                style={{
                  background: canSend
                    ? `linear-gradient(135deg, ${gift?.color || '#9B59FF'}, #FF4B6E)`
                    : 'rgba(255,255,255,0.08)',
                  boxShadow: canSend ? `0 8px 32px ${gift?.color || '#9B59FF'}40` : 'none',
                }}>
                <Gift className="w-5 h-5" />
                {!gift
                  ? 'Pick a gift above'
                  : !canAfford
                  ? `Need ${(totalCost - coinBalance).toLocaleString()} more coins`
                  : `Send ${qty > 1 ? `${qty}× ` : ''}${gift.emoji} for ${totalCost.toLocaleString()}🪙`}
              </button>

              {!canAfford && gift && (
                <button onClick={() => { onClose(); onOpenShop() }}
                  className="w-full mt-2 py-2.5 rounded-2xl text-sm font-bold text-yellow-300 transition-all active:scale-95"
                  style={{ background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.25)' }}>
                  🪙 Get more coins
                </button>
              )}

              <p className="text-white/20 text-[11px] text-center mt-3">
                100% of coins go to the creator · Tap 🪙 to top up
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
