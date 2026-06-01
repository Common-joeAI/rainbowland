/**
 * Rainbow Land Coin API client
 * All coin state lives on the server — this is just a thin fetch wrapper.
 *
 * Auth: every request sends X-User-ID (UUID from localStorage) and X-Handle.
 * This is a simple trust model for v1; swap for JWT when you add accounts.
 */

import { LIVE_SERVER_HTTP } from './liveServer'

const API = LIVE_SERVER_HTTP

// ── User identity (generated once, persisted in localStorage) ─────────────────
function getUserId() {
  let id = localStorage.getItem('rl_user_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('rl_user_id', id)
  }
  return id
}

function getHandle() {
  // Import from zustand store at call-time to avoid circular deps
  try {
    const raw = localStorage.getItem('rainbowland-store')
    const store = raw ? JSON.parse(raw) : {}
    return store?.state?.user?.handle || '@viewer'
  } catch {
    return '@viewer'
  }
}

function authHeaders() {
  return {
    'Content-Type':  'application/json',
    'X-User-ID':     getUserId(),
    'X-Handle':      getHandle(),
  }
}

export { getUserId, getHandle }

// ── Balance ────────────────────────────────────────────────────────────────────
export async function fetchBalance() {
  const r = await fetch(`${API}/api/coins/balance`, { headers: authHeaders() })
  if (!r.ok) throw new Error(await r.text())
  return r.json()   // { userId, balance, total_earned }
}

// ── Coin packs ─────────────────────────────────────────────────────────────────
export async function fetchCoinPacks() {
  const r = await fetch(`${API}/api/coins/packs`)
  return r.json()
}

/**
 * Build a PayPal.me buy-now URL with the custom field embedded.
 * custom = "userId:handle:packIndex" so the IPN can credit the right user.
 *
 * Uses PayPal's hosted "Buy Now" button link format.
 */
export function buildPayPalUrl(packIndex, pack) {
  const userId  = getUserId()
  const handle  = getHandle().replace('@', '')
  const custom  = encodeURIComponent(`${userId}:${handle}:${packIndex}`)
  const amount  = (pack.usd_cents / 100).toFixed(2)
  const itemName = encodeURIComponent(`Rainbow Land — ${pack.coins} Coins`)
  const notifyUrl = encodeURIComponent(`${API}/api/paypal/ipn`)

  // PayPal standard payment link — opens PayPal checkout in browser
  return (
    `https://www.paypal.com/cgi-bin/webscr` +
    `?cmd=_xclick` +
    `&business=josephbennett99%40gmail.com` +
    `&item_name=${itemName}` +
    `&amount=${amount}` +
    `&currency_code=USD` +
    `&custom=${custom}` +
    `&notify_url=${notifyUrl}` +
    `&no_shipping=1` +
    `&return=${encodeURIComponent('https://rainbowland.cc/coins/thanks')}` +
    `&cancel_return=${encodeURIComponent('https://rainbowland.cc')}`
  )
}

// ── Gift sending ───────────────────────────────────────────────────────────────
export async function sendGift({ creatorId, creatorHandle, giftId, qty = 1, streamKey }) {
  const r = await fetch(`${API}/api/coins/gift`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ creatorId, creatorHandle, giftId, qty, streamKey }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || 'Gift failed')
  return data  // { ok, newBalance, totalCoins }
}

// ── Leaderboard ────────────────────────────────────────────────────────────────
export async function fetchLeaderboard(creatorId) {
  const r = await fetch(`${API}/api/coins/leaderboard/${encodeURIComponent(creatorId)}`)
  return r.json()  // [{ handle, total_coins, gift_count }]
}

// ── Creator earnings ───────────────────────────────────────────────────────────
export async function fetchEarnings() {
  const r = await fetch(`${API}/api/coins/earnings/${encodeURIComponent(getUserId())}`, {
    headers: authHeaders()
  })
  return r.json()  // { wallet: { balance, total_earned }, byGift: [...] }
}

// ── WebSocket: listen for real-time balance updates ────────────────────────────
let _ws = null
let _balanceCallbacks = []

export function onBalanceUpdate(cb) {
  _balanceCallbacks.push(cb)
  return () => { _balanceCallbacks = _balanceCallbacks.filter(x => x !== cb) }
}

export function connectCoinSocket(wsUrl) {
  if (_ws && _ws.readyState <= 1) return
  _ws = new WebSocket(wsUrl)
  _ws.onopen = () => {
    _ws.send(JSON.stringify({ type: 'identify', userId: getUserId(), handle: getHandle() }))
  }
  _ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      if (msg.type === 'coins_credited') {
        _balanceCallbacks.forEach(cb => cb(msg.newBalance, msg.coins))
      }
    } catch {}
  }
}
