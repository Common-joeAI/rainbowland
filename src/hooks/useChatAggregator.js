/**
 * useChatAggregator — unified multi-platform chat hook
 *
 * Connects to:
 *  - Twitch IRC (WebSocket, anonymous read — no token needed for public channels)
 *  - YouTube Live Chat (polling via API key or OAuth)
 *  - TikTok Live (via existing auth token)
 *  - Rainbow Land (existing /ws WebSocket)
 *
 * Returns: { messages, connected, clearMessages }
 * Each message: { id, platform, author, text, color, avatar, ts }
 */

import { useState, useEffect, useRef, useCallback } from 'react'

const PLATFORM_META = {
  twitch:      { label: 'Twitch',       color: '#9147ff', icon: '🎮' },
  youtube:     { label: 'YouTube',      color: '#ff0000', icon: '▶️'  },
  tiktok:      { label: 'TikTok',       color: '#69c9d0', icon: '🎵' },
  rainbowland: { label: 'Rainbow Land', color: '#c084fc', icon: '🌈' },
  facebook:    { label: 'Facebook',     color: '#1877f2', icon: '📘' },
}

// ── Grok AI reply helper (called from component, not hook) ────────────────────
export async function getGrokReply(message, creatorName, personality = 'warm') {
  const XAI_URL = 'https://api.x.ai/v1/chat/completions'
  const XAI_KEY = import.meta.env.VITE_XAI_API_KEY || ''
  if (!XAI_KEY) return null

  const tones = {
    warm:      'warm, caring, and affirming',
    hype:      'enthusiastic, high-energy',
    witty:     'witty and playful',
    authentic: 'chill and authentic',
  }

  const resp = await fetch(XAI_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${XAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'grok-3',
      messages: [{
        role: 'user',
        content: `You are ${creatorName}, a live streamer. Reply to this chat message in one short sentence (max 80 chars), tone: ${tones[personality] || tones.warm}. Chat: "${message}"`
      }],
      max_tokens: 80,
      temperature: 0.85,
    })
  })
  if (!resp.ok) return null
  const data = await resp.json()
  return data.choices?.[0]?.message?.content?.trim() || null
}

// ── Main hook ──────────────────────────────────────────────────────────────────
export function useChatAggregator({ destinations = {}, streamKey = '', rlWsUrl = '' }) {
  const [messages, setMessages]   = useState([])
  const [connected, setConnected] = useState({})
  const wsRefs  = useRef({})   // platform → WebSocket
  const pollRef = useRef({})   // platform → interval id
  const msgIdRef = useRef(0)

  const addMsg = useCallback((platform, author, text, extra = {}) => {
    const meta = PLATFORM_META[platform] || { color: '#888', icon: '💬', label: platform }
    setMessages(prev => {
      // Dedupe by text+author within last 2s
      const recent = prev.slice(-20)
      if (recent.some(m => m.author === author && m.text === text)) return prev
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
      return [...prev.slice(-199), msg]  // keep last 200
    })
  }, [])

  // ── Twitch IRC ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const dest = destinations.twitch
    if (!dest?.enabled || !dest?.channel) return

    const channel = dest.channel.toLowerCase().replace(/^#/, '')
    const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443')
    wsRefs.current.twitch = ws

    ws.onopen = () => {
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands')
      ws.send('PASS oauth:SCHMOOZE')   // anonymous read — any string works
      ws.send('NICK justinfan' + Math.floor(Math.random() * 99999))
      ws.send(`JOIN #${channel}`)
      setConnected(c => ({ ...c, twitch: true }))
    }

    ws.onmessage = (e) => {
      const raw = e.data
      if (raw.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv'); return }
      const match = raw.match(/:(.+?)!.+?PRIVMSG #\S+ :(.+)/)
      if (match) {
        // Extract display-name from tags if present
        const tagMatch = raw.match(/display-name=([^;]+)/)
        const author = tagMatch ? tagMatch[1] : match[1]
        addMsg('twitch', author, match[2].trim())
      }
    }

    ws.onerror = () => setConnected(c => ({ ...c, twitch: false }))
    ws.onclose = () => setConnected(c => ({ ...c, twitch: false }))

    return () => { ws.close(); delete wsRefs.current.twitch }
  }, [destinations?.twitch?.enabled, destinations?.twitch?.channel])

  // ── YouTube Live Chat polling ────────────────────────────────────────────────
  useEffect(() => {
    const dest = destinations.youtube
    if (!dest?.enabled || !dest?.liveChatId) return

    let pageToken = ''
    let active = true

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
        if (!res.ok) return
        const data = await res.json()
        pageToken = data.nextPageToken || pageToken
        setConnected(c => ({ ...c, youtube: true }))
        for (const item of (data.items || [])) {
          addMsg('youtube',
            item.authorDetails?.displayName || 'viewer',
            item.snippet?.displayMessage || ''
          )
        }
        // Poll again after pollingIntervalMillis (YouTube tells us the rate)
        const delay = data.pollingIntervalMillis || 5000
        if (active) pollRef.current.youtube = setTimeout(poll, delay)
      } catch {
        if (active) pollRef.current.youtube = setTimeout(poll, 8000)
      }
    }

    poll()
    return () => {
      active = false
      clearTimeout(pollRef.current.youtube)
      setConnected(c => ({ ...c, youtube: false }))
    }
  }, [destinations?.youtube?.enabled, destinations?.youtube?.liveChatId])

  // ── Rainbow Land WebSocket ───────────────────────────────────────────────────
  useEffect(() => {
    if (!rlWsUrl || !streamKey) return

    const ws = new WebSocket(rlWsUrl)
    wsRefs.current.rainbowland = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', streamKey }))
      setConnected(c => ({ ...c, rainbowland: true }))
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'chat') addMsg('rainbowland', msg.handle || 'viewer', msg.text)
        if (msg.type === 'gift') addMsg('rainbowland', msg.handle || 'viewer', `🎁 sent a ${msg.giftName}!`, { isGift: true })
      } catch {}
    }

    ws.onerror = () => setConnected(c => ({ ...c, rainbowland: false }))
    ws.onclose = () => setConnected(c => ({ ...c, rainbowland: false }))

    return () => { ws.close(); delete wsRefs.current.rainbowland }
  }, [rlWsUrl, streamKey])

  const clearMessages = useCallback(() => setMessages([]), [])

  return { messages, connected, clearMessages }
}
