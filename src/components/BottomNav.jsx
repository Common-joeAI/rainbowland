import React, { useState } from 'react'
import clsx from 'clsx'
import { Home, Search, Tv2, Music2, User, Heart } from 'lucide-react'
import { useStore } from '../hooks/useStore'
import { useTheme } from '../hooks/useTheme'
import DonationPrompt from './DonationPrompt'

const TABS = [
  { id: 'feed',     icon: Home,   label: 'Home'    },
  { id: 'discover', icon: Search, label: 'Explore' },
  { id: 'studio',   icon: Tv2,    label: 'Studio', rainbow: true },
  { id: 'loudman',  icon: Music2, label: 'Music'   },
  { id: 'profile',  icon: User,   label: 'Profile' },
]

export default function BottomNav() {
  const { activeTab, setActiveTab } = useStore()
  const { colors, gradients }       = useTheme()
  const [showDonation, setShowDonation] = useState(false)

  return (
    <>
      <nav className="flex-shrink-0 border-t"
        style={{ borderColor: 'rgba(255,255,255,0.05)', background: `${colors.bg900}f5`, backdropFilter: 'blur(20px)' }}>

        {/* Pride strip */}
        <div className="h-[3px]" style={{ background: gradients.overlay, backgroundSize: '200%', animation: 'gradient-x 6s linear infinite' }} />

        <div className="flex items-center">
          {TABS.map(tab => {
            const Icon     = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 flex flex-col items-center gap-1 py-3 transition-all"
                style={{ color: isActive ? colors.textPrimary : colors.textMuted }}>
                {tab.rainbow ? (
                  <div className="p-1.5 rounded-xl transition-all"
                    style={isActive
                      ? { background: gradients.brand, boxShadow: `0 4px 16px ${colors.primary}44` }
                      : { background: colors.bg600 }}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                ) : (
                  <Icon className="w-5 h-5 transition-transform"
                    style={{ transform: isActive ? 'scale(1.15)' : 'scale(1)', color: isActive ? colors.primary : colors.textMuted }} />
                )}
                <span className="text-[10px] font-semibold tracking-wide"
                  style={{ color: isActive && tab.rainbow ? colors.primary : isActive ? colors.primary : colors.textMuted }}>
                  {tab.label}
                </span>
              </button>
            )
          })}

          {/* Support button — always visible, never annoying */}
          <button
            onClick={() => setShowDonation(true)}
            className="flex flex-col items-center gap-1 py-3 px-3 transition-all"
            title="Support the dev ❤️">
            <Heart className="w-4 h-4" style={{ color: colors.secondary }} />
            <span className="text-[9px] font-semibold" style={{ color: colors.secondary }}>
              Support
            </span>
          </button>
        </div>
      </nav>

      {showDonation && (
        <DonationPrompt
          trigger="manual"
          onClose={() => setShowDonation(false)}
        />
      )}
    </>
  )
}
