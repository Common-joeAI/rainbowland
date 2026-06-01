import React from 'react'
import { Home, Search, Radio, Music, User } from 'lucide-react'
import { useStore } from '../hooks/useStore'
import clsx from 'clsx'

const TABS = [
  { id: 'feed',     label: 'Home',    Icon: Home },
  { id: 'discover', label: 'Explore', Icon: Search },
  { id: 'live',     label: 'Live',    Icon: Radio },
  { id: 'loudman',  label: 'Music',   Icon: Music },
  { id: 'profile',  label: 'Me',      Icon: User },
]

export default function BottomNav() {
  const { activeTab, setTab } = useStore()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-white/10">
      <div className="pride-strip" />
      <div className="flex items-center justify-around py-2 pb-safe">
        {TABS.map(({ id, label, Icon }) => {
          const active = activeTab === id
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={clsx(
                'flex flex-col items-center gap-0.5 px-4 py-1 transition-all duration-200',
                active ? 'scale-110' : 'opacity-50'
              )}
            >
              {/* Upload button special styling */}
              {id === 'live' ? (
                <div className="relative">
                  <div className={clsx(
                    'w-9 h-9 rounded-xl flex items-center justify-center',
                    active
                      ? 'bg-gradient-to-r from-rainbow-pink to-rainbow-purple'
                      : 'bg-dark-500'
                  )}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  {/* Live indicator dot */}
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                </div>
              ) : (
                <Icon className={clsx('w-6 h-6',
                  active ? 'text-rainbow-pink' : 'text-white')} />
              )}
              <span className={clsx('text-[10px] font-medium',
                active ? 'rainbow-text font-bold' : 'text-white/60')}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
