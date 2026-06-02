import React, { useState, useEffect } from 'react'
import { Download, RefreshCw, X, CheckCircle, Loader } from 'lucide-react'

/**
 * UpdatePrompt — shown when electron-updater finds a new version.
 * Listens to updater:status events from main process.
 */
export default function UpdatePrompt() {
  const [update, setUpdate] = useState(null) // null | { status, version, percent, message }

  const isElectron = typeof window !== 'undefined' && !!window.electronAPI

  useEffect(() => {
    if (!isElectron) return

    const handler = (data) => {
      if (data.status === 'up-to-date' || data.status === 'checking' || data.status === 'dev-mode') {
        // Silent — don't show anything for these
        return
      }
      setUpdate(data)
    }

    window.electronAPI.onUpdaterStatus(handler)
    return () => window.electronAPI.offUpdaterStatus(handler)
  }, [isElectron])

  if (!update) return null

  const dismiss = () => setUpdate(null)

  const handleDownload = () => {
    window.electronAPI.downloadUpdate()
    setUpdate(v => ({ ...v, status: 'downloading', percent: 0 }))
  }

  const handleInstall = () => {
    window.electronAPI.installUpdate()
  }

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
      <div className="glass rounded-2xl border border-rainbow-purple/30 shadow-2xl overflow-hidden">
        {/* Pride strip */}
        <div className="h-[3px] bg-gradient-to-r from-rainbow-red via-rainbow-yellow via-rainbow-green to-rainbow-purple" />

        <div className="p-4">
          {/* Update available */}
          {update.status === 'available' && (
            <>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Download className="w-5 h-5 text-rainbow-purple flex-shrink-0" />
                  <div>
                    <p className="text-white font-bold text-sm">Update Available</p>
                    <p className="text-white/50 text-xs">v{update.version} is ready to download</p>
                  </div>
                </div>
                <button onClick={dismiss} className="text-white/30 hover:text-white/60 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleDownload}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-rainbow-purple to-rainbow-pink text-white font-bold py-2 rounded-xl text-sm"
                >
                  <Download className="w-4 h-4" /> Download
                </button>
                <button
                  onClick={dismiss}
                  className="px-4 glass rounded-xl text-white/50 text-sm border border-white/10"
                >
                  Later
                </button>
              </div>
            </>
          )}

          {/* Downloading */}
          {update.status === 'downloading' && (
            <div className="flex items-center gap-3">
              <Loader className="w-5 h-5 text-rainbow-purple animate-spin flex-shrink-0" />
              <div className="flex-1">
                <p className="text-white font-bold text-sm">Downloading update…</p>
                <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-rainbow-purple to-rainbow-pink transition-all duration-300"
                    style={{ width: `${update.percent || 0}%` }}
                  />
                </div>
                <p className="text-white/40 text-xs mt-1">{update.percent || 0}%</p>
              </div>
            </div>
          )}

          {/* Downloaded — ready to install */}
          {update.status === 'downloaded' && (
            <>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                  <div>
                    <p className="text-white font-bold text-sm">Ready to Install</p>
                    <p className="text-white/50 text-xs">v{update.version} downloaded — restart to apply</p>
                  </div>
                </div>
                <button onClick={dismiss} className="text-white/30 hover:text-white/60 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={handleInstall}
                className="w-full flex items-center justify-center gap-1.5 bg-gradient-to-r from-green-500 to-rainbow-green text-white font-bold py-2 rounded-xl text-sm"
              >
                <RefreshCw className="w-4 h-4" /> Restart & Install
              </button>
            </>
          )}

          {/* Error */}
          {update.status === 'error' && (
            <div className="flex items-center justify-between">
              <p className="text-white/50 text-xs">Update check failed — will retry next launch</p>
              <button onClick={dismiss} className="text-white/30 hover:text-white/60 transition-colors ml-2">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
