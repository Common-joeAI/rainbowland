/**
 * DestinationManager
 * Platform connect buttons — OAuth where available, stream key fallback for others.
 * Keys saved via Electron safeStorage.
 */
import React, { useState, useEffect } from 'react'
import clsx from 'clsx'
import { ExternalLink, Check, Link2, Unlink, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react'
import { useStore } from '../../hooks/useStore'

const IS_ELECTRON = typeof window !== 'undefined' && !!window.electronAPI

// Platform configs — OAuth deeplink OR manual key flow
const PLATFORMS = {
  rainbowland: {
    label:   'Rainbow Land',
    icon:    '🌈',
    color:   '#9B59FF',
    // Rainbow Land auto-generates key on go-live — no manual input needed
    mode:    'auto',
    hint:    'Auto-configured — no key needed',
  },
  tiktok: {
    label:   'TikTok Live',
    icon:    '🎵',
    color:   '#010101',
    // TikTok doesn't expose RTMP via public OAuth — link to their stream key page
    mode:    'connect',
    connectUrl: 'https://www.tiktok.com/live/creator',
    connectLabel: 'Get Stream Key',
    hint:    'Opens TikTok Live Studio to copy your stream key',
    keyPlaceholder: 'Paste TikTok stream key…',
  },
  youtube: {
    label:   'YouTube Live',
    icon:    '▶️',
    color:   '#FF0000',
    mode:    'connect',
    connectUrl: 'https://studio.youtube.com/channel/UC/livestreaming',
    connectLabel: 'Open YouTube Studio',
    hint:    'Copy your stream key from YouTube Studio → Go Live',
    keyPlaceholder: 'Paste YouTube stream key…',
  },
  facebook: {
    label:   'Facebook Live',
    icon:    '📘',
    color:   '#1877F2',
    mode:    'connect',
    connectUrl: 'https://www.facebook.com/live/producer',
    connectLabel: 'Open Live Producer',
    hint:    'Copy your stream key from Facebook Live Producer',
    keyPlaceholder: 'Paste Facebook stream key…',
  },
  twitch: {
    label:   'Twitch',
    icon:    '🎮',
    color:   '#9146FF',
    mode:    'connect',
    connectUrl: 'https://dashboard.twitch.tv/settings/stream',
    connectLabel: 'Open Twitch Dashboard',
    hint:    'Copy your primary stream key from Twitch settings',
    keyPlaceholder: 'Paste Twitch stream key…',
  },
  custom: {
    label:   'Custom RTMP',
    icon:    '📡',
    color:   '#FF7A00',
    mode:    'manual',
    hint:    'Enter your RTMP server URL and stream key',
    keyPlaceholder: 'Paste stream key…',
  },
}

// Connection state stored per platform
const DEFAULT_CONNECTIONS = {
  rainbowland: { connected: true },
  tiktok:      { connected: false, key: '' },
  youtube:     { connected: false, key: '' },
  facebook:    { connected: false, key: '' },
  twitch:      { connected: false, key: '' },
  custom:      { connected: false, key: '', url: '' },
}

export default function DestinationManager() {
  const { destinations, secrets, setDestination, toggleDestination, setSecret } = useStore()
  const [connections, setConnections] = useState(DEFAULT_CONNECTIONS)
  const [expanded,    setExpanded]    = useState({})
  const [showKey,     setShowKey]     = useState({})
  const [saving,      setSaving]      = useState({})

  // Load saved keys from Electron safeStorage on mount
  useEffect(() => {
    if (!IS_ELECTRON) return
    window.electronAPI.getSecrets().then(enc => {
      if (!enc) return
      setConnections(prev => {
        const next = { ...prev }
        Object.entries(enc).forEach(([id, key]) => {
          if (key && next[id]) {
            next[id] = { ...next[id], connected: true, key }
          }
        })
        return next
      })
    })
  }, [])

  const openConnect = (id) => {
    const p = PLATFORMS[id]
    if (!p?.connectUrl) return
    if (IS_ELECTRON) {
      window.electronAPI.openExternal(p.connectUrl)
    } else {
      window.open(p.connectUrl, '_blank', 'noopener')
    }
    // Expand key input so user can paste right after
    setExpanded(e => ({ ...e, [id]: true }))
  }

  const handleKeyChange = (id, val) => {
    setConnections(c => ({ ...c, [id]: { ...c[id], key: val } }))
  }

  const handleSave = async (id) => {
    const key = connections[id]?.key || ''
    if (!key.trim()) return
    setSaving(s => ({ ...s, [id]: true }))

    setSecret(id, key)
    if (IS_ELECTRON) {
      await window.electronAPI.saveSecrets({ ...secrets, [id]: key })
    }

    setConnections(c => ({ ...c, [id]: { ...c[id], connected: true } }))
    setExpanded(e => ({ ...e, [id]: false }))

    setTimeout(() => setSaving(s => ({ ...s, [id]: false })), 1500)
  }

  const handleDisconnect = async (id) => {
    setSecret(id, '')
    if (IS_ELECTRON) {
      await window.electronAPI.saveSecrets({ ...secrets, [id]: '' })
    }
    setConnections(c => ({ ...c, [id]: { ...c[id], connected: false, key: '' } }))
    setExpanded(e => ({ ...e, [id]: false }))
    // Disable the destination too
    if (id !== 'rainbowland') {
      const dest = destinations[id]
      if (dest?.enabled) toggleDestination(id)
    }
  }

  return (
    <div className="px-3 pb-3 space-y-2">
      {Object.entries(destinations).map(([id, dest]) => {
        const p    = PLATFORMS[id]
        const conn = connections[id]
        const isExpanded = expanded[id]

        return (
          <div key={id}
            className={clsx(
              'rounded-xl border transition-all overflow-hidden',
              dest.enabled ? 'border-white/15 bg-dark-700' : 'border-white/5 bg-dark-800'
            )}>

            {/* ── Header row ── */}
            <div className="flex items-center gap-2.5 px-3 py-2.5">
              <span className="text-lg leading-none">{p?.icon || dest.icon}</span>

              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-bold leading-tight">{p?.label || dest.label}</p>
                <p className={clsx('text-[10px] leading-tight mt-0.5',
                  conn?.connected ? 'text-green-400' : 'text-white/30'
                )}>
                  {conn?.connected ? '● Connected' : '○ Not connected'}
                </p>
              </div>

              {/* Connect / Connected button */}
              {p?.mode === 'auto' ? (
                <span className="text-[10px] text-green-400 font-semibold px-2 py-1 bg-green-400/10 rounded-full">Auto</span>
              ) : conn?.connected ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setExpanded(e => ({ ...e, [id]: !isExpanded }))}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/70 transition-all text-[10px]"
                  >
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-500/15 text-green-400 text-[11px] font-semibold">
                    <Check className="w-3 h-3" /> Connected
                  </span>
                </div>
              ) : (
                <button
                  onClick={() => {
                    if (p?.mode === 'connect') openConnect(id)
                    setExpanded(e => ({ ...e, [id]: true }))
                  }}
                  style={{ background: `${p?.color}22`, borderColor: `${p?.color}44`, color: p?.color }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold hover:opacity-80 transition-opacity"
                >
                  <Link2 className="w-3 h-3" />
                  {p?.mode === 'connect' ? p.connectLabel : 'Connect'}
                </button>
              )}

              {/* Enable toggle (only when connected) */}
              {(conn?.connected || id === 'rainbowland') && (
                <button
                  onClick={() => toggleDestination(id)}
                  className={clsx(
                    'w-10 h-5 rounded-full transition-all relative flex-shrink-0',
                    dest.enabled ? 'bg-rainbow-purple' : 'bg-dark-500'
                  )}>
                  <span className={clsx(
                    'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm',
                    dest.enabled ? 'left-5' : 'left-0.5'
                  )} />
                </button>
              )}
            </div>

            {/* ── Expanded key paste area ── */}
            {isExpanded && p?.mode !== 'auto' && (
              <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-2.5">

                {/* Step 1: open platform */}
                {p?.mode === 'connect' && !conn?.connected && (
                  <button
                    onClick={() => openConnect(id)}
                    style={{ borderColor: `${p?.color}44`, color: p?.color }}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border bg-white/3 text-xs font-semibold hover:opacity-80 transition-opacity"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    1. Open {p.label} → copy your stream key
                  </button>
                )}

                {/* Custom URL field */}
                {id === 'custom' && (
                  <input
                    className="w-full bg-dark-600 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder-white/30 outline-none focus:border-orange-500/50"
                    placeholder="rtmp://your-server.com/live"
                    value={connections.custom?.url || ''}
                    onChange={e => {
                      setConnections(c => ({ ...c, custom: { ...c.custom, url: e.target.value } }))
                      setDestination('custom', { customUrl: e.target.value, rtmpBase: e.target.value })
                    }}
                  />
                )}

                {/* Key paste row */}
                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <input
                      autoFocus={!conn?.connected}
                      type={showKey[id] ? 'text' : 'password'}
                      className="w-full bg-dark-600 border border-white/10 rounded-lg px-3 py-2 pr-8 text-white text-xs placeholder-white/30 outline-none focus:border-white/30 font-mono"
                      placeholder={conn?.connected ? '••••••••••••• (saved)' : (p?.keyPlaceholder || 'Paste stream key…')}
                      value={connections[id]?.key || ''}
                      onChange={e => handleKeyChange(id, e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSave(id)}
                    />
                    <button
                      onClick={() => setShowKey(s => ({ ...s, [id]: !s[id] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                      {showKey[id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <button
                    onClick={() => handleSave(id)}
                    disabled={!connections[id]?.key?.trim()}
                    className={clsx(
                      'px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1 transition-all',
                      saving[id]
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : 'bg-rainbow-purple/80 hover:bg-rainbow-purple text-white'
                    )}>
                    {saving[id] ? <><Check className="w-3 h-3" /> Saved!</> : '2. Save Key'}
                  </button>
                </div>

                {/* Hint */}
                <p className="text-white/25 text-[10px]">{p?.hint}</p>

                {/* Disconnect option (when already connected) */}
                {conn?.connected && (
                  <button
                    onClick={() => handleDisconnect(id)}
                    className="flex items-center gap-1 text-red-400/60 hover:text-red-400 text-[10px] transition-colors"
                  >
                    <Unlink className="w-3 h-3" /> Disconnect
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
