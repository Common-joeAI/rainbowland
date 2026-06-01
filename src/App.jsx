import React from 'react'
import { useStore } from './hooks/useStore'
import BottomNav from './components/BottomNav'
import FeedPage from './pages/FeedPage'
import DiscoverPage from './pages/DiscoverPage'
import LivePage from './pages/LivePage'
import LoudmanPage from './pages/LoudmanPage'
import ProfilePage from './pages/ProfilePage'

export default function App() {
  const { activeTab } = useStore()

  const pages = {
    feed:     <FeedPage />,
    discover: <DiscoverPage />,
    live:     <LivePage />,
    loudman:  <LoudmanPage />,
    profile:  <ProfilePage />,
  }

  return (
    <div className="h-full flex flex-col max-w-md mx-auto relative bg-dark-900">
      {/* Page content */}
      <main className="flex-1 overflow-hidden">
        {pages[activeTab]}
      </main>

      {/* Bottom navigation */}
      <BottomNav />
    </div>
  )
}
