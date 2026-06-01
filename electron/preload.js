const { contextBridge, ipcRenderer } = require('electron')

/**
 * Expose a safe, typed API to the renderer (React app)
 * via window.electronAPI
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // ── Platform ───────────────────────────────────────────
  isElectron: true,
  platform:   process.platform,

  // ── Settings ───────────────────────────────────────────
  getSettings:  ()           => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings)   => ipcRenderer.invoke('settings:set', settings),

  // ── RTMP secrets (encrypted) ───────────────────────────
  getSecrets:   ()           => ipcRenderer.invoke('secrets:get'),
  saveSecrets:  (secrets)    => ipcRenderer.invoke('secrets:set', secrets),

  // ── System info ────────────────────────────────────────
  systemInfo:   ()           => ipcRenderer.invoke('system:info'),

  // ── Window controls ────────────────────────────────────
  minimize:     ()           => ipcRenderer.invoke('window:minimize'),
  maximize:     ()           => ipcRenderer.invoke('window:maximize'),
  close:        ()           => ipcRenderer.invoke('window:close'),
  isMaximized:  ()           => ipcRenderer.invoke('window:isMaximized'),

  // ── Shell ──────────────────────────────────────────────
  openExternal: (url)        => ipcRenderer.invoke('shell:openExternal', url),

  // ── Events from main → renderer ────────────────────────
  on:  (channel, fn) => ipcRenderer.on(channel, (_, ...args) => fn(...args)),
  off: (channel, fn) => ipcRenderer.removeListener(channel, fn),
})
