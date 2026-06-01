import React, { useState, useRef, useEffect } from 'react'
import clsx from 'clsx'
import {
  Mic, MicOff, Camera, CameraOff, Monitor, MonitorOff,
  FlipHorizontal, Settings, Radio, Square, Send,
  Eye, Heart, Clock, Sparkles, ChevronDown, ChevronUp,
  CheckCircle, XCircle, AlertCircle, Loader, Palette, X
} from 'lucide-react'
import { useStream, QUALITY_PRESETS } from '../hooks/useStream'
import { useStore }   from '../hooks/useStore'
import { useTheme }   from '../hooks/useTheme'
import DestinationManager from '../components/studio/DestinationManager'
import ThemePicker        from '../components/studio/ThemePicker'
import GPUStatus          from '../components/studio/GPUStatus'

const DEST_ICONS = {
  rainbowland: '🌈', tiktok: '🎵', youtube: '▶️',
  facebook: '📘', twitch: '🎮', custom: '📡',
}

const CHAT_POOL = [
  { user: 'Nova ✨',       text: 'omg youre live!!!!' },
  { user: 'Jade 💎',       text: 'the camera looks amazing' },
  { user: 'Zephyr 🌊',    text: '🌈🌈🌈' },
  { user: 'Marigold 🌻',  text: 'QUEEN BEHAVIOR' },
  { user: 'Orion 🌌',     text: 'first time watching — already obsessed' },
  { user: 'Axel 🔥',      text: 'the overlay is everything' },
  { user: 'Celestia 🌙',  text: '💜💜💜' },
  { user: 'Ray 🌈',        text: 'going live on all platforms at once wtf' },
  { user: 'Prism ⭐',      text: 'this app is so good' },
]

// ── Sidebar panel IDs ─────────────────────────────────────────
const PANELS = {
  destinations: 'destinations',
  theme:        'theme',
  settings:     'settings',
}

