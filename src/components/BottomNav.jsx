import React from 'react'
import clsx from 'clsx'
import { Home, Search, Radio, Music2, User, Tv2 } from 'lucide-react'
import { useStore } from '../hooks/useStore'

const TABS = [
  { id: 'feed',     icon: Home,   label: 'Home'    },
  { id: 'discover', icon: Search, label: 'Explore' },
  { id: 'studio',   icon: Tv2,    label: 'Studio',  rainbow: true },
  { id: 'loudman',  icon: Music2, label: 'Music'   },
  { id: 'profile',  icon: User,   label: 'Profile' },
]

export default function BottomNav() {
  const { activeTab, setActiveTab } = useStore()

  return (
    <nav className="flex-shrink-0 border-t border-white/5 bg-dark-900/95 backdrop-blur-xl">
      {/* Pride strip */}
      <div className="pride-strip" />

      <div className="flex">
        {TABS.map(tab => {
          const Icon    = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex-1 flex flex-col items-center gap-1 py-3 transition-all',
                isActive ? 'text-white' : 'text-white/30 hover:text-white/60'
              )}
            >
              {tab.rainbow ? (
                /* Studio button — gradient ring */
                <div className={clsx(
                  'p-1.5 rounded-xl transition-all',
                  isActive
                    ? 'bg-gradient-to-br from-rainbow-pink via-rainbow-purple to-rainbow-blue shadow-lg shadow-rainbow-purple/30'
                    : 'bg-dark-700'
                )}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              ) : (
                <Icon className={clsx('w-5 h-5 transition-transform', isActive && 'scale-110')} />
              )}
              <span className={clsx(
                'text-[10px] font-semibold tracking-wide',
                tab.rainbow && isActive ? 'rainbow-text' : ''
              )}>
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
