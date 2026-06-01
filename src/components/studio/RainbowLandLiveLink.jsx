/**
 * Shows the Rainbow Land live stream link once you're live.
 * Appears in the Studio sidebar when streaming.
 */
import React, { useEffect, useState } from 'react'
import { Radio, Copy, Check, ExternalLink } from 'lucide-react'

const IS_ELECTRON = typeof window !== 'undefined' && !!window.electronAPI

export default function RainbowLandLiveLink({ isLive }) {
  const [hlsUrl,  setHlsUrl]  = useState(null)
  const [viewUrl, setViewUrl] = useState(null)
  const [copied,  setCopied]  = useState(false)

  useEffect(() => {
    if (!isLive || !IS_ELECTRON) return
    // Poll for the HLS URL after go-live
    const poll = setInterval(async () => {
      try {
        const result = await window.electronAPI.getRlHlsUrl()
        if (result?.key) {
          setHlsUrl(result.hlsUrl)
          setViewUrl(`https://rainbowland.cc/live/${result.key}`)
          clearInterval(poll)
        }
      } catch {}
    }, 1500)
    return () => clearInterval(poll)
  }, [isLive])

  // Listen for the rtmp:event rl-stream-ready
  useEffect(() => {
    if (!IS_ELECTRON) return
    const handler = (_, msg) => {
      if (msg.type === 'rl-stream-ready') {
        setHlsUrl(msg.hlsUrl)
        setViewUrl(`https://rainbowland.cc/live/${msg.key}`)
      }
      if (msg.type === 'stopped' && msg.destId === 'rainbowland') {
        setHlsUrl(null)
        setViewUrl(null)
      }
    }
    window.electronAPI.onRtmpEvent?.(handler)
    return () => window.electronAPI.offRtmpEvent?.(handler)
  }, [])

  if (!isLive || !viewUrl) return null

  const copy = () => {
    navigator.clipboard.writeText(viewUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const open = () => {
    if (IS_ELECTRON) window.electronAPI.openExternal(viewUrl)
    else window.open(viewUrl, '_blank')
  }

  return (
    <div className="mx-3 mb-2 rounded-xl border border-rainbow-purple/30 bg-rainbow-purple/10 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Radio className="w-3.5 h-3.5 text-rainbow-purple animate-pulse" />
        <span className="text-white text-xs font-bold">You're live on Rainbow Land!</span>
      </div>
      <p className="text-white/40 text-[10px] mb-2">Share this link so viewers can watch:</p>
      <div className="flex items-center gap-1.5">
        <div className="flex-1 bg-dark-900 rounded-lg px-2.5 py-1.5 text-rainbow-blue text-[11px] font-mono truncate">
          {viewUrl}
        </div>
        <button onClick={copy}
          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all">
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
        <button onClick={open}
          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all">
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
