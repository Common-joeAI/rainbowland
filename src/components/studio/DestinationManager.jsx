/**
 * DestinationManager
 * Platform connect buttons:
 *   - TikTok: full PKCE OAuth via Electron IPC (tiktok:connect)
 *   - YouTube/Facebook/Twitch: open platform page → paste stream key
 *   - Rainbow Land: auto (no key needed)
 *   - Custom: manual URL + key
 */
import React, { useState, useEffect } from 'react'
import clsx from 'clsx'
import { ExternalLink, Check, Link2, Unlink, Eye, EyeOff, ChevronDown, ChevronUp, Loader } from 'lucide-react'
import { useStore } from '../../hooks/useStore'

const IS_ELECTRON = typeof window !== 'undefined' && !!window.electronAPI

const PLATFORMS = {
  rainbowland: {
    label: 'Rainbow Land',
    icon:  '🌈',
    color: '#9B59FF',
    mode:  'auto',
    hint:  'Auto-configured — no key needed',
  },
  tiktok: {
    label:        'TikTok Live',
    icon:         '🎵',
    color:        '#010101',
    mode:         'oauth',           // ← real PKCE OAuth via Electron IPC
    hint:         'Authorize Rainbow Land in your browser — token saved automatically',
  },
  youtube: {
    label:          'YouTube Live',
    icon:           '▶️',
    color:          '#FF0000',
    mode:           'keylink',
    connectUrl:     'https://studio.youtube.com/channel/UC/livestreaming',
    connectLabel:   'Open YouTube Studio',
    hint:           'YouTube Studio → Go Live → copy your stream key',
    keyPlaceholder: 'Paste YouTube stream key…',
  },
  facebook: {
    label:          'Facebook Live',
    icon:           '📘',
    color:          '#1877F2',
    mode:           'keylink',
    connectUrl:     'https://www.facebook.com/live/producer',
    connectLabel:   'Open Live Producer',
    hint:           'Facebook → Live Producer → copy your stream key',
    keyPlaceholder: 'Paste Facebook stream key…',
  },
  twitch: {
    label:          'Twitch',
    icon:           '🎮',
    color:          '#9146FF',
    mode:           'keylink',
    connectUrl:     'https://dashboard.twitch.tv/settings/stream',
    connectLabel:   'Open Twitch Dashboard',
    hint:           'Twitch Dashboard → Settings → Stream → copy primary stream key',
    keyPlaceholder: 'Paste Twitch stream key…',
  },
  custom: {
    label:          'Custom RTMP',
    icon:           '📡',
    color:          '#FF7A00',
    mode:           'manual',
    hint:           'Enter your RTMP server URL and stream key',
    keyPlaceholder: 'Paste stream key…',
  },
}

