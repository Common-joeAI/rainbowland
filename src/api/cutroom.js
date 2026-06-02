/**
 * Cutroom.fm integration
 * Cutroom is a live music review platform — artists submit tracks,
 * curators host review rooms, listeners react in real time.
 * API is proxied via darkkeangelzz.live to avoid CORS.
 */

export const CUTROOM_BASE  = 'https://cutroom.fm'
export const CUTROOM_PROXY = 'https://darkkeangelzz.live/api/cutroom-proxy.php'

export const cutroomUserUrl    = (username)  => `${CUTROOM_BASE}/${username}`
export const cutroomSessionUrl = (sessionId) => `${CUTROOM_BASE}/session/${sessionId}`

export const CUTROOM_SUBMIT_URL  = `${CUTROOM_BASE}/submit`
export const CUTROOM_CURATOR_URL = `${CUTROOM_BASE}/for-curators`
export const CUTROOM_ARTIST_URL  = `${CUTROOM_BASE}/for-artists`

export async function fetchCutroomUser(username) {
  try {
    const res = await fetch(`${CUTROOM_PROXY}?username=${encodeURIComponent(username)}&endpoint=user`)
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

export async function fetchCutroomSession(sessionId) {
  try {
    const res = await fetch(`${CUTROOM_PROXY}?endpoint=session&sessionId=${encodeURIComponent(sessionId)}`)
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

export const FEATURED_CUTROOM_ARTISTS = [
  {
    username: 'Darkke_Angelzz',
    name: 'Darkke Angelzz',
    role: 'Artist',
    genre: 'Alt / Electronic',
    bio: 'Rainbow Land creator — submitting tracks and hosting review rooms on Cutroom.',
  },
  {
    username: 'wxno',
    name: 'WXNO',
    role: 'Curator',
    genre: 'Indie / Alt',
    bio: 'Independent curator hosting live review sessions on Cutroom.',
  },
]
