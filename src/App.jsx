import React from 'react'
import { useStore } from './hooks/useStore'
import BottomNav       from './components/BottomNav'
import WindowTitleBar  from './components/WindowTitleBar'
import FeedPage    from './pages/FeedPage'
import DiscoverPage from './pages/DiscoverPage'
import LivePage    from './pages/LivePage'
import LoudmanPage from './pages/LoudmanPage'
import ProfilePage from './pages/ProfilePage'
import StudioPage  from './pages/StudioPage'

const IS_ELECTRON = typeof window !== 'undefined' && !!window.electronAPI

export default function App() {
  const { activeTab } = useStore()

  // Studio is full-screen, no nav bar — but still show titlebar
  if (activeTab === 'studio') return (
    <>
      <WindowTitleBar />
      <StudioPage />
    </>
  )

  return (
    <div className="h-full flex flex-col max-w-md mx-auto relative bg-dark-900">
      {/* Traffic light buttons — visible on every page on Windows/Linux */}
      <WindowTitleBar />

      <main className="flex-1 overflow-hidden">
        {activeTab === 'feed'     && <FeedPage />}
        {activeTab === 'discover' && <DiscoverPage />}
        {activeTab === 'live'     && <LivePage />}
        {activeTab === 'loudman'  && <LoudmanPage />}
        {activeTab === 'profile'  && <ProfilePage />}
      </main>
      <BottomNav />
    </div>
  )
}