export default function StudioPage() {
  const {
    videoRef, camOn, micOn, screenOn, quality, isLive,
    activeStreams, elapsed, error, ffmpegFound, isElectron,
    toggleCamera, flipCamera, toggleMic, toggleScreen,
    goLive, endStream, setQuality, formatTime,
    encoderInfo, setEncoderOverride,
  } = useStream()

  const { user, destinations, streamTitle, setStreamTitle } = useStore()
  const { theme, colors, gradients, overlays, style }       = useTheme()

  const [activeOverlay,  setActiveOverlay]  = useState(overlays[0]?.id || 'none')
  const [openPanel,      setOpenPanel]      = useState(PANELS.destinations)
  const [chat,           setChat]           = useState([])
  const [chatInput,      setChatInput]      = useState('')
  const [viewers,        setViewers]        = useState(0)
  const [likes,          setLikes]          = useState(0)
  const [aiLoading,      setAiLoading]      = useState(false)
  const [hearts,         setHearts]         = useState([])
  const chatEndRef = useRef(null)

  const enabledCount      = Object.values(destinations).filter(d => d.enabled).length
  const selectedOverlayDef = overlays.find(o => o.id === activeOverlay)

  // Reset overlay when theme changes (themes have different overlay sets)
  useEffect(() => {
    setActiveOverlay(overlays[0]?.id || 'none')
  }, [theme.id])

  // ── Simulate live activity ───────────────────────────────────
  useEffect(() => {
    if (!isLive) return
    const vSim = setInterval(() => setViewers(v => v + Math.floor(Math.random() * 12)), 4000)
    const cSim = setInterval(() => {
      const m = CHAT_POOL[Math.floor(Math.random() * CHAT_POOL.length)]
      setChat(c => [...c.slice(-60), {
        ...m, id: Date.now(),
        color: [colors.primary, colors.secondary, colors.tertiary][Math.floor(Math.random()*3)]
      }])
    }, 2800)
    const lSim = setInterval(() => {
      setLikes(l => l + Math.floor(Math.random() * 18))
      setHearts(h => [...h, { id: Date.now(), x: 15 + Math.random() * 70 }])
      setTimeout(() => setHearts(h => h.slice(1)), 2600)
    }, 2200)
    return () => { clearInterval(vSim); clearInterval(cSim); clearInterval(lSim) }
  }, [isLive, colors])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat])

  // ── AI title ─────────────────────────────────────────────────
  const handleAiTitle = async () => {
    setAiLoading(true)
    try {
      const r = await fetch('/api/ai-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: `${user.name} live stream on ${theme.name}`, style: 'hype' }),
      })
      const d = await r.json()
      setStreamTitle(d.caption || `${user.name} is LIVE 🔴`)
    } catch {
      setStreamTitle(`${user.name} is LIVE on ${theme.name} 🔴`)
    }
    setAiLoading(false)
  }

  const sendChat = () => {
    if (!chatInput.trim()) return
    setChat(c => [...c, { id: Date.now(), user: user.name, color: colors.primary, text: chatInput.trim() }])
    setChatInput('')
  }

  const togglePanel = (id) => setOpenPanel(p => p === id ? null : id)

  return (
    <div className="h-screen flex flex-col overflow-hidden"
      style={{ background: colors.bg900 }}>

      {/* ── Custom titlebar (Electron) ── */}
      {isElectron && (
        <div className="flex-shrink-0 h-8 flex items-center justify-between px-4 select-none"
          style={{ background: colors.bg900, WebkitAppRegion: 'drag' }}>
          <span className="themed-gradient-text font-black text-sm">
            {theme.name} Studio
          </span>
          <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: 'no-drag' }}>
            <button onClick={() => window.electronAPI.minimize()}
              className="w-3 h-3 rounded-full bg-yellow-400 hover:brightness-110" />
            <button onClick={() => window.electronAPI.maximize()}
              className="w-3 h-3 rounded-full bg-green-400 hover:brightness-110" />
            <button onClick={() => window.electronAPI.close()}
              className="w-3 h-3 rounded-full bg-red-400 hover:brightness-110" />
          </div>
        </div>
      )}

      {/* ── Main layout ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ═══ LEFT: Camera preview ═══ */}
        <div className="relative flex-1 flex flex-col" style={{ background: colors.bg800 }}>

          {/* Video */}
          <div className="relative flex-1 overflow-hidden">
            <video ref={videoRef} autoPlay playsInline muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }} />

            {/* No cam placeholder */}
            {!camOn && (
              <div className="absolute inset-0 flex items-center justify-center"
                style={{ background: colors.bg900 }}>
                <div className="text-center">
                  <div className="text-6xl mb-3">{user.avatar}</div>
                  <p className="text-sm" style={{ color: colors.textMuted }}>Camera is off</p>
                  {error && <p className="text-xs mt-2 max-w-xs" style={{ color: colors.error }}>{error}</p>}
                </div>
              </div>
            )}

            {/* Pride / theme overlay bars */}
            {selectedOverlayDef?.style && (
              <>
                {(theme.overlay.position === 'top' || theme.overlay.position === 'both') && (
                  <div className="absolute top-0 left-0 right-0 opacity-85"
                    style={{ height: theme.overlay.height, background: selectedOverlayDef.style }} />
                )}
                {(theme.overlay.position === 'bottom' || theme.overlay.position === 'both') && (
                  <div className="absolute bottom-0 left-0 right-0 opacity-85"
                    style={{ height: theme.overlay.height, background: selectedOverlayDef.style }} />
                )}
              </>
            )}

            {/* Floating hearts */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {hearts.map(h => (
                <div key={h.id} className="absolute text-2xl"
                  style={{ bottom: '20%', left: `${h.x}%`, animation: 'floatUp 2.5s ease-out forwards' }}>
                  ❤️
                </div>
              ))}
            </div>

            {/* LIVE badge + stats */}
            {isLive && (
              <div className="absolute top-4 left-4 flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                  style={{ background: `${colors.live}dd` }}>
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  <span className="text-white text-xs font-black">LIVE</span>
                  <span className="text-white/80 text-xs ml-1">{formatTime(elapsed)}</span>
                </div>
                <div className="glass px-2.5 py-1.5 rounded-full flex items-center gap-1">
                  <Eye className="w-3 h-3" style={{ color: colors.success }} />
                  <span className="text-white text-xs font-bold">{viewers.toLocaleString()}</span>
                </div>
                <div className="glass px-2.5 py-1.5 rounded-full flex items-center gap-1">
                  <Heart className="w-3 h-3" style={{ color: colors.error }} />
                  <span className="text-white text-xs font-bold">{likes.toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Active destination badges */}
            {isLive && (
              <div className="absolute top-4 right-4 flex flex-col gap-1">
                {Object.entries(activeStreams).map(([id, status]) => (
                  <div key={id} className="flex items-center gap-1.5 glass px-2.5 py-1 rounded-full">
                    <span className="text-sm">{DEST_ICONS[id]}</span>
                    <span className={clsx('text-[10px] font-bold',
                      status === 'streaming' ? 'text-green-400' : 'text-red-400')}>
                      {status === 'streaming' ? 'LIVE' : 'ERR'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Watermark */}
            {theme.overlay.showWatermark && (
              <div className={clsx('absolute text-white/20 text-xs font-bold',
                theme.overlay.watermarkPos === 'bottom-right' ? 'bottom-4 right-4' :
                theme.overlay.watermarkPos === 'bottom-left'  ? 'bottom-4 left-4' :
                'top-4 right-4')}>
                {theme.name}
              </div>
            )}

            {/* Stream title */}
            {streamTitle && (
              <div className="absolute bottom-4 left-4 right-4">
                <div className="glass px-3 py-2 rounded-xl inline-block max-w-sm"
                  style={{ border: `1px solid ${colors.primary}33` }}>
                  <p className="text-white font-bold text-sm truncate">{streamTitle}</p>
                  <p className="text-xs" style={{ color: colors.textMuted }}>{user.handle}</p>
                </div>
              </div>
            )}
          </div>

          {/* ── Camera toolbar ── */}
          <div className="flex-shrink-0 px-4 py-3 flex items-center gap-3"
            style={{ background: colors.bg800, borderTop: `1px solid rgba(255,255,255,0.05)` }}>

            {/* Cam */}
            <button onClick={toggleCamera} className={clsx(
              'p-2.5 rounded-xl border transition-all',
              camOn ? `border-[${colors.tertiary}55] bg-[${colors.tertiary}11] text-[${colors.tertiary}]` : 'border-white/10 glass text-white/40'
            )} style={camOn ? { borderColor: `${colors.tertiary}55`, background: `${colors.tertiary}11`, color: colors.tertiary } : {}}>
              {camOn ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
            </button>

            {/* Mic */}
            <button onClick={toggleMic} className="p-2.5 rounded-xl border transition-all"
              style={micOn
                ? { borderColor: `${colors.success}55`, background: `${colors.success}11`, color: colors.success }
                : { borderColor: `${colors.error}44`,   background: `${colors.error}11`,   color: colors.error }}>
              {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </button>

            {/* Screen share */}
            <button onClick={toggleScreen} className="p-2.5 rounded-xl border transition-all"
              style={screenOn
                ? { borderColor: `${colors.warning}55`, background: `${colors.warning}11`, color: colors.warning }
                : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>
              {screenOn ? <Monitor className="w-5 h-5" /> : <MonitorOff className="w-5 h-5" />}
            </button>

            {/* Flip */}
            <button onClick={flipCamera}
              className="p-2.5 rounded-xl border border-white/10 glass text-white/40 hover:text-white transition-colors">
              <FlipHorizontal className="w-5 h-5" />
            </button>

            <div className="flex-1" />

            {/* Overlay picker — uses current theme's overlays */}
            <select value={activeOverlay} onChange={e => setActiveOverlay(e.target.value)}
              className="rounded-xl px-3 py-2 text-white text-xs outline-none border border-white/10"
              style={{ background: colors.bg600 }}>
              {overlays.map(o => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>

            {/* Quality */}
            <select value={quality} onChange={e => setQuality(e.target.value)}
              className="rounded-xl px-3 py-2 text-white text-xs outline-none border border-white/10"
              style={{ background: colors.bg600 }}>
              {Object.entries(QUALITY_PRESETS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ═══ RIGHT: Sidebar ═══ */}
        <div className="w-80 flex-shrink-0 flex flex-col"
          style={{ background: colors.bg800, borderLeft: '1px solid rgba(255,255,255,0.05)' }}>

          {/* Stream title */}
          <div className="flex-shrink-0 p-4"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-xs font-bold uppercase tracking-wider mb-2"
              style={{ color: colors.textMuted }}>
              Stream Title
            </p>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-xl px-3 py-2 text-white text-sm placeholder-white/30 outline-none border border-white/10"
                style={{ background: colors.bg700, focusBorderColor: colors.primary }}
                placeholder="What's your stream about?"
                value={streamTitle}
                onChange={e => setStreamTitle(e.target.value)}
              />
              <button onClick={handleAiTitle} disabled={aiLoading}
                className="px-3 py-2 rounded-xl glass border text-xs flex items-center gap-1"
                style={{ borderColor: `${colors.primary}44`, color: colors.primary }}>
                <Sparkles className={clsx('w-3.5 h-3.5', aiLoading && 'animate-spin')} />
                AI
              </button>
            </div>
          </div>

          {/* ── Panel tabs ── */}
          <div className="flex-shrink-0 flex"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {[
              { id: PANELS.destinations, icon: Radio,   label: `Streams (${enabledCount})` },
              { id: PANELS.theme,        icon: Palette,  label: 'Theme' },
              { id: PANELS.settings,     icon: Settings, label: 'Settings' },
            ].map(tab => (
              <button key={tab.id}
                onClick={() => togglePanel(tab.id)}
                className="flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-bold transition-all"
                style={{
                  color:        openPanel === tab.id ? colors.primary : colors.textMuted,
                  borderBottom: openPanel === tab.id ? `2px solid ${colors.primary}` : '2px solid transparent',
                }}>
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div className="flex-shrink-0 overflow-y-auto" style={{ maxHeight: '45%' }}>
            {openPanel === PANELS.destinations && (
              <>
                {/* ffmpeg status */}
                {isElectron && (
                  <div className="flex items-center gap-2 px-4 py-2"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    {ffmpegFound === null ? <Loader className="w-3.5 h-3.5 animate-spin" style={{ color: colors.textMuted }} />
                      : ffmpegFound ? <CheckCircle className="w-3.5 h-3.5" style={{ color: colors.success }} />
                      : <AlertCircle className="w-3.5 h-3.5" style={{ color: colors.warning }} />}
                    <span className="text-xs" style={{ color: colors.textMuted }}>
                      {ffmpegFound === null ? 'Checking ffmpeg...'
                        : ffmpegFound ? 'ffmpeg ready — real RTMP streaming enabled'
                        : 'ffmpeg not found — install to enable real streaming'}
                    </span>
                  </div>
                )}
                <div className="p-3">
                  <DestinationManager />
                </div>
              </>
            )}
            {openPanel === PANELS.theme && (
              <div className="p-3">
                <ThemePicker />
              </div>
            )}
            {openPanel === PANELS.settings && (
              <div className="p-4 space-y-4">

                {/* GPU Encoder */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: colors.textMuted }}>
                    Encoder
                  </p>
                  <GPUStatus onEncoderChange={setEncoderOverride} />
                </div>

                {/* Quality */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: colors.textMuted }}>
                    Quality
                  </p>
                  {Object.entries(QUALITY_PRESETS).map(([k, v]) => (
                    <button key={k} onClick={() => setQuality(k)}
                      className={clsx('w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-all mb-1.5')}
                      style={{
                        background:  quality === k ? `${colors.primary}15` : colors.bg700,
                        borderColor: quality === k ? `${colors.primary}55`  : 'rgba(255,255,255,0.07)',
                        color:       quality === k ? colors.primary          : colors.textSecondary,
                      }}>
                      <span className="font-bold text-sm">{v.label}</span>
                      <span className="text-xs opacity-60">{v.videoBitrate} · {v.audioBitrate}</span>
                    </button>
                  ))}
                </div>

                {/* Mode info */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: colors.textMuted }}>
                    Streaming Mode
                  </p>
                  <div className="flex items-start gap-3 px-3 py-2.5 rounded-xl"
                    style={{ background: colors.bg700, border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ background: colors.success }} />
                    <div>
                      <p className="text-white text-xs font-bold">Multi-Threaded RTMP</p>
                      <p className="text-[10px]" style={{ color: colors.textMuted }}>
                        Isolated Worker thread + ffmpeg process per destination.
                        One platform freezing never affects others.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Live chat */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
            {!isLive && (
              <div className="flex items-center justify-center h-full">
                <p className="text-xs text-center" style={{ color: colors.textMuted }}>
                  Chat appears here when you go live
                </p>
              </div>
            )}
            {chat.map(m => (
              <div key={m.id} className="flex items-start gap-2 animate-fade-in">
                <div className="flex-1 glass rounded-xl px-2.5 py-1.5">
                  <span className="text-xs font-bold mr-1.5" style={{ color: m.color }}>{m.user}</span>
                  <span className="text-xs" style={{ color: colors.textSecondary }}>{m.text}</span>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Chat input */}
          {isLive && (
            <div className="flex-shrink-0 p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-xl px-3 py-2 text-white text-xs placeholder-white/30 outline-none border border-white/10"
                  style={{ background: colors.bg700 }}
                  placeholder="Reply to chat..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendChat()}
                />
                <button onClick={sendChat} className="p-2 rounded-xl"
                  style={{ background: colors.primary }}>
                  <Send className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          )}

          {/* ── GO LIVE button ── */}
          <div className="flex-shrink-0 p-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            {!isLive ? (
              <button onClick={goLive} disabled={enabledCount === 0}
                className={clsx('w-full py-4 rounded-2xl font-black text-lg text-white transition-all',
                  enabledCount > 0 ? 'active:scale-95' : 'cursor-not-allowed opacity-40')}
                style={enabledCount > 0 ? {
                  background:  gradients.liveButton,
                  boxShadow:   `0 8px 32px ${colors.secondary}40`,
                } : { background: colors.bg600 }}>
                {enabledCount === 0
                  ? 'Add a destination first'
                  : `🔴 Go Live to ${enabledCount} platform${enabledCount > 1 ? 's' : ''}`}
              </button>
            ) : (
              <button onClick={endStream}
                className="w-full py-4 rounded-2xl font-black text-lg text-white active:scale-95 transition-all flex items-center justify-center gap-2"
                style={{ background: colors.live }}>
                <Square className="w-5 h-5 fill-white" />
                End Stream
              </button>
            )}

            {/* Active stream status pills */}
            {isLive && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {Object.entries(activeStreams).map(([id, status]) => (
                  <div key={id} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold"
                    style={{
                      background: status === 'streaming' ? `${colors.success}18` : `${colors.error}18`,
                      color:      status === 'streaming' ? colors.success         : colors.error,
                    }}>
                    <span>{DEST_ICONS[id]}</span>
                    <span>{destinations[id]?.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes floatUp {
          0%   { transform: translateY(0) scale(1);    opacity: 1; }
          100% { transform: translateY(-180px) scale(1.3); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
