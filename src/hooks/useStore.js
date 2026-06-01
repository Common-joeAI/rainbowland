import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useStore = create(
  persist(
    (set, get) => ({
      // ── Active tab ───────────────────────────────────────────
      activeTab: 'feed',
      setActiveTab: (tab) => set({ activeTab: tab }),

      // ── User profile ─────────────────────────────────────────
      user: {
        name:     'Creator',
        handle:   '@creator',
        avatar:   '🌈',
        pronouns: 'they/them',
        prideFlag: 'rainbow',
        bio:      '',
      },
      setUser: (user) => set((s) => ({ user: { ...s.user, ...user } })),

      // ── Stream destinations ───────────────────────────────────
      destinations: {
        rainbowland: { enabled: true,  label: 'Rainbow Land',  color: '#9B59FF', icon: '🌈', rtmpBase: 'rtmp://67.38.45.238:1935/live' },
        tiktok:      { enabled: false, label: 'TikTok Live',   color: '#000000', icon: '🎵', rtmpBase: 'rtmp://push.tiktok.com/live' },
        youtube:     { enabled: false, label: 'YouTube Live',  color: '#FF0000', icon: '▶️', rtmpBase: 'rtmp://a.rtmp.youtube.com/live2' },
        facebook:    { enabled: false, label: 'Facebook Live', color: '#1877F2', icon: '📘', rtmpBase: 'rtmps://live-api-s.facebook.com:443/rtmp' },
        twitch:      { enabled: false, label: 'Twitch',        color: '#9146FF', icon: '🎮', rtmpBase: 'rtmp://live.twitch.tv/live' },
        custom:      { enabled: false, label: 'Custom RTMP',   color: '#FF7A00', icon: '📡', rtmpBase: '', customUrl: '' },
      },
      setDestination: (id, config) =>
        set((s) => ({
          destinations: { ...s.destinations, [id]: { ...s.destinations[id], ...config } }
        })),
      toggleDestination: (id) =>
        set((s) => ({
          destinations: {
            ...s.destinations,
            [id]: { ...s.destinations[id], enabled: !s.destinations[id].enabled }
          }
        })),

      // ── Stream keys (stored in Electron safeStorage, fallback here) ──
      secrets: {
        rainbowland: '',
        tiktok:      '',
        youtube:     '',
        facebook:    '',
        twitch:      '',
        custom:      '',
      },
      setSecret: (id, key) =>
        set((s) => ({ secrets: { ...s.secrets, [id]: key } })),

      // ── Stream settings ───────────────────────────────────────
      streamTitle:  '',
      setStreamTitle: (t) => set({ streamTitle: t }),
      quality: 'medium',
      setQuality: (q) => set({ quality: q }),

      // ── Global viewer count (aggregated) ─────────────────────
      totalViewers: 0,
      setTotalViewers: (n) => set({ totalViewers: n }),
    }),
    {
      name: 'rainbowland-store',
      partialize: (s) => ({
        user:         s.user,
        destinations: s.destinations,
        quality:      s.quality,
        streamTitle:  s.streamTitle,
        // Don't persist secrets here — handled by Electron safeStorage
      }),
    }
  )
)
