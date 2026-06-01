/**
 * DonationPrompt — tasteful, non-intrusive donation ask.
 * Shows after a successful stream ends (never on launch).
 * Opens PayPal.me in the system browser via Electron shell.
 */
import React, { useState } from 'react'
import { Heart, X, ExternalLink, Coffee } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

const PAYPAL_URL = 'https://paypal.me/josephbennett99'

const AMOUNTS = [
  { label: '$1',  value: 1,  emoji: '☕' },
  { label: '$5',  value: 5,  emoji: '🌈' },
  { label: '$10', value: 10, emoji: '💜' },
  { label: 'Any', value: '', emoji: '🎉' },
]

export default function DonationPrompt({ onClose, trigger = 'stream-end' }) {
  const { colors, gradients } = useTheme()
  const [hoveredAmt, setHoveredAmt] = useState(null)

  const openPayPal = (amount) => {
    const url = amount ? `${PAYPAL_URL}/${amount}` : PAYPAL_URL
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(url)
    } else {
      window.open(url, '_blank')
    }
    onClose?.()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>

      <div className="relative w-full max-w-sm rounded-3xl overflow-hidden"
        style={{ background: colors.bg800, border: `1px solid rgba(255,255,255,0.08)` }}>

        {/* Gradient top bar */}
        <div className="h-1.5" style={{ background: gradients.brand }} />

        {/* Dismiss */}
        <button onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full transition-colors"
          style={{ background: colors.bg600, color: colors.textMuted }}>
          <X className="w-4 h-4" />
        </button>

        <div className="p-7">

          {/* Icon */}
          <div className="flex justify-center mb-5">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                style={{ background: gradients.brand }}>
                🌈
              </div>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: colors.bg800, border: `2px solid ${colors.bg800}` }}>
                <Heart className="w-4 h-4" style={{ color: colors.secondary }} />
              </div>
            </div>
          </div>

          {/* Copy */}
          <h2 className="text-xl font-black text-white text-center mb-2">
            {trigger === 'stream-end'
              ? 'Great stream! 🎉'
              : 'Rainbow Land is free'}
          </h2>

          <p className="text-sm text-center leading-relaxed mb-6"
            style={{ color: colors.textSecondary }}>
            This app is completely free — no subscriptions, no ads, no data selling.
            If it's helped you reach your audience, a small tip keeps development going.
          </p>

          {/* Amount buttons */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {AMOUNTS.map(a => (
              <button
                key={a.label}
                onClick={() => openPayPal(a.value)}
                onMouseEnter={() => setHoveredAmt(a.label)}
                onMouseLeave={() => setHoveredAmt(null)}
                className="flex flex-col items-center gap-1 py-3 rounded-2xl border transition-all"
                style={{
                  background:   hoveredAmt === a.label ? `${colors.primary}20` : colors.bg700,
                  borderColor:  hoveredAmt === a.label ? `${colors.primary}60` : 'rgba(255,255,255,0.07)',
                  transform:    hoveredAmt === a.label ? 'translateY(-2px)' : 'none',
                }}>
                <span className="text-xl">{a.emoji}</span>
                <span className="text-xs font-black text-white">{a.label}</span>
              </button>
            ))}
          </div>

          {/* PayPal CTA */}
          <button
            onClick={() => openPayPal('')}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-white text-sm transition-all active:scale-95"
            style={{ background: gradients.liveButton, boxShadow: `0 6px 24px ${colors.secondary}30` }}>
            <span>Donate via PayPal</span>
            <ExternalLink className="w-4 h-4" />
          </button>

          {/* Skip */}
          <button onClick={onClose}
            className="w-full mt-3 py-2 text-xs font-medium transition-colors"
            style={{ color: colors.textMuted }}>
            Maybe later — keep streaming for free
          </button>
        </div>
      </div>
    </div>
  )
}