export default function DestinationManager() {
  const { destinations, secrets, setDestination, toggleDestination, setSecret } = useStore()

  const [tiktokStatus, setTiktokStatus] = useState(null)  // { connected, displayName }
  const [tiktokLoading, setTiktokLoading] = useState(false)
  const [tiktokError, setTiktokError]   = useState(null)

  const [expanded,   setExpanded]   = useState({})
  const [showKey,    setShowKey]    = useState({})
  const [localKeys,  setLocalKeys]  = useState(secrets)
  const [saved,      setSaved]      = useState({})

  // ── Load TikTok status + saved keys on mount ──
  useEffect(() => {
    if (!IS_ELECTRON) {
      setTiktokStatus({ connected: false, demo: true })
      return
    }
    window.electronAPI.tiktokStatus().then(s => setTiktokStatus(s)).catch(() => setTiktokStatus({ connected: false }))
    window.electronAPI.getSecrets().then(enc => {
      if (enc) setLocalKeys(k => ({ ...k, ...enc }))
    }).catch(() => {})
  }, [])

  // ── TikTok OAuth ──────────────────────────────────────────────
  const handleTiktokConnect = async () => {
    if (!IS_ELECTRON) return
    setTiktokLoading(true)
    setTiktokError(null)
    try {
      const result = await window.electronAPI.tiktokConnect()
      if (result.connected) {
        setTiktokStatus(result)
        // Store open_id as the "key" so the stream engine knows it's authed
        setSecret('tiktok', result.openId || 'oauth')
        if (IS_ELECTRON) {
          await window.electronAPI.saveSecrets({ ...secrets, tiktok: result.openId || 'oauth' })
        }
      } else {
        setTiktokError(result.error || 'Authorization failed — try again')
      }
    } catch (e) {
      setTiktokError(e.message)
    } finally {
      setTiktokLoading(false)
    }
  }

  const handleTiktokDisconnect = async () => {
    if (!IS_ELECTRON) return
    setTiktokLoading(true)
    try {
      await window.electronAPI.tiktokDisconnect()
      setTiktokStatus({ connected: false })
      setSecret('tiktok', '')
      if (destinations.tiktok?.enabled) toggleDestination('tiktok')
    } finally {
      setTiktokLoading(false)
    }
  }

  // ── Key-link platforms (YT/FB/Twitch) ────────────────────────
  const openUrl = (url) => {
    if (IS_ELECTRON) window.electronAPI.openExternal(url)
    else window.open(url, '_blank', 'noopener')
  }

  const handleSaveKey = async (id) => {
    const key = localKeys[id] || ''
    if (!key.trim()) return
    setSecret(id, key)
    if (IS_ELECTRON) {
      await window.electronAPI.saveSecrets({ ...secrets, [id]: key })
    }
    setSaved(s => ({ ...s, [id]: true }))
    setExpanded(e => ({ ...e, [id]: false }))
    setTimeout(() => setSaved(s => ({ ...s, [id]: false })), 2000)
  }

  const handleDisconnectKey = async (id) => {
    setSecret(id, '')
    setLocalKeys(k => ({ ...k, [id]: '' }))
    if (IS_ELECTRON) {
      await window.electronAPI.saveSecrets({ ...secrets, [id]: '' })
    }
    if (destinations[id]?.enabled) toggleDestination(id)
    setExpanded(e => ({ ...e, [id]: false }))
  }

  const isConnected = (id) => {
    if (id === 'tiktok') return tiktokStatus?.connected
    if (id === 'rainbowland') return true
    return !!(secrets[id] || localKeys[id])
  }

  return (
    <div className="px-3 pb-3 space-y-2">
      {Object.entries(destinations).map(([id, dest]) => {
        const p          = PLATFORMS[id]
        const connected  = isConnected(id)
        const isOpen     = expanded[id]

        return (
          <div key={id}
            className={clsx(
              'rounded-xl border transition-all overflow-hidden',
              dest.enabled ? 'border-white/15 bg-dark-700' : 'border-white/5 bg-dark-800'
            )}>

            {/* ── Header ── */}
            <div className="flex items-center gap-2.5 px-3 py-2.5">
              <span className="text-lg leading-none">{p?.icon}</span>

              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-bold leading-tight">{p?.label}</p>
                <p className={clsx('text-[10px] leading-tight mt-0.5',
                  connected ? 'text-green-400' : 'text-white/30'
                )}>
                  {p?.mode === 'auto'
                    ? '● Always on'
                    : p?.mode === 'oauth' && tiktokStatus?.connected
                      ? `● ${tiktokStatus.displayName || 'Connected'}`
                      : connected
                        ? '● Key saved'
                        : '○ Not connected'}
                </p>
              </div>

              {/* Action button */}
              {p?.mode === 'auto' ? (
                <span className="text-[10px] text-green-400 font-semibold px-2 py-1 bg-green-400/10 rounded-full">Auto</span>

              ) : p?.mode === 'oauth' ? (
                /* TikTok OAuth button */
                tiktokStatus === null ? (
                  <Loader className="w-4 h-4 text-white/30 animate-spin" />
                ) : tiktokStatus.connected ? (
                  <div className="flex items-center gap-1.5">
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-500/15 text-green-400 text-[11px] font-semibold">
                      <Check className="w-3 h-3" /> Connected
                    </span>
                    <button onClick={handleTiktokDisconnect} disabled={tiktokLoading}
                      className="p-1 text-white/20 hover:text-red-400 transition-colors">
                      <Unlink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleTiktokConnect}
                    disabled={tiktokLoading || tiktokStatus?.demo}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 bg-white/5 text-white text-[11px] font-bold hover:bg-white/10 transition-all disabled:opacity-40"
                  >
                    {tiktokLoading
                      ? <><Loader className="w-3 h-3 animate-spin" /> Connecting…</>
                      : <><Link2 className="w-3 h-3" /> Connect TikTok</>}
                  </button>
                )

              ) : connected ? (
                /* Key-based: already connected */
                <div className="flex items-center gap-1">
                  <button onClick={() => setExpanded(e => ({ ...e, [id]: !isOpen }))}
                    className="p-1 text-white/20 hover:text-white/50 transition-colors">
                    {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-500/15 text-green-400 text-[11px] font-semibold">
                    <Check className="w-3 h-3" /> Connected
                  </span>
                </div>

              ) : (
                /* Key-based: not connected */
                <button
                  onClick={() => {
                    if (p?.connectUrl) openUrl(p.connectUrl)
                    setExpanded(e => ({ ...e, [id]: true }))
                  }}
                  style={{ borderColor: `${p?.color}55`, color: p?.color, background: `${p?.color}15` }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold hover:opacity-80 transition-opacity"
                >
                  <ExternalLink className="w-3 h-3" />
                  {p?.connectLabel || 'Connect'}
                </button>
              )}

              {/* Enable toggle — only when connected */}
              {(connected || p?.mode === 'auto') && (
                <button
                  onClick={() => toggleDestination(id)}
                  className={clsx(
                    'w-10 h-5 rounded-full transition-all relative flex-shrink-0 ml-1',
                    dest.enabled ? 'bg-rainbow-purple' : 'bg-dark-500'
                  )}>
                  <span className={clsx(
                    'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm',
                    dest.enabled ? 'left-5' : 'left-0.5'
                  )} />
                </button>
              )}
            </div>

            {/* ── TikTok error ── */}
            {id === 'tiktok' && tiktokError && (
              <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[11px]">
                ⚠️ {tiktokError}
              </div>
            )}

            {/* ── Expanded key panel (keylink + manual) ── */}
            {isOpen && (p?.mode === 'keylink' || p?.mode === 'manual') && (
              <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-2.5">

                {/* Open platform button (when not connected yet) */}
                {p?.connectUrl && !connected && (
                  <button
                    onClick={() => openUrl(p.connectUrl)}
                    style={{ borderColor: `${p?.color}40`, color: p?.color }}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border bg-white/3 text-xs font-semibold hover:opacity-80 transition-opacity"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    1. Open {p.label} → copy stream key
                  </button>
                )}

                {/* Custom URL field */}
                {id === 'custom' && (
                  <input
                    className="w-full bg-dark-600 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder-white/30 outline-none focus:border-orange-500/50"
                    placeholder="rtmp://your-server.com/live"
                    value={destinations.custom?.customUrl || ''}
                    onChange={e => setDestination('custom', { customUrl: e.target.value, rtmpBase: e.target.value })}
                  />
                )}

                {/* Key input */}
                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <input
                      autoFocus={!connected}
                      type={showKey[id] ? 'text' : 'password'}
                      className="w-full bg-dark-600 border border-white/10 rounded-lg px-3 py-2 pr-8 text-white text-xs placeholder-white/30 outline-none focus:border-white/30 font-mono"
                      placeholder={connected ? '•••••••••••• (saved)' : (p?.keyPlaceholder || 'Paste stream key…')}
                      value={localKeys[id] || ''}
                      onChange={e => setLocalKeys(k => ({ ...k, [id]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && handleSaveKey(id)}
                    />
                    <button onClick={() => setShowKey(s => ({ ...s, [id]: !s[id] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                      {showKey[id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <button
                    onClick={() => handleSaveKey(id)}
                    disabled={!(localKeys[id] || '').trim()}
                    className={clsx(
                      'px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1 transition-all',
                      saved[id]
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : 'bg-rainbow-purple/80 hover:bg-rainbow-purple text-white disabled:opacity-40'
                    )}>
                    {saved[id] ? <><Check className="w-3 h-3" /> Saved!</> : connected ? 'Update' : '2. Save Key'}
                  </button>
                </div>

                <p className="text-white/25 text-[10px]">{p?.hint}</p>

                {connected && (
                  <button onClick={() => handleDisconnectKey(id)}
                    className="flex items-center gap-1 text-red-400/50 hover:text-red-400 text-[10px] transition-colors mt-1">
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
