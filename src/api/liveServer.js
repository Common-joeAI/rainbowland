/**
 * Rainbow Land Live Server client
 * Connects to the VPS signaling server at live.darkkeangelzz.live
 *
 * Ports:
 *   3004  → Socket.IO signaling + REST API  (proxied via nginx → https)
 *   1935  → RTMP ingest (OBS / mobile RTMP apps)
 *   8085  → HLS output  (proxied via nginx /hls/)
 */

// Will be live.darkkeangelzz.live once DNS A record is added
export const LIVE_SERVER_URL = 'https://live.darkkeangelzz.live'
export const LIVE_SERVER_HTTP = 'https://live.darkkeangelzz.live'  // CF tunnel

export const RTMP_INGEST = 'rtmp://67.38.45.238:1935/live'
export const HLS_BASE    = 'https://live.darkkeangelzz.live/hls/live'

/** Get the HLS URL for a stream key */
export function hlsUrl(streamKey) {
  return `${HLS_BASE}/${streamKey}/index.m3u8`
}

/** Get the RTMP URL for a stream key (for OBS/mobile) */
export function rtmpUrl(streamKey) {
  return `${RTMP_INGEST}/${streamKey}`
}

/** REST: fetch all active rooms */
export async function fetchRooms() {
  const res = await fetch(`${LIVE_SERVER_HTTP}/api/rooms`)
  return res.json()
}

/** REST: fetch a single room */
export async function fetchRoom(id) {
  const res = await fetch(`${LIVE_SERVER_HTTP}/api/rooms/${id}`)
  return res.json()
}

/** Health check */
export async function healthCheck() {
  try {
    const res = await fetch(`${LIVE_SERVER_HTTP}/health`, { signal: AbortSignal.timeout(4000) })
    return res.json()
  } catch {
    return { ok: false }
  }
}
