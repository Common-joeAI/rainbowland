/**
 * Rainbow Land — Live Streaming API
 *
 * Architecture:
 *  Host:   getUserMedia → MediaRecorder → WebSocket binary chunks → VPS relay
 *  Viewer: HLS.js playback from VPS HLS output
 *
 * VPS: live.rainbowland.cc (107.199.175.81)
 *   WSS  wss://live.rainbowland.cc/ws
 *   HLS  https://live.rainbowland.cc/hls/<roomId>/index.m3u8
 */

const WS_URL   = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_LIVE_WS_URL)
  || 'wss://live.rainbowland.cc/ws'
const HLS_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_HLS_BASE_URL)
  || 'https://live.rainbowland.cc/hls'

export function getHLSUrl(roomId) {
  return `${HLS_BASE}/${roomId}/index.m3u8`
}

// ─────────────────────────────────────────────────────────────
// Host broadcaster
// ─────────────────────────────────────────────────────────────
export class HostStreamer {
  constructor({ roomId, title, onStatusChange, onViewerCount, onChatMessage, onError }) {
    this.roomId         = roomId
    this.title          = title
    this.onStatusChange = onStatusChange || (() => {})
    this.onViewerCount  = onViewerCount  || (() => {})
    this.onChatMessage  = onChatMessage  || (() => {})
    this.onError        = onError        || (() => {})
    this.ws             = null
    this.recorder       = null
    this.mediaStream    = null
    this.connected      = false
  }

  async start(mediaStream) {
    this.mediaStream = mediaStream
    this.onStatusChange('connecting')
    try {
      await this._connectWS()
      this._startRecorder()
      this.onStatusChange('live')
    } catch (err) {
      this.onError(err.message || 'Failed to start stream')
      this.onStatusChange('error')
    }
  }

  _connectWS() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL)
      this.ws = ws
      const timeout = setTimeout(() => reject(new Error('WebSocket timed out')), 8000)

      ws.onopen = () => {
        clearTimeout(timeout)
        ws.send(JSON.stringify({ type: 'host_register', roomId: this.roomId, title: this.title }))
      }

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data)
          if (msg.type === 'registered')   { this.connected = true; resolve() }
          if (msg.type === 'viewer_count') this.onViewerCount(msg.count)
          if (msg.type === 'chat')         this.onChatMessage(msg)
          if (msg.type === 'error')        reject(new Error(msg.message))
        } catch {}
      }
      ws.onerror = () => { clearTimeout(timeout); reject(new Error('WebSocket error')) }
      ws.onclose = () => { this.connected = false; this.onStatusChange('ended') }
    })
  }

  _startRecorder() {
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : ''

    const opts = { videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 }
    if (mimeType) opts.mimeType = mimeType

    const recorder = new MediaRecorder(this.mediaStream, opts)
    this.recorder = recorder

    recorder.ondataavailable = (e) => {
      if (e.data?.size > 0 && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(e.data)
      }
    }
    recorder.onerror = (e) => this.onError('Recorder error: ' + e.error?.message)
    recorder.start(1000)
  }

  sendChat(text, userName) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'chat', roomId: this.roomId, user: userName, text }))
    }
  }

  stop() {
    this.recorder?.stop()
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'end_stream', roomId: this.roomId }))
    }
    this.ws?.close()
  }
}

// ─────────────────────────────────────────────────────────────
// Viewer helpers
// ─────────────────────────────────────────────────────────────
export async function fetchLiveRooms() {
  try {
    const res = await fetch('https://live.rainbowland.cc/api/rooms', { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error()
    return await res.json()
  } catch {
    return []
  }
}

export function joinViewerWS({ roomId, onChatMessage, onViewerCount, onStreamEnd }) {
  const ws = new WebSocket(WS_URL)

  ws.onopen = () => ws.send(JSON.stringify({ type: 'viewer_join', roomId }))

  ws.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data)
      if (msg.type === 'chat')         onChatMessage?.(msg)
      if (msg.type === 'viewer_count') onViewerCount?.(msg.count)
      if (msg.type === 'stream_ended') onStreamEnd?.()
    } catch {}
  }

  ws.onerror = () => {}
  ws.onclose = () => onStreamEnd?.()

  return {
    sendChat: (text, userName) => {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: 'chat', roomId, user: userName, text }))
    },
    close: () => ws.close(),
  }
}
