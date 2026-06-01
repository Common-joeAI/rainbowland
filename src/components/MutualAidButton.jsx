/**
 * MutualAidButton — one-tap micro-donation tied to mutual aid hashtags.
 * Appears on videos tagged with #TransMutualAid, #MutualAid, etc.
 * Opens a bottom sheet with preset amounts + real org links.
 */
import React, { useState, useCallback } from 'react'
import { Heart, X, ExternalLink, ChevronRight, Sparkles } from 'lucide-react'
import clsx from 'clsx'

// Mutual aid orgs mapped to hashtags — all verified 501c3 or fiscally-sponsored
export const MUTUAL_AID_ORGS = {
  transmutualaid: {
    name:     'Trans Lifeline',
    desc:     'Peer support & micro-grants for trans people in crisis',
    url:      'https://translifeline.org/donate',
    emoji:    '⚧️',
    color:    '#55CDFC',
    tags:     ['transmutualaid', 'trans', 'transjoy'],
  },
  mutualaid: {
    name:     'National Queer & Trans Therapists of Color Network',
    desc:     'Mental health fund for QTPOC communities',
    url:      'https://www.nqttcn.com/mental-health-fund',
    emoji:    '🌈',
    color:    '#9B59FF',
    tags:     ['mutualaid', 'lgbtq', 'queer', 'pride'],
  },
  queercare: {
    name:     'Rainbow Railroad',
    desc:     'Helps LGBTQ+ people escape state violence globally',
    url:      'https://www.rainbowrailroad.org/donate',
    emoji:    '🛤️',
    color:    '#FF9A56',
    tags:     ['queercare', 'refugee', 'rainbow'],
  },
  bipoc: {
    name:     'The Okra Project',
    desc:     'Delivers meals & wellness resources to Black trans people',
    url:      'https://www.theokraproject.com',
    emoji:    '🌿',
    color:    '#28c840',
    tags:     ['bipoc', 'blacktrans', 'lesbian', 'wlw'],
  },
  default: {
    name:     'Rainbow Land Community Fund',
    desc:     'Direct support for creators in our community',
    url:      'https://rainbowland.cc/community-fund',
    emoji:    '🌈',
    color:    '#9B59FF',
    tags:     [],
  },
}

// Tags that trigger the mutual aid button
export const MUTUAL_AID_TAGS = [
  'transmutualaid', 'mutualaid', 'queercare', 'bipoc',
  'blacktrans', 'trans', 'refugee', 'pride', 'lgbtq',
  'queer', 'lesbian', 'wlw', 'rainbow', 'nonbinary',
]

const AMOUNTS = [
  { label: '$1',   value: 1,   emoji: '☕' },
  { label: '$3',   value: 3,   emoji: '🌱' },
  { label: '$5',   value: 5,   emoji: '💜' },
  { label: '$10',  value: 10,  emoji: '🌈' },
]

/** Pick the best matching org for a video's hashtags */
export function pickOrg(hashtags = []) {
  const tags = hashtags.map(t => t.toLowerCase().replace('#', ''))
  for (const [key, org] of Object.entries(MUTUAL_AID_ORGS)) {
    if (key === 'default') continue
    if (org.tags.some(t => tags.includes(t))) return org
  }
  return MUTUAL_AID_ORGS.default
}

/** Floating heart button shown on the video */
export function MutualAidTrigger({ onOpen, color = '#9B59FF' }) {
  const [popped, setPopped] = useState(false)

  const handleClick = (e) => {
    e.stopPropagation()
    setPopped(true)
    setTimeout(() => setPopped(false), 400)
    onOpen()
  }

  return (
    <button
      onClick={handleClick}
      title="Support this creator's community 💜"
      className={clsx(
        'flex flex-col items-center gap-1 transition-transform',
        popped && 'scale-125'
      )}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg"
        style={{ background: `${color}22`, border: `1.5px solid ${color}66` }}
      >
        <Heart className="w-5 h-5" style={{ color }} />
      </div>
      <span className="text-[10px] font-bold" style={{ color }}>Aid</span>
    </button>
  )
}

