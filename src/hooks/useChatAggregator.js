/**
 * useChatAggregator v2 — unified multi-platform chat hook
 *
 * Connects to:
 *  - Twitch IRC (anonymous read WebSocket)
 *  - YouTube Live Chat (polling via API key or OAuth)
 *  - TikTok Live (polling via existing OAuth token)
 *  - Rainbow Land (existing /ws WebSocket)
 *
 * Each message: { id, platform, author, text, color, icon, label, ts, isGift? }
 */

import { useState, useEffect, useRef, useCallback } from 'react'

export const PLATFORM_META = {
  twitch:      { label: 'Twitch',       color: '#9147ff', icon: '🎮' },
  youtube:     { label: 'YouTube',      color: '#ff0000', icon: '▶️'  },
  tiktok:      { label: 'TikTok',       color: '#69c9d0', icon: '🎵' },
  rainbowland: { label: 'Rainbow Land', color: '#c084fc', icon: '🌈' },
}

const XAI_KEY = () => import.meta.env.VITE_XAI_API_KEY || ''

// ── Grok reply (renderer-safe, uses Vite env) ─────────────────────────────────
export async function getGrokReply(message, creatorName, personality = 'warm') {
  const key = XAI_KEY()
  if (!key) return null
  const tones = {
    warm:      'warm, caring, and affirming',
    hype:      'enthusiastic, high-energy',
    witty:     'witty and playful',
    authentic: 'chill and authentic',
  }
  const resp = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'grok-3',
      messages: [{ role: 'user', content:
        `You are ${creatorName}, a live streamer. Reply to this viewer chat message in ONE short sentence (max 80 chars). Tone: ${tones[personality] || tones.warm}. Do not use quotes. Chat: "${message}"`
      }],
      max_tokens: 80,
      temperature: 0.85,
    })
  })
  if (!resp.ok) return null
  const data = await resp.json()
  return data.choices?.[0]?.message?.content?.trim() || null
}

// ── Content moderation (Grok) ─────────────────────────────────────────────────
export async function moderateMsg(text) {
  const key = XAI_KEY()
  if (!key) return { safe: true }
  try {
    const resp = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'grok-3',
        messages: [{ role: 'user', content:
          `Content mod for LGBT+ streaming platform. Is this chat message hate speech, harassment, slurs, or harmful? Reply ONLY with JSON: {"safe":true/false,"reason":"one word"}. Message: "${text.slice(0,200)}"`
        }],
        max_tokens: 30, temperature: 0.1,
      })
    })
    const data = await resp.json()
    return JSON.parse(data.choices[0].message.content.trim())
  } catch { return { safe: true } }
}

