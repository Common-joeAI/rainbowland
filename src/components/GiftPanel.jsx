/**
 * GiftPanel — server-backed virtual gifting system.
 *
 * All coin state lives on live.rainbowland.cc (SQLite via coins.js).
 * No honor system — gifts are atomic DB transactions.
 * PayPal IPN verifies purchases before coins are credited.
 * 1 coin sent = 1 coin received. Always.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Gift, X, ChevronRight, Trophy, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import {
  fetchBalance, fetchCoinPacks, buildPayPalUrl,
  sendGift as apiSendGift, fetchLeaderboard, getUserId, onBalanceUpdate,
} from '../api/coins'

// ── Gift catalogue (must match server GIFT_CATALOGUE in coins.js) ─────────────
export const GIFTS = [
  { id: 'rose',    name: 'Rose',         coins: 5,    color: '#FF4B6E', img: new URL('../assets/gifts/rose.svg',    import.meta.url).href },
  { id: 'rainbow', name: 'Rainbow',      coins: 20,   color: '#9B59FF', img: new URL('../assets/gifts/rainbow.svg', import.meta.url).href },
  { id: 'sparkle', name: 'Sparkles',     coins: 50,   color: '#FFD700', img: new URL('../assets/gifts/sparkle.svg', import.meta.url).href },
  { id: 'crown',   name: 'Crown',        coins: 100,  color: '#FFB800', img: new URL('../assets/gifts/crown.svg',   import.meta.url).href },
  { id: 'heart',   name: 'Purple Heart', coins: 200,  color: '#9B59FF', img: new URL('../assets/gifts/heart.svg',   import.meta.url).href },
  { id: 'rocket',  name: 'Rocket',       coins: 500,  color: '#00C3FF', img: new URL('../assets/gifts/rocket.svg',  import.meta.url).href },
  { id: 'diamond', name: 'Diamond',      coins: 1000, color: '#A8EFFF', img: new URL('../assets/gifts/diamond.svg', import.meta.url).href },
  { id: 'galaxy',  name: 'Galaxy',       coins: 5000, color: '#FF6FD8', img: new URL('../assets/gifts/galaxy.svg',  import.meta.url).href },
]

// ── Flying gift animation overlay ─────────────────────────────────────────────
export function GiftFlyAnimation({ gift, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2400)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
      <div className="flex flex-col items-center animate-gift-fly">
        <img src={gift.img} alt={gift.name} className="w-24 h-24 drop-shadow-2xl" />
        <span className="mt-2 text-white font-black text-lg drop-shadow-lg">{gift.name}!</span>
        <span className="text-white/60 text-sm">−{gift.coins} coins</span>
      </div>
    </div>
  )
}

// ── Coin balance badge ─────────────────────────────────────────────────────────
export function CoinBadge({ onOpenShop }) {
  const [balance, setBalance] = useState(null)

  useEffect(() => {
    fetchBalance().then(b => setBalance(b.balance)).catch(() => setBalance(0))
    const unsub = onBalanceUpdate((newBal) => setBalance(newBal))
    return unsub
  }, [])

  return (
    <button
      onClick={e => { e.stopPropagation(); onOpenShop() }}
      className="flex flex-col items-center gap-1"
      title="Your coins — tap to buy more"
    >
      <div className="w-10 h-10 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(255,215,0,0.15)', border: '1.5px solid rgba(255,215,0,0.4)' }}>
        <span className="text-lg">🪙</span>
      </div>
      <span className="text-[10px] font-bold text-yellow-300">
        {balance === null ? '…' : balance >= 1000 ? `${(balance/1000).toFixed(1)}k` : balance}
      </span>
    </button>
  )
}

// ── Gift trigger button ────────────────────────────────────────────────────────
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

function openExternal(url) {
  if (window.electronAPI?.invoke) {
    window.electronAPI.invoke('shell:openExternal', url)
  } else {
    window.open(url, '_blank', 'noopener')
  }
}

// ── Coin Shop ──────────────────────────────────────────────────────────────────
export function CoinShop({ onClose }) {
  const [packs, setPacks]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [pending, setPending]   = useState(null) // packIndex user just tapped

  useEffect(() => {
    fetchCoinPacks()
      .then(setPacks)
      .catch(() => setPacks([
        { coins: 100,  usd_cents: 99,   label: 'Starter', emoji: '💫' },
        { coins: 500,  usd_cents: 499,  label: 'Boost',   emoji: '⚡', popular: true },
        { coins: 1200, usd_cents: 999,  label: 'Super',   emoji: '🌈' },
        { coins: 5000, usd_cents: 3999, label: 'Elite',   emoji: '👑' },
      ]))
      .finally(() => setLoading(false))
  }, [])

  const handleBuy = (i, pack) => {
    setPending(i)
    const url = buildPayPalUrl(i, pack)
    openExternal(url)
    // Show "waiting" state — coins will arrive via IPN + WebSocket push
    setTimeout(() => {
      setPending(null)
      onClose()
    }, 3000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full rounded-t-3xl overflow-hidden animate-slide-up"
        style={{ background: '#0d0d18', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}>
        <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg,#FFD700,#FF9A56,#9B59FF)' }} />
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-white/20" /></div>
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }}>
          <X className="w-4 h-4 text-white/50" />
        </button>
        <div className="px-5 pb-8 pt-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🪙</span>
            <span className="text-white font-black text-xl">Get Rainbow Coins</span>
          </div>
          <p className="text-white/40 text-xs mb-5">
            100 coins = $1 · Coins are credited instantly after PayPal confirms
          </p>

          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 text-purple-400 animate-spin" /></div>
          ) : (
            <div className="grid grid-cols-2 gap-3 mb-4">
              {packs.map((pack, i) => (
                <button key={i}
                  onClick={() => handleBuy(i, pack)}
                  disabled={pending !== null}
                  className={clsx(
                    'relative flex flex-col items-center gap-1.5 py-4 rounded-2xl border transition-all active:scale-95',
                    pack.popular ? 'border-yellow-400/60' : 'border-white/8'
                  )}
                  style={{ background: pack.popular ? 'rgba(255,215,0,0.08)' : 'rgba(255,255,255,0.04)' }}>
                  {pack.popular && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-black px-2 py-0.5 rounded-full"
                      style={{ background: '#FFD700', color: '#000' }}>POPULAR</span>
                  )}
                  {pending === i
                    ? <Loader2 className="w-7 h-7 text-yellow-400 animate-spin" />
                    : <span className="text-3xl">{pack.emoji || '🪙'}</span>
                  }
                  <span className="text-white font-black text-base">{pack.coins.toLocaleString()} coins</span>
                  <span className="text-yellow-400 font-bold text-sm">${(pack.usd_cents / 100).toFixed(2)}</span>
                  <span className="text-white/30 text-[10px]">{pack.label}</span>
                </button>
              ))}
            </div>
          )}
          {pending !== null && (
            <p className="text-yellow-300/80 text-xs text-center mb-3 animate-pulse">
              Waiting for PayPal to confirm… coins will appear automatically 🪙
            </p>
          )}
          <p className="text-white/20 text-[11px] text-center">
            Secure checkout via PayPal · Coins credited after payment confirms · No hidden fees
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Top Gifters leaderboard ────────────────────────────────────────────────────
export function GiftLeaderboard({ creatorId, onClose }) {
  const [top, setTop]       = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchLeaderboard(creatorId).then(setTop).finally(() => setLoading(false))
  }, [creatorId])

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full rounded-t-3xl overflow-hidden animate-slide-up"
        style={{ background: '#0d0d18', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}>
        <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg,#FFD700,#FF9A56)' }} />
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-white/20" /></div>
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }}>
          <X className="w-4 h-4 text-white/50" />
        </button>
        <div className="px-5 pb-8 pt-2">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-5 h-5 text-yellow-400" />
            <span className="text-white font-black text-lg">Top Gifters</span>
          </div>
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 text-yellow-400 animate-spin" /></div>
          ) : top.length === 0 ? (
            <p className="text-white/30 text-center py-4 text-sm">No gifts yet — be the first! 🎁</p>
          ) : (
            <div className="space-y-2">
              {top.map((row, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-2xl"
                  style={{ background: i === 0 ? 'rgba(255,215,0,0.08)' : 'rgba(255,255,255,0.04)' }}>
                  <span className="text-xl w-6 text-center">{medals[i] || `#${i + 1}`}</span>
                  <span className="text-white font-bold flex-1">{row.handle}</span>
                  <span className="text-yellow-300 font-black text-sm">{row.total_coins.toLocaleString()}🪙</span>
                  <span className="text-white/30 text-xs">{row.gift_count} gifts</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Gift Sheet ────────────────────────────────────────────────────────────
export default function GiftSheet({ creator, streamKey, onSendSuccess, onOpenShop, onClose }) {
  const [balance, setBalance]   = useState(null)
  const [selected, setSelected] = useState(null)
  const [qty, setQty]           = useState(1)
  const [sending, setSending]   = useState(false)
  const [sent, setSent]         = useState(false)
  const [error, setError]       = useState(null)

  // Load balance from server on open
  useEffect(() => {
    fetchBalance().then(b => setBalance(b.balance)).catch(() => setBalance(0))
    const unsub = onBalanceUpdate((newBal) => setBalance(newBal))
    return unsub
  }, [])

  const gift = selected ? GIFTS.find(g => g.id === selected) : null
  const totalCost = gift ? gift.coins * qty : 0
  const canAfford = balance !== null && balance >= totalCost
  const canSend   = gift && canAfford && !sending

  const handleSend = async () => {
    if (!canSend) return
    setSending(true)
    setError(null)
    try {
      const result = await apiSendGift({
        creatorId:     getUserId.toString() === 'function' ? creator.id || creator.handle : creator.id || creator.handle,
        creatorHandle: creator.handle,
        giftId:        gift.id,
        qty,
        streamKey,
      })
      setBalance(result.newBalance)
      setSent(true)
      onSendSuccess?.(gift, qty)
      setTimeout(() => { setSent(false); onClose() }, 1800)
    } catch (err) {
      setError(err.message || 'Gift failed — please try again')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full rounded-t-3xl overflow-hidden animate-slide-up"
        style={{ background: '#0d0d18', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}>

        <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg,#FF4B6E,#9B59FF,#00C3FF)' }} />
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-white/20" /></div>
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }}>
          <X className="w-4 h-4 text-white/50" />
        </button>

        <div className="px-5 pb-7 pt-2">
          {sent ? (
            <div className="flex flex-col items-center py-8 text-center">
              {gift && <img src={gift.img} alt={gift.name} className="w-20 h-20 mb-3 animate-bounce" />}
              <p className="text-white font-black text-xl mb-1">Gift sent! 🎉</p>
              <p className="text-white/40 text-sm">You just made {creator?.name}'s day 💜</p>
            </div>
          ) : (
            <>
              {/* Header row */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-white font-black text-lg">Send a Gift</p>
                  <p className="text-white/40 text-xs">to {creator?.name || 'this creator'}</p>
                </div>
                <button onClick={() => { onClose(); onOpenShop() }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                  style={{ background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)' }}>
                  <span className="text-sm">🪙</span>
                  <span className="text-yellow-300 font-black text-sm">
                    {balance === null ? '…' : balance.toLocaleString()}
                  </span>
                  <ChevronRight className="w-3 h-3 text-yellow-400/60" />
                </button>
              </div>

              {/* Gift grid — graphical SVGs */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                {GIFTS.map(g => (
                  <button key={g.id}
                    onClick={() => { setSelected(g.id); setQty(1) }}
                    className={clsx(
                      'flex flex-col items-center gap-1 py-2.5 rounded-2xl border transition-all',
                      selected === g.id ? 'scale-105 border-2' : 'border-white/8'
                    )}
                    style={{
                      background:  selected === g.id ? `${g.color}20` : 'rgba(255,255,255,0.04)',
                      borderColor: selected === g.id ? g.color : 'rgba(255,255,255,0.08)',
                    }}>
                    <img src={g.img} alt={g.name} className="w-10 h-10" />
                    <span className="text-white/70 text-[9px] font-bold">{g.coins}🪙</span>
                  </button>
                ))}
              </div>

              {/* Gift name + qty */}
              {gift && (
                <div className="flex items-center justify-between mb-4 px-1">
                  <span className="text-white font-bold text-sm" style={{ color: gift.color }}>
                    {gift.name}
                  </span>
                  {gift.coins <= 200 && (
                    <div className="flex items-center gap-3">
                      <button onClick={() => setQty(q => Math.max(1, q - 1))}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white font-black text-sm"
                        style={{ background: 'rgba(255,255,255,0.08)' }}>−</button>
                      <span className="text-white font-black w-6 text-center">{qty}</span>
                      <button onClick={() => setQty(q => Math.min(99, q + 1))}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white font-black text-sm"
                        style={{ background: 'rgba(255,255,255,0.08)' }}>+</button>
                    </div>
                  )}
                </div>
              )}

              {/* Error */}
              {error && <p className="text-red-400 text-xs text-center mb-3">{error}</p>}

              {/* Send button */}
              <button onClick={handleSend} disabled={!canSend || sending}
                className={clsx(
                  'w-full py-4 rounded-2xl font-black text-white text-base transition-all flex items-center justify-center gap-2',
                  canSend && !sending ? 'active:scale-95' : 'opacity-40 cursor-not-allowed'
                )}
                style={{
                  background: canSend
                    ? `linear-gradient(135deg, ${gift?.color || '#9B59FF'}, #FF4B6E)`
                    : 'rgba(255,255,255,0.08)',
                  boxShadow: canSend ? `0 8px 32px ${gift?.color || '#9B59FF'}40` : 'none',
                }}>
                {sending
                  ? <Loader2 className="w-5 h-5 animate-spin" />
                  : <Gift className="w-5 h-5" />
                }
                {sending
                  ? 'Sending…'
                  : !gift
                  ? 'Pick a gift above'
                  : !canAfford
                  ? `Need ${(totalCost - (balance || 0)).toLocaleString()} more coins`
                  : `Send ${qty > 1 ? `${qty}× ` : ''}${gift.name} · ${totalCost.toLocaleString()}🪙`
                }
              </button>

              {/* Not enough coins shortcut */}
              {gift && !canAfford && (
                <button onClick={() => { onClose(); onOpenShop() }}
                  className="w-full mt-2 py-2.5 rounded-2xl text-sm font-bold text-yellow-300 transition-all active:scale-95"
                  style={{ background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.25)' }}>
                  🪙 Get more coins
                </button>
              )}

              <p className="text-white/20 text-[11px] text-center mt-3">
                1 coin sent = 1 coin received · 0% platform fee on gifts
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