/** Full bottom-sheet modal */
export default function MutualAidSheet({ org, onClose }) {
  const [selected, setSelected]     = useState(null)
  const [confirmed, setConfirmed]   = useState(false)
  const [hoveredAmt, setHoveredAmt] = useState(null)

  const openDonate = useCallback((amount) => {
    const url = org.url + (amount ? `?amount=${amount}` : '')
    if (window.electronAPI?.invoke) {
      window.electronAPI.invoke('shell:openExternal', url)
    } else {
      window.open(url, '_blank', 'noopener')
    }
    setConfirmed(true)
    setTimeout(() => {
      setConfirmed(false)
      onClose()
    }, 1800)
  }, [org, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Sheet */}
      <div
        className="relative w-full rounded-t-3xl overflow-hidden animate-slide-up"
        style={{ background: '#0d0d18', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Color accent bar */}
        <div className="h-1 w-full" style={{ background: org.color }} />

        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="px-5 pb-8 pt-2">

          {/* Dismiss */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full"
            style={{ background: 'rgba(255,255,255,0.07)' }}
          >
            <X className="w-4 h-4 text-white/50" />
          </button>

          {confirmed ? (
            /* ── Confirmed state ── */
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="text-5xl mb-4">🌈</div>
              <p className="text-white font-black text-xl mb-2">Thank you! 💜</p>
              <p className="text-white/50 text-sm">Your donation makes a real difference.</p>
            </div>
          ) : (
            <>
              {/* Org info */}
              <div className="flex items-start gap-4 mb-5 mt-2">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
                  style={{ background: `${org.color}22`, border: `1.5px solid ${org.color}44` }}
                >
                  {org.emoji}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-white font-black text-base">{org.name}</span>
                    <Sparkles className="w-3.5 h-3.5" style={{ color: org.color }} />
                  </div>
                  <p className="text-white/50 text-xs leading-relaxed">{org.desc}</p>
                  <a
                    href={org.url}
                    onClick={e => { e.preventDefault(); e.stopPropagation(); openDonate(null) }}
                    className="text-xs font-semibold flex items-center gap-1 mt-1"
                    style={{ color: org.color }}
                  >
                    Visit org <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* Amount picker */}
              <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-3">Choose an amount</p>
              <div className="grid grid-cols-4 gap-2.5 mb-5">
                {AMOUNTS.map(a => (
                  <button
                    key={a.value}
                    onClick={() => setSelected(a.value)}
                    onMouseEnter={() => setHoveredAmt(a.value)}
                    onMouseLeave={() => setHoveredAmt(null)}
                    className={clsx(
                      'flex flex-col items-center gap-1.5 py-3.5 rounded-2xl border transition-all',
                      selected === a.value
                        ? 'border-2 scale-105'
                        : 'border-white/8'
                    )}
                    style={{
                      background:  selected === a.value ? `${org.color}20` : 'rgba(255,255,255,0.04)',
                      borderColor: selected === a.value ? org.color : hoveredAmt === a.value ? `${org.color}44` : 'rgba(255,255,255,0.08)',
                    }}
                  >
                    <span className="text-xl">{a.emoji}</span>
                    <span className="text-white font-black text-sm">{a.label}</span>
                  </button>
                ))}
              </div>

              {/* Donate CTA */}
              <button
                onClick={() => openDonate(selected)}
                disabled={!selected}
                className={clsx(
                  'w-full py-4 rounded-2xl font-black text-white text-base transition-all flex items-center justify-center gap-2',
                  selected ? 'active:scale-95' : 'opacity-40 cursor-not-allowed'
                )}
                style={{
                  background: selected
                    ? `linear-gradient(135deg, ${org.color}, #9B59FF)`
                    : 'rgba(255,255,255,0.08)',
                  boxShadow: selected ? `0 8px 32px ${org.color}40` : 'none',
                }}
              >
                <Heart className="w-5 h-5 fill-white" />
                {selected ? `Donate $${selected} →` : 'Select an amount'}
              </button>

              <p className="text-white/25 text-[11px] text-center mt-3">
                Opens secure donation page in your browser · Rainbow Land takes 0% fee
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
