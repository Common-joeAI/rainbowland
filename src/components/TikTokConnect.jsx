/**
 * TikTokConnect — shows TikTok OAuth status and connect/disconnect button.
 * Works in both Electron (real OAuth) and browser (demo mode).
 */
import { useState, useEffect } from 'react'

export default function TikTokConnect({ onConnected }) {
  const [status, setStatus]   = useState(null)   // null = loading
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const api = window.electronAPI

  async function refresh() {
    if (!api) { setStatus({ connected: false, demo: true }); return }
    try {
      const s = await api.tiktokStatus()
      setStatus(s)
      if (s.connected && onConnected) onConnected(s)
    } catch { setStatus({ connected: false }) }
  }

  useEffect(() => { refresh() }, [])

  async function handleConnect() {
    if (!api) return
    setLoading(true)
    setError(null)
    try {
      const result = await api.tiktokConnect()
      if (result.connected) {
        setStatus(result)
        if (onConnected) onConnected(result)
      } else {
        setError(result.error || 'Connection failed')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDisconnect() {
    if (!api) return
    setLoading(true)
    try {
      await api.tiktokDisconnect()
      setStatus({ connected: false })
    } finally {
      setLoading(false)
    }
  }

  if (status === null) {
    return (
      <div style={styles.card}>
        <div style={styles.row}>
          <TikTokLogo />
          <span style={{ color: '#888', fontSize: '0.9rem' }}>Checking…</span>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.card}>
      <div style={styles.row}>
        <TikTokLogo />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>TikTok</div>
          {status.connected
            ? <div style={{ fontSize: '0.8rem', color: '#06d6a0' }}>
                Connected as <strong>{status.displayName}</strong>
              </div>
            : <div style={{ fontSize: '0.8rem', color: '#888899' }}>
                {status.demo ? 'Not available in browser — use the desktop app' : 'Not connected'}
              </div>
          }
        </div>

        {!status.demo && (
          status.connected
            ? <button style={{ ...styles.btn, ...styles.btnDanger }} onClick={handleDisconnect} disabled={loading}>
                {loading ? '…' : 'Disconnect'}
              </button>
            : <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={handleConnect} disabled={loading}>
                {loading ? 'Opening browser…' : 'Connect TikTok'}
              </button>
        )}
      </div>

      {error && (
        <div style={styles.error}>⚠️ {error}</div>
      )}

      {!status.connected && !status.demo && (
        <p style={styles.hint}>
          Clicking Connect will open TikTok in your browser. Authorize Rainbow Land, then return here.
        </p>
      )}
    </div>
  )
}

function TikTokLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#fff', flexShrink: 0 }}>
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V9.13a8.16 8.16 0 004.77 1.52V7.21a4.85 4.85 0 01-1-.52z"/>
    </svg>
  )
}

const styles = {
  card: {
    background: '#13131a',
    border: '1px solid #2a2a3a',
    borderRadius: 12,
    padding: '1rem 1.25rem',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  btn: {
    padding: '0.4rem 1rem',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.85rem',
    transition: 'opacity 0.2s',
  },
  btnPrimary: {
    background: 'linear-gradient(135deg, #ff4d6d, #9b5de5)',
    color: '#fff',
  },
  btnDanger: {
    background: '#2a2a3a',
    color: '#ff4d6d',
  },
  error: {
    marginTop: '0.5rem',
    padding: '0.5rem 0.75rem',
    background: 'rgba(255,77,109,0.1)',
    border: '1px solid rgba(255,77,109,0.3)',
    borderRadius: 8,
    color: '#ff4d6d',
    fontSize: '0.85rem',
  },
  hint: {
    marginTop: '0.75rem',
    fontSize: '0.8rem',
    color: '#888899',
    lineHeight: 1.5,
  },
}
