const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Settings ──────────────────────────────────────────────────
  getSettings:  ()         => ipcRenderer.invoke('settings:get'),
  saveSettings: (s)        => ipcRenderer.invoke('settings:set', s),

  // ── Secrets (RTMP keys) ───────────────────────────────────────
  getSecrets:   ()         => ipcRenderer.invoke('secrets:get'),
  saveSecrets:  (s)        => ipcRenderer.invoke('secrets:set', s),

  // ── RTMP / Streaming ──────────────────────────────────────────
  detectGPU:    ()         => ipcRenderer.invoke('rtmp:detect-gpu'),
  redetectGPU:  ()         => ipcRenderer.invoke('rtmp:redetect-gpu'),
  startStream:  (opts)     => ipcRenderer.invoke('rtmp:start',       opts),
  stopStream:   ()         => ipcRenderer.invoke('rtmp:stop'),
  stopOne:      (destId)   => ipcRenderer.invoke('rtmp:stop-one',    destId),
  sendChunkAll: (buf)      => ipcRenderer.invoke('rtmp:chunk-all',   { buffer: buf }),
  sendChunk:    (id, buf)  => ipcRenderer.invoke('rtmp:chunk',       { destId: id, buffer: buf }),
  streamStatus: ()         => ipcRenderer.invoke('rtmp:status'),
  checkFfmpeg:  ()         => ipcRenderer.invoke('rtmp:check-ffmpeg'),
  getRlHlsUrl:  ()         => ipcRenderer.invoke('rtmp:rl-hls-url'),
  onRtmpEvent:  (cb)       => ipcRenderer.on('rtmp:event', cb),
  offRtmpEvent: (cb)       => ipcRenderer.removeListener('rtmp:event', cb),

  // ── System info ───────────────────────────────────────────────
  systemInfo:   ()         => ipcRenderer.invoke('system:info'),

  // ── Window controls ───────────────────────────────────────────
  minimize:     ()         => ipcRenderer.invoke('window:minimize'),
  maximize:     ()         => ipcRenderer.invoke('window:maximize'),
  close:        ()         => ipcRenderer.invoke('window:close'),
  isMaximized:  ()         => ipcRenderer.invoke('window:isMaximized'),

  // ── External links ────────────────────────────────────────────
  openExternal: (url)      => ipcRenderer.invoke('shell:openExternal', url),

  // ── TikTok OAuth ─────────────────────────────────────────────
  tiktokStatus:     ()     => ipcRenderer.invoke('tiktok:status'),
  tiktokConnect:    ()     => ipcRenderer.invoke('tiktok:connect'),
  tiktokDisconnect: ()     => ipcRenderer.invoke('tiktok:disconnect'),

  // ── Auto-updater ─────────────────────────────────────────────
  checkForUpdates:  ()     => ipcRenderer.invoke('updater:check'),
  downloadUpdate:   ()     => ipcRenderer.invoke('updater:download'),
  installUpdate:    ()     => ipcRenderer.invoke('updater:install'),
  onUpdaterStatus:  (cb)   => ipcRenderer.on('updater:status', (_, data) => cb(data)),
  offUpdaterStatus: (cb)   => ipcRenderer.removeListener('updater:status', cb),

  // ── Generic event bus ─────────────────────────────────────────
  on:  (ch, fn) => ipcRenderer.on(ch, (_, ...args) => fn(...args)),
  off: (ch, fn) => ipcRenderer.removeListener(ch, fn),
})
