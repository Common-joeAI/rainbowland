/**
 * UnifiedChat v2 — aggregated multi-platform chat panel
 * Grok audit fixes:
 *  - Grok button disabled when no XAI key
 *  - Export chat (CSV/JSON) via exportChat hook
 *  - Mute/block list per author (persisted in localStorage)
 *  - Simulation gated when real chat is connected
 *  - TikTok platform pill added
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { MessageSquare, Zap, Trash2, Bot, Send, X, Wifi, WifiOff, Download, VolumeX } from 'lucide-react'
import { useChatAggregator, getGrokReply, PLATFORM_META } from '../hooks/useChatAggregator'
import { useStore } from '../hooks/useStore'
import clsx from 'clsx'

const RL_WS = import.meta.env.VITE_RL_WS_URL || 'wss://live.rainbowland.cc/ws'
const HAS_GROK = !!import.meta.env.VITE_XAI_API_KEY

export default function UnifiedChat({ destinations = {}, streamKey = '', isLive = false, className = '' }) {
  const { user } = useStore()
  const { messages, connected, clearMessages, exportChat } = useChatAggregator({
    destinations,
    streamKey,
    rlWsUrl: isLive ? RL_WS : '',
  })

  const [selected, setSelected]     = useState(null)
  const [aiReply, setAiReply]       = useState('')
  const [aiLoading, setAiLoading]   = useState(false)
  const [filter, setFilter]         = useState('all')
  const [soundOn, setSoundOn]       = useState(false)
  const [blocked, setBlocked]       = useState(() => {
    try { return JSON.parse(localStorage.getItem('rl_blocked_users') || '[]') } catch { return [] }
  })
  const [showExport, setShowExport] = useState(false)
  const bottomRef = useRef(null)
  const audioCtx  = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  useEffect(() => {
    if (!soundOn || messages.length === 0) return
    try {
      if (!audioCtx.current) audioCtx.current = new AudioContext()
      const ctx = audioCtx.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.06, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
      osc.start(); osc.stop(ctx.currentTime + 0.12)
    } catch {}
  }, [messages.length, soundOn])

  const handleGrokReply = useCallback(async (msg) => {
    if (!HAS_GROK) return
    setSelected(msg); setAiReply(''); setAiLoading(true)
    try {
      const personality = localStorage.getItem('rl_ai_personality') || 'warm'
      const reply = await getGrokReply(msg.text, user.name || 'Creator', personality)
      setAiReply(reply || 'No suggestion')
    } catch { setAiReply('Grok unavailable') }
    finally { setAiLoading(false) }
  }, [user.name])

  const blockUser = useCallback((author) => {
    setBlocked(prev => {
      const next = [...prev, author]
      localStorage.setItem('rl_blocked_users', JSON.stringify(next))
      return next
    })
    setSelected(null); setAiReply('')
  }, [])

  const hasRealChat = Object.values(connected).some(Boolean)
  const platforms = Object.keys(PLATFORM_META).filter(p => destinations[p]?.enabled)

  const filtered = messages.filter(m =>
    !blocked.includes(m.author) &&
    (filter === 'all' || m.platform === filter)
  )

  return (
    <div className={clsx('flex flex-col glass rounded-2xl border border-white/10 overflow-hidden', className)}>

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-purple-400" />
          <span className="text-white font-bold text-sm">Live Chat</span>
          {messages.length > 0 && (
            <span className="text-xs bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full">{messages.length}</span>
          )}
          {hasRealChat && (
            <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">● LIVE</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setSoundOn(s => !s)}
            className={clsx('text-xs px-2 py-1 rounded-lg transition-colors', soundOn ? 'bg-purple-500/30 text-purple-300' : 'text-white/30 hover:text-white/60')}
            title="Sound alerts">🔔</button>
          <div className="relative">
            <button onClick={() => setShowExport(s => !s)}
              className="text-white/30 hover:text-white/60 transition-colors" title="Export chat">
              <Download className="w-3.5 h-3.5" />
            </button>
            {showExport && (
              <div className="absolute right-0 top-6 glass border border-white/10 rounded-xl p-1 z-10 flex flex-col gap-1 min-w-[100px]">
                <button onClick={() => { exportChat('json'); setShowExport(false) }}
                  className="text-white/70 hover:text-white text-xs px-3 py-1.5 rounded-lg hover:bg-white/5 text-left">JSON</button>
                <button onClick={() => { exportChat('csv'); setShowExport(false) }}
                  className="text-white/70 hover:text-white text-xs px-3 py-1.5 rounded-lg hover:bg-white/5 text-left">CSV</button>
              </div>
            )}
          </div>
          <button onClick={clearMessages} className="text-white/30 hover:text-white/60 transition-colors" title="Clear">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Platform filter pills */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 flex-wrap flex-shrink-0 border-b border-white/5">
        <button onClick={() => setFilter('all')}
          className={clsx('text-xs px-2 py-0.5 rounded-full transition-colors',
            filter === 'all' ? 'bg-white/20 text-white' : 'text-white/30 hover:text-white/50')}>All</button>
        {platforms.map(p => {
          const meta = PLATFORM_META[p]
          const isConn = connected[p]
          return (
            <button key={p} onClick={() => setFilter(f => f === p ? 'all' : p)}
              className={clsx('flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors',
                filter === p ? 'bg-white/20 text-white border-white/30' : 'border-white/10 text-white/40 hover:text-white/60',
                !isConn && 'opacity-40'
              )}>
              <span>{meta.icon}</span>
              <span>{p === 'rainbowland' ? 'RL' : p.charAt(0).toUpperCase() + p.slice(1)}</span>
              {isConn ? <Wifi className="w-2.5 h-2.5 text-green-400" /> : <WifiOff className="w-2.5 h-2.5 text-red-400" />}
            </button>
          )
        })}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 min-h-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <MessageSquare className="w-8 h-8 text-white/10 mb-2" />
            <p className="text-white/20 text-xs">{isLive ? 'Waiting for chat…' : 'Go live to see chat'}</p>
          </div>
        ) : filtered.map(msg => (
          <div key={msg.id} className="group flex items-start gap-2">
            <button
              onClick={() => HAS_GROK ? handleGrokReply(msg) : null}
              disabled={!HAS_GROK}
              title={HAS_GROK ? 'Click for Grok reply suggestion' : 'Add VITE_XAI_API_KEY to enable AI replies'}
              className={clsx(
                'flex-1 text-left flex items-start gap-2 p-1.5 rounded-xl transition-colors min-w-0',
                HAS_GROK ? 'hover:bg-white/5 cursor-pointer' : 'cursor-default',
                selected?.id === msg.id && 'bg-white/10'
              )}>
              <span className="text-sm flex-shrink-0 mt-0.5">{msg.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-xs font-bold truncate" style={{ color: msg.color }}>{msg.author}</span>
                  {msg.isGift && <span className="text-[10px] bg-yellow-500/20 text-yellow-300 px-1 rounded">gift</span>}
                </div>
                <p className="text-white/80 text-xs leading-relaxed break-words">{msg.text}</p>
              </div>
            </button>
            {/* Block button — visible on hover */}
            <button onClick={() => blockUser(msg.author)}
              className="opacity-0 group-hover:opacity-100 flex-shrink-0 mt-1 text-white/20 hover:text-red-400 transition-all"
              title={`Block ${msg.author}`}>
              <VolumeX className="w-3 h-3" />
            </button>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Grok AI reply panel */}
      {selected && (
        <div className="flex-shrink-0 border-t border-purple-500/20 p-3 bg-purple-500/5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-purple-300 text-xs font-bold">Grok suggestion</span>
            </div>
            <button onClick={() => { setSelected(null); setAiReply('') }} className="text-white/30 hover:text-white/60">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-white/40 text-[10px] mb-1.5 truncate">
            ↩ <span style={{ color: selected.color }}>{selected.author}</span>: "{selected.text.slice(0, 50)}{selected.text.length > 50 ? '…' : ''}"
          </p>
          {aiLoading ? (
            <div className="flex items-center gap-2 text-white/40 text-xs">
              <Zap className="w-3 h-3 animate-pulse text-purple-400" /> Thinking…
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <p className="flex-1 text-white text-xs leading-relaxed">{aiReply}</p>
              {aiReply && aiReply !== 'Grok unavailable' && aiReply !== 'No suggestion' && (
                <button
                  onClick={() => { navigator.clipboard?.writeText(aiReply); setSelected(null); setAiReply('') }}
                  className="flex-shrink-0 flex items-center gap-1 bg-purple-600 hover:bg-purple-500 text-white text-xs px-2 py-1 rounded-lg transition-colors">
                  <Send className="w-3 h-3" /> Copy
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
