import { create } from 'zustand'

export const useStore = create((set, get) => ({
  // ── Auth ──────────────────────────────────────────────────────────────
  user: {
    id: 'me',
    name: 'You',
    handle: '@yourhandle',
    pronouns: 'your/pronouns',
    avatar: '🏳️‍🌈',
    bio: 'Rainbow Land creator',
    followers: 0,
    following: 0,
    verified: false,
    likedVideos: [],
  },
  setUser: (u) => set({ user: { ...get().user, ...u } }),

  // ── Feed ──────────────────────────────────────────────────────────────
  currentVideoIndex: 0,
  setVideoIndex: (i) => set({ currentVideoIndex: i }),

  // ── Likes ─────────────────────────────────────────────────────────────
  likedVideos: new Set(),
  toggleLike: (videoId) => set((s) => {
    const n = new Set(s.likedVideos)
    n.has(videoId) ? n.delete(videoId) : n.add(videoId)
    return { likedVideos: n }
  }),
  isLiked: (videoId) => get().likedVideos.has(videoId),

  // ── Comments ──────────────────────────────────────────────────────────
  comments: {},
  addComment: (videoId, text) => set((s) => ({
    comments: {
      ...s.comments,
      [videoId]: [...(s.comments[videoId] || []), {
        id: Date.now(),
        text,
        author: get().user.name,
        handle: get().user.handle,
        avatar: get().user.avatar,
        ts: new Date().toISOString(),
        likes: 0,
      }]
    }
  })),

  // ── UI state ──────────────────────────────────────────────────────────
  activeTab: 'feed',         // feed | discover | live | loudman | profile
  setTab: (t) => set({ activeTab: t }),
  showComments: false,
  setShowComments: (v) => set({ showComments: v }),
  showLoudman: false,
  setShowLoudman: (v) => set({ showLoudman: v }),
  isMuted: false,
  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
}))
