/**
 * WindowTitleBar — custom traffic light buttons for Windows/Linux Electron.
 * Floats in the top-left corner of every page.
 * Hidden on macOS (uses native hiddenInset titlebar) and in browser.
 */
import React, { useEffect, useState } from 'react'

const IS_ELECTRON = typeof window !== 'undefined' && !!window.electronAPI
const IS_MAC      = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)

export default function WindowTitleBar() {
  const [maximized, setMaximized] = useState(false)

  // Only render on Windows/Linux Electron
  if (!IS_ELECTRON || IS_MAC) return null

  const minimize = () => window.electronAPI.invoke('window:minimize')
  const toggleMax = async () => {
    await window.electronAPI.invoke('window:maximize')
    const m = await window.electronAPI.invoke('window:isMaximized')
    setMaximized(m)
  }
  const close = () => window.electronAPI.invoke('window:close')

  return (
    <div
      className="fixed top-0 left-0 z-[9999] flex items-center gap-1.5 px-3"
      style={{ height: 36, WebkitAppRegion: 'drag' }}
    >
      {/* Drag region spacer — the buttons themselves stop drag */}
      <div style={{ WebkitAppRegion: 'no-drag', display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Close — red */}
        <button
          onClick={close}
          title="Close"
          style={{
            width: 13, height: 13, borderRadius: '50%',
            background: '#ff5f57',
            border: '1px solid #e0443e',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, color: 'transparent', transition: 'color 0.1s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#4d0000'}
          onMouseLeave={e => e.currentTarget.style.color = 'transparent'}
        >✕</button>

        {/* Minimize — yellow */}
        <button
          onClick={minimize}
          title="Minimize"
          style={{
            width: 13, height: 13, borderRadius: '50%',
            background: '#febc2e',
            border: '1px solid #d4a017',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, color: 'transparent', transition: 'color 0.1s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#5a3a00'}
          onMouseLeave={e => e.currentTarget.style.color = 'transparent'}
        >−</button>

        {/* Maximize — green */}
        <button
          onClick={toggleMax}
          title={maximized ? 'Restore' : 'Maximize'}
          style={{
            width: 13, height: 13, borderRadius: '50%',
            background: '#28c840',
            border: '1px solid #1aab2e',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, color: 'transparent', transition: 'color 0.1s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#003d0f'}
          onMouseLeave={e => e.currentTarget.style.color = 'transparent'}
        >{maximized ? '⤡' : '⤢'}</button>
      </div>
    </div>
  )
}
