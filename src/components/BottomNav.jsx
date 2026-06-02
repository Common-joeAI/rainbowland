import React, { useState } from 'react'
import clsx from 'clsx'
import { Home, Search, Tv2, Music2, User, Scissors } from 'lucide-react'
import { useStore } from '../hooks/useStore'
import { useTheme } from '../hooks/useTheme'
import DonationPrompt from './DonationPrompt'

const TABS = [
  { id: 'feed',     icon: Home,     label: 'Home'    },
  { id: 'discover', icon: Search,   label: 'Explore' },
  { id: 'studio',   icon: Tv2,      label: 'Studio', rainbow: true },
  { id: 'loudman',  icon: Music2,   label: 'Music'   },
  { id: 'cutroom',  icon: Scissors, label: 'Cutroom' },
  { id: 'profile',  icon: User,     label: 'Profile' },
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
                className="flex-1 flex flex-col items-center gap-1 py-2 transition-all"
                style={{ minWidth: 0 }}
              >
                <div className={clsx(
                  'w-8 h-8 flex items-center justify-center rounded-xl transition-all',
                  isActive && 'bg-white/10'
                )}>
                  <Icon
                    className="w-5 h-5 transition-all"
                    style={{
                      color: isActive
                        ? (tab.rainbow ? colors.primary : colors.accent)
                        : 'rgba(255,255,255,0.35)',
                      filter: isActive && tab.rainbow ? `drop-shadow(0 0 6px ${colors.primary})` : undefined,
                    }}
                  />
                </div>
                <span
                  className="text-[9px] font-medium transition-colors truncate w-full text-center px-0.5"
                  style={{ color: isActive ? colors.accent : 'rgba(255,255,255,0.3)' }}
                >
                  {tab.label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>

      {showDonation && <DonationPrompt onClose={() => setShowDonation(false)} />}
    </>
  )
}
