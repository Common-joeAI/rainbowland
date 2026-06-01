import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useStore = create(
  persist(
    (set, get) => ({
      // ── Active tab ───────────────────────────────────────────
      activeTab: 'feed',
      setActiveTab: (tab) => set({ activeTab: tab }),
      setTab: (tab) => set({ activeTab: tab }),

      // ── User profile ─────────────────────────────────────────
      user: {
        name:      'Creator',
        handle:    '@creator',
        avatar:    '🌈',
        pronouns:  'they/them',
        prideFlag: 'rainbow',
        bio:       '',
      },
      setUser: (user) => set((s) => ({ user: { ...s.user, ...user } })),

      // ── Likes ─────────────────────────────────────────────────
      likedIds: [],
      toggleLike: (id) =>
        set((s) => ({
          likedIds: s.likedIds.includes(id)
            ? s.likedIds.filter((x) => x !== id)
            : [...s.likedIds, id],
        })),
      isLiked: (id) => get().likedIds.includes(id),

      // ── Saves / Bookmarks ─────────────────────────────────────
      savedIds: [],
      toggleSave: (id) =>
        set((s) => ({
          savedIds: s.savedIds.includes(id)
            ? s.savedIds.filter((x) => x !== id)
            : [...s.savedIds, id],
        })),
      isSaved: (id) => get().savedIds.includes(id),

      // ── Follows ───────────────────────────────────────────────
      followedHandles: [],
      toggleFollow: (handle) =>
        set((s) => ({
          followedHandles: s.followedHandles.includes(handle)
            ? s.followedHandles.filter((x) => x !== handle)
            : [...s.followedHandles, handle],
        })),
      isFollowing: (handle) => get().followedHandles.includes(handle),

      // ── Mute ──────────────────────────────────────────────────
      isMuted: true,
      toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),

      // ── Comments ──────────────────────────────────────────────
      // { [videoId]: [{ id, author, handle, avatar, text, likes, ts }] }
      comments: {},
      addComment: (videoId, text) =>
        set((s) => ({
          comments: {
            ...s.comments,
            [videoId]: [
              ...(s.comments[videoId] || []),
              {
                id:     Date.now(),
                author: s.user.name,
                handle: s.user.handle,
                avatar: s.user.avatar,
                text,
                likes:  0,
                ts:     'now',
              },
            ],
          },
        })),
      likedCommentIds: [],
      toggleCommentLike: (commentId) =>
        set((s) => ({
          likedCommentIds: s.likedCommentIds.includes(commentId)
            ? s.likedCommentIds.filter((x) => x !== commentId)
            : [...s.likedCommentIds, commentId],
        })),

      // ── Comments drawer ───────────────────────────────────────
      showComments: false,
      setShowComments: (v) => set({ showComments: v }),

      // ── Active video (for comments context) ──────────────────
      activeVideoId: null,
      setActiveVideoId: (id) => set({ activeVideoId: id }),

      // ── SafeSpace Mode ────────────────────────────────────────
      safeSpaceEnabled: false,
      toggleSafeSpace: () => set((s) => ({ safeSpaceEnabled: !s.safeSpaceEnabled })),

      // ── Stream destinations ───────────────────────────────────
      destinations: {
        rainbowland: { enabled: true,  label: 'Rainbow Land',  color: '#9B59FF', icon: '🌈', rtmpBase: 'rtmp://live.rainbowland.cc/live' },
        tiktok:      { enabled: false, label: 'TikTok Live',   color: '#000000', icon: '🎵', rtmpBase: 'rtmp://push.tiktok.com/live' },
        youtube:     { enabled: false, label: 'YouTube Live',  color: '#FF0000', icon: '▶️', rtmpBase: 'rtmp://a.rtmp.youtube.com/live2' },
        facebook:    { enabled: false, label: 'Facebook Live', color: '#1877F2', icon: '📘', rtmpBase: 'rtmps://live-api-s.facebook.com:443/rtmp' },
        twitch:      { enabled: false, label: 'Twitch',        color: '#9146FF', icon: '🎮', rtmpBase: 'rtmp://live.twitch.tv/live' },
        custom:      { enabled: false, label: 'Custom RTMP',   color: '#FF7A00', icon: '📡', rtmpBase: '', customUrl: '' },
      },
      setDestination: (id, config) =>
        set((s) => ({
          destinations: { ...s.destinations, [id]: { ...s.destinations[id], ...config } },
        })),
      toggleDestination: (id) =>
        set((s) => ({
          destinations: {
            ...s.destinations,
            [id]: { ...s.destinations[id], enabled: !s.destinations[id].enabled },
          },
        })),

      // ── Stream keys ───────────────────────────────────────────
      secrets: { rainbowland: '', tiktok: '', youtube: '', facebook: '', twitch: '', custom: '' },
      setSecret: (id, key) =>
        set((s) => ({ secrets: { ...s.secrets, [id]: key } })),

      // ── Stream settings ───────────────────────────────────────
      streamTitle:    '',
      setStreamTitle: (t) => set({ streamTitle: t }),
      quality:        'medium',
      setQuality:     (q) => set({ quality: q }),

      // ── Feed video index ──────────────────────────────────────
      currentVideoIndex: 0,
      setVideoIndex: (n) => set({ currentVideoIndex: n }),

      // ── Global viewer count ───────────────────────────────────
      totalViewers:    0,
      setTotalViewers: (n) => set({ totalViewers: n }),

      // ── Notifications ─────────────────────────────────────────
      notifications: [],
      addNotification: (notif) =>
        set((s) => ({
          notifications: [{ id: Date.now(), ...notif, read: false }, ...s.notifications].slice(0, 50),
        })),
      markNotificationsRead: () =>
        set((s) => ({
          notifications: s.notifications.map((n) => ({ ...n, read: true })),
        })),
      unreadCount: () => get().notifications.filter((n) => !n.read).length,
    }),
    {
      name: 'rainbowland-store',
      partialize: (s) => ({
        user:             s.user,
        destinations:     s.destinations,
        quality:          s.quality,
        streamTitle:      s.streamTitle,
        likedIds:         s.likedIds,
        savedIds:         s.savedIds,
        followedHandles:  s.followedHandles,
        isMuted:          s.isMuted,
        comments:         s.comments,
        likedCommentIds:  s.likedCommentIds,
        safeSpaceEnabled: s.safeSpaceEnabled,
        notifications:    s.notifications,
      }),
    }
  )
)
