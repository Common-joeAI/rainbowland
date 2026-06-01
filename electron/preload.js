const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Platform ──────────────────────────────────────────────
  isElectron: true,
  platform:   process.platform,

  // ── Settings ──────────────────────────────────────────────
  getSettings:  ()         => ipcRenderer.invoke('settings:get'),
  saveSettings: (s)        => ipcRenderer.invoke('settings:set', s),

  // ── RTMP secrets (OS keychain encrypted) ──────────────────
  getSecrets:   ()         => ipcRenderer.invoke('secrets:get'),
  saveSecrets:  (s)        => ipcRenderer.invoke('secrets:set', s),

  // ── GPU / encoder ─────────────────────────────────────────
  detectGPU:    ()         => ipcRenderer.invoke('rtmp:detect-gpu'),
  redetectGPU:  ()         => ipcRenderer.invoke('rtmp:redetect-gpu'),

  // ── Streaming ─────────────────────────────────────────────
  startStream:  (opts)     => ipcRenderer.invoke('rtmp:start',       opts),
  stopStream:   ()         => ipcRenderer.invoke('rtmp:stop'),
  stopOne:      (destId)   => ipcRenderer.invoke('rtmp:stop-one',    destId),
  sendChunkAll: (buf)      => ipcRenderer.invoke('rtmp:chunk-all',   { buffer: buf }),
  sendChunk:    (id, buf)  => ipcRenderer.invoke('rtmp:chunk',       { destId: id, buffer: buf }),
  streamStatus: ()         => ipcRenderer.invoke('rtmp:status'),
  checkFfmpeg:  ()         => ipcRenderer.invoke('rtmp:check-ffmpeg'),
  getRlHlsUrl:  ()         => ipcRenderer.invoke('rtmp:rl-hls-url'),

  // RTMP event listener (for rl-stream-ready etc.)
  onRtmpEvent:  (cb) => ipcRenderer.on('rtmp:event', cb),
  offRtmpEvent: (cb) => ipcRenderer.removeListener('rtmp:event', cb),

  // ── System ────────────────────────────────────────────────
  systemInfo:   ()         => ipcRenderer.invoke('system:info'),

  // ── Window controls ───────────────────────────────────────
  minimize:     ()         => ipcRenderer.invoke('window:minimize'),
  maximize:     ()         => ipcRenderer.invoke('window:maximize'),
  close:        ()         => ipcRenderer.invoke('window:close'),
  isMaximized:  ()         => ipcRenderer.invoke('window:isMaximized'),

  // ── Shell ─────────────────────────────────────────────────
  openExternal: (url)      => ipcRenderer.invoke('shell:openExternal', url),

  // ── TikTok OAuth ──────────────────────────────────────────
  tiktokStatus:     ()     => ipcRenderer.invoke('tiktok:status'),
  tiktokConnect:    ()     => ipcRenderer.invoke('tiktok:connect'),
  tiktokDisconnect: ()     => ipcRenderer.invoke('tiktok:disconnect'),

  // ── Events: main → renderer ───────────────────────────────
  on:  (ch, fn) => ipcRenderer.on(ch, (_, ...args) => fn(...args)),
  off: (ch, fn) => ipcRenderer.removeListener(ch, fn),
})
