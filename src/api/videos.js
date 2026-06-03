/**
 * Rainbow Land — Video API client
 * Talks to live-server /api/videos endpoints
 */
import { LIVE_SERVER_HTTP } from './liveServer'
import { getAccessToken } from './auth'

const API = LIVE_SERVER_HTTP

function authHeaders() {
  const tok = getAccessToken()
  return tok ? { Authorization: `Bearer ${tok}` } : {}
}

/** Fetch paginated video feed */
export async function fetchVideos({ limit = 20, offset = 0, tag = null, q = null } = {}) {
  const params = new URLSearchParams({ limit, offset })
  if (tag) params.set('tag', tag)
  if (q)   params.set('q', q)
  const res = await fetch(`${API}/api/videos?${params}`, { headers: authHeaders() })
  if (!res.ok) return { videos: [] }
  return res.json()
}

/** Upload a short video (host only) */
export async function uploadVideo({ file, caption, hashtags = [] }) {
  const form = new FormData()
  form.append('video', file)
  form.append('caption', caption)
  form.append('hashtags', JSON.stringify(hashtags))
  const res = await fetch(`${API}/api/videos/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  return res.json()
}

/** Toggle like on a video */
export async function likeVideo(videoId) {
  const res = await fetch(`${API}/api/videos/${videoId}/like`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
  })
  return res.json()
}

/** Get comments for a video */
export async function fetchComments(videoId) {
  const res = await fetch(`${API}/api/videos/${videoId}/comments`, { headers: authHeaders() })
  return res.json()
}

/** Post a comment */
export async function postComment(videoId, text) {
  const res = await fetch(`${API}/api/videos/${videoId}/comments`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  return res.json()
}
