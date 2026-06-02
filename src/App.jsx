import React, { useState, useEffect } from 'react'
import { useStore } from './hooks/useStore'
import BottomNav       from './components/BottomNav'
import WindowTitleBar  from './components/WindowTitleBar'
import UpdatePrompt    from './components/UpdatePrompt'
import FeedPage     from './pages/FeedPage'
import DiscoverPage from './pages/DiscoverPage'
import LivePage     from './pages/LivePage'
import LoudmanPage  from './pages/LoudmanPage'
import CutroomPage  from './pages/CutroomPage'
import ProfilePage  from './pages/ProfilePage'
import StudioPage   from './pages/StudioPage'
import AuthPage     from './pages/AuthPage'
import { isLoggedIn, getStoredUser, refreshSession } from './api/auth'

const IS_ELECTRON = typeof window !== 'undefined' && !!window.electronAPI

export default function App() {
  const { activeTab, setUser } = useStore()
  const [authed, setAuthed] = useState(false)
  const [authChecking, setAuthChecking] = useState(true)

  useEffect(() => {
    async function checkSession() {
      if (isLoggedIn()) {
        const u = getStoredUser()
        if (u) {
          setUser({
            name:      u.display_name,
            handle:    u.handle,
            avatar:    u.avatar_emoji || '🌈',
            pronouns:  u.pronouns,
            prideFlag: u.pride_flag,
            bio:       u.bio,
            role:      u.role,
            id:        u.id,
            email:     u.email,
          })
        }
        setAuthed(true)
      } else {
        try {
          const refreshed = await refreshSession()
          if (refreshed) {
            const u = refreshed.user
            setUser({
              name:      u.display_name,
              handle:    u.handle,
              avatar:    u.avatar_emoji || '🌈',
              pronouns:  u.pronouns,
              prideFlag: u.pride_flag,
              bio:       u.bio,
              role:      u.role,
              id:        u.id,
              email:     u.email,
            })
            setAuthed(true)
          }
        } catch {}
      }
      setAuthChecking(false)
    }
    checkSession()
  }, [])

  function handleAuth(user) {
    setAuthed(true)
  }

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#0d0d18] flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-3 animate-pulse">🌈</div>
          <p className="text-purple-400 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  if (!authed) {
    return <AuthPage onAuth={handleAuth} />
  }

  if (activeTab === 'studio') return (
    <>
      <WindowTitleBar />
      <StudioPage />
    </>
  )

  return (
    <div className="h-full flex flex-col max-w-md mx-auto relative bg-dark-900">
      <WindowTitleBar />
      <main className="flex-1 overflow-hidden">
        {activeTab === 'feed'     && <FeedPage />}
        {activeTab === 'discover' && <DiscoverPage />}
        {activeTab === 'live'     && <LivePage />}
        {activeTab === 'loudman'  && <LoudmanPage />}
        {activeTab === 'cutroom'  && <CutroomPage />}
        {activeTab === 'profile'  && <ProfilePage />}
      </main>
      <BottomNav />
      <UpdatePrompt />
    </div>
  )
}

