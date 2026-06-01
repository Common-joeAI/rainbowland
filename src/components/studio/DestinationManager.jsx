/**
 * DestinationManager
 * Shows all streaming destinations with toggle, stream key input, and status.
 * Keys are saved via Electron safeStorage when in Electron mode.
 */
import React, { useState, useEffect } from 'react'
import clsx from 'clsx'
import { Eye, EyeOff, Check, ExternalLink } from 'lucide-react'
import { useStore } from '../../hooks/useStore'

const IS_ELECTRON = typeof window !== 'undefined' && !!window.electronAPI

const DEST_HELP = {
  rainbowland: { keyLabel: 'Stream Key',   hint: 'Your Rainbow Land stream key (auto-generated when you go live)', docsUrl: 'https://rainbowland.cc' },
  tiktok:      { keyLabel: 'Stream Key',   hint: 'TikTok Live Studio → Go Live → Stream Key', docsUrl: 'https://www.tiktok.com/live/creator' },
  youtube:     { keyLabel: 'Stream Key',   hint: 'YouTube Studio → Go Live → Stream Key',     docsUrl: 'https://studio.youtube.com' },
  facebook:    { keyLabel: 'Stream Key',   hint: 'Facebook → Live Producer → Stream Key',     docsUrl: 'https://www.facebook.com/live/producer' },
  twitch:      { keyLabel: 'Stream Key',   hint: 'Twitch Dashboard → Settings → Stream Key',  docsUrl: 'https://dashboard.twitch.tv' },
  custom:      { keyLabel: 'Stream Key',   hint: 'Your custom RTMP stream key', docsUrl: null },
}

export default function DestinationManager() {
  const { destinations, secrets, setDestination, toggleDestination, setSecret } = useStore()
  const [showKeys,   setShowKeys]   = useState({})
  const [saved,      setSaved]      = useState({})
  const [localKeys,  setLocalKeys]  = useState(secrets)
  const [customUrl,  setCustomUrl]  = useState(destinations.custom?.customUrl || '')

  // Load secrets from Electron safeStorage on mount
  useEffect(() => {
    if (!IS_ELECTRON) return
    window.electronAPI.getSecrets().then(enc => {
      if (enc) setLocalKeys(k => ({ ...k, ...enc }))
    })
  }, [])

  const handleKeyChange = (id, val) => {
    setLocalKeys(k => ({ ...k, [id]: val }))
  }

  const handleSaveKey = async (id) => {
    setSecret(id, localKeys[id])
    if (IS_ELECTRON) {
      await window.electronAPI.saveSecrets({ ...secrets, [id]: localKeys[id] })
    }
    setSaved(s => ({ ...s, [id]: true }))
    setTimeout(() => setSaved(s => ({ ...s, [id]: false })), 2000)
  }

  const toggleShowKey = (id) => setShowKeys(s => ({ ...s, [id]: !s[id] }))

  return (
    <div className="px-3 pb-3 space-y-2">
      {Object.entries(destinations).map(([id, dest]) => {
        const help = DEST_HELP[id]
        return (
          <div key={id}
            className={clsx(
              'rounded-xl border transition-all overflow-hidden',
              dest.enabled ? 'border-white/15 bg-dark-700' : 'border-white/5 bg-dark-800'
            )}>

            {/* Header row */}
            <div className="flex items-center gap-2.5 px-3 py-2.5">
              <span className="text-lg">{dest.icon}</span>
              <div className="flex-1">
                <p className="text-white text-sm font-bold">{dest.label}</p>
                {dest.enabled && secrets[id] && (
                  <p className="text-green-400 text-[10px]">Key saved ✓</p>
                )}
                {dest.enabled && !secrets[id] && !localKeys[id] && (
                  <p className="text-yellow-400 text-[10px]">Stream key required</p>
                )}
              </div>

              {/* Help link */}
              {help?.docsUrl && (
                <a href={help.docsUrl} target="_blank" rel="noopener noreferrer"
                  className="text-white/20 hover:text-white/60 transition-colors"
                  onClick={e => {
                    if (IS_ELECTRON) {
                      e.preventDefault()
                      window.electronAPI.openExternal(help.docsUrl)
                    }
                  }}>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}

              {/* Toggle */}
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
            </div>

            {/* Stream key input (when enabled) */}
            {dest.enabled && (
              <div className="px-3 pb-3 space-y-1.5">
                {/* Custom URL for custom RTMP */}
                {id === 'custom' && (
                  <input
                    className="w-full bg-dark-600 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder-white/30 outline-none focus:border-rainbow-orange/50"
                    placeholder="rtmp://your-server.com/live"
                    value={customUrl}
                    onChange={e => {
                      setCustomUrl(e.target.value)
                      setDestination('custom', { customUrl: e.target.value, rtmpBase: e.target.value })
                    }}
                  />
                )}

                <p className="text-white/30 text-[10px]">{help?.hint}</p>

                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <input
                      type={showKeys[id] ? 'text' : 'password'}
                      className="w-full bg-dark-600 border border-white/10 rounded-lg px-3 py-2 pr-8 text-white text-xs placeholder-white/30 outline-none focus:border-rainbow-purple/50 font-mono"
                      placeholder={`${help?.keyLabel || 'Stream key'}...`}
                      value={localKeys[id] || ''}
                      onChange={e => handleKeyChange(id, e.target.value)}
                    />
                    <button
                      onClick={() => toggleShowKey(id)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                      {showKeys[id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <button
                    onClick={() => handleSaveKey(id)}
                    className={clsx(
                      'px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1 transition-all',
                      saved[id]
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : 'glass border border-white/10 text-white/60 hover:text-white'
                    )}>
                    {saved[id] ? <><Check className="w-3 h-3" /> Saved</> : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