// ── Main hook ─────────────────────────────────────────────────────────────────
export function useChatAggregator({ destinations = {}, streamKey = '', rlWsUrl = '' }) {
  const [messages, setMessages]   = useState([])
  const [connected, setConnected] = useState({})
  const wsRefs    = useRef({})
  const pollRefs  = useRef({})
  const msgIdRef  = useRef(0)
  // Fingerprint dedup: Set of "author|text" strings with 5s TTL
  const recentSet = useRef(new Map())

  const addMsg = useCallback(async (platform, author, text, extra = {}) => {
    if (!text?.trim()) return
    const meta = PLATFORM_META[platform] || { color: '#888', icon: '💬', label: platform }

    // Dedup fingerprint (5s window, all platforms)
    const fp = `${author}|${text}`
    if (recentSet.current.has(fp)) return
    recentSet.current.set(fp, setTimeout(() => recentSet.current.delete(fp), 5000))

    // Auto-moderate (async, don't block render)
    if (XAI_KEY()) {
      moderateMsg(text).then(({ safe }) => {
        if (!safe) return // silently drop flagged messages
      })
    }

    const msg = {
      id:       ++msgIdRef.current,
      platform,
      author,
      text,
      color:    meta.color,
      icon:     meta.icon,
      label:    meta.label,
      ts:       Date.now(),
      ...extra,
    }
    setMessages(prev => [...prev.slice(-199), msg])
  }, [])

  // ── Twitch IRC (anonymous read) ───────────────────────────────────────────
  useEffect(() => {
    const dest = destinations.twitch
    if (!dest?.enabled || !dest?.channel) return

    const channel = dest.channel.toLowerCase().replace(/^#/, '')
    // justinfan = standard Twitch anonymous read method (publicly documented)
    const ANON_NICK = 'justinfan' + Math.floor(Math.random() * 99998 + 1)
    const ANON_PASS = 'oauth:anonymous'

    const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443')
    wsRefs.current.twitch = ws

    ws.onopen = () => {
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands')
      ws.send(`PASS ${ANON_PASS}`)
      ws.send(`NICK ${ANON_NICK}`)
      ws.send(`JOIN #${channel}`)
      setConnected(c => ({ ...c, twitch: true }))
    }
    ws.onmessage = (e) => {
      const raw = e.data
      if (raw.includes('PING')) { ws.send('PONG :tmi.twitch.tv'); return }
      const match = raw.match(/:(.+?)!.+?PRIVMSG #\S+ :(.+)/)
      if (match) {
        const tagMatch = raw.match(/display-name=([^;]+)/)
        const author = (tagMatch?.[1] || match[1]).trim()
        addMsg('twitch', author, match[2].trim())
      }
    }
    ws.onerror = () => setConnected(c => ({ ...c, twitch: false }))
    ws.onclose = () => setConnected(c => ({ ...c, twitch: false }))

    return () => { ws.close(); delete wsRefs.current.twitch }
  }, [destinations?.twitch?.enabled, destinations?.twitch?.channel, addMsg])

  // ── YouTube Live Chat polling ─────────────────────────────────────────────
  useEffect(() => {
    const dest = destinations.youtube
    if (!dest?.enabled || !dest?.liveChatId) return
    let pageToken = '', active = true

    async function poll() {
      if (!active) return
      try {
        const params = new URLSearchParams({
          liveChatId: dest.liveChatId,
          part: 'snippet,authorDetails',
          maxResults: '200',
          ...(pageToken ? { pageToken } : {}),
          ...(dest.apiKey ? { key: dest.apiKey } : {}),
        })
        const res = await fetch(`https://www.googleapis.com/youtube/v3/liveChat/messages?${params}`, {
          headers: dest.oauthToken ? { Authorization: `Bearer ${dest.oauthToken}` } : {}
        })
        if (!res.ok) { if (active) pollRefs.current.youtube = setTimeout(poll, 10000); return }
        const data = await res.json()
        pageToken = data.nextPageToken || pageToken
        setConnected(c => ({ ...c, youtube: true }))
        for (const item of (data.items || [])) {
          addMsg('youtube',
            item.authorDetails?.displayName || 'viewer',
            item.snippet?.displayMessage || ''
          )
        }
        if (active) pollRefs.current.youtube = setTimeout(poll, data.pollingIntervalMillis || 5000)
      } catch {
        if (active) pollRefs.current.youtube = setTimeout(poll, 8000)
      }
    }
    poll()
    return () => { active = false; clearTimeout(pollRefs.current.youtube); setConnected(c => ({ ...c, youtube: false })) }
  }, [destinations?.youtube?.enabled, destinations?.youtube?.liveChatId, addMsg])

  // ── TikTok Live Chat (poll via access token) ──────────────────────────────
  useEffect(() => {
    const dest = destinations.tiktok
    if (!dest?.enabled || !dest?.accessToken) return
    let active = true

    async function pollTikTok() {
      if (!active) return
      try {
        // TikTok Live WebSocket is behind app approval; use comment API as fallback
        const res = await fetch(`https://open.tiktokapis.com/v2/video/comment/list/?fields=id,text,create_time,like_count`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${dest.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ video_id: dest.videoId || '', max_count: 20 })
        })
        if (res.ok) {
          const data = await res.json()
          setConnected(c => ({ ...c, tiktok: true }))
          for (const comment of (data.data?.comments || [])) {
            addMsg('tiktok', comment.username || 'viewer', comment.text || '')
          }
        }
      } catch {}
      if (active) pollRefs.current.tiktok = setTimeout(pollTikTok, 6000)
    }
    pollTikTok()
    return () => { active = false; clearTimeout(pollRefs.current.tiktok); setConnected(c => ({ ...c, tiktok: false })) }
  }, [destinations?.tiktok?.enabled, destinations?.tiktok?.accessToken, addMsg])

  // ── Rainbow Land WebSocket ────────────────────────────────────────────────
  useEffect(() => {
    if (!rlWsUrl || !streamKey) return
    const ws = new WebSocket(rlWsUrl)
    wsRefs.current.rainbowland = ws

    ws.onopen = () => { ws.send(JSON.stringify({ type: 'join', streamKey })); setConnected(c => ({ ...c, rainbowland: true })) }
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'chat') addMsg('rainbowland', msg.handle || 'viewer', msg.text)
        if (msg.type === 'gift') addMsg('rainbowland', msg.handle || 'viewer', `🎁 sent ${msg.giftName}!`, { isGift: true })
      } catch {}
    }
    ws.onerror = () => setConnected(c => ({ ...c, rainbowland: false }))
    ws.onclose = () => setConnected(c => ({ ...c, rainbowland: false }))

    return () => { ws.close(); delete wsRefs.current.rainbowland }
  }, [rlWsUrl, streamKey, addMsg])

  // ── Chat log export ───────────────────────────────────────────────────────
  const exportChat = useCallback((format = 'json') => {
    const data = messages.map(m => ({
      platform: m.platform,
      author:   m.author,
      text:     m.text,
      time:     new Date(m.ts).toISOString(),
    }))
    const blob = format === 'csv'
      ? new Blob([['platform,author,text,time', ...data.map(r => `${r.platform},${r.author},"${r.text.replace(/"/g,'""')}",${r.time}`)].join('\n')], { type: 'text/csv' })
      : new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `rl-chat-${Date.now()}.${format}`
    a.click()
  }, [messages])

  const clearMessages = useCallback(() => setMessages([]), [])

  return { messages, connected, clearMessages, exportChat }
}
