/**
 * useTheme — reads the active theme and exposes helpers.
 * All UI components use this instead of hardcoded colors.
 *
 * Usage:
 *   const { theme, colors, gradients, css } = useTheme()
 *   <div style={{ background: colors.bg800 }}>
 *   <div className={css.glass}>
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getTheme, DEFAULT_THEME_ID, listThemes } from '../themes'

// ── Theme store ───────────────────────────────────────────────
export const useThemeStore = create(
  persist(
    (set, get) => ({
      activeThemeId: DEFAULT_THEME_ID,
      setTheme: (id) => {
        set({ activeThemeId: id })
        applyThemeToCSSVars(getTheme(id))
      },
    }),
    { name: 'rainbowland-theme' }
  )
)

// ── Apply theme to CSS custom properties ──────────────────────
export function applyThemeToCSSVars(theme) {
  const root = document.documentElement
  const c    = theme.colors
  const g    = theme.gradients

  root.style.setProperty('--bg-900',     c.bg900)
  root.style.setProperty('--bg-800',     c.bg800)
  root.style.setProperty('--bg-700',     c.bg700)
  root.style.setProperty('--bg-600',     c.bg600)
  root.style.setProperty('--bg-500',     c.bg500)
  root.style.setProperty('--bg-400',     c.bg400)
  root.style.setProperty('--color-primary',        c.primary)
  root.style.setProperty('--color-secondary',      c.secondary)
  root.style.setProperty('--color-tertiary',       c.tertiary)
  root.style.setProperty('--color-text-primary',   c.textPrimary)
  root.style.setProperty('--color-text-secondary', c.textSecondary)
  root.style.setProperty('--color-text-muted',     c.textMuted)
  root.style.setProperty('--color-live',           c.live)
  root.style.setProperty('--color-success',        c.success)
  root.style.setProperty('--color-warning',        c.warning)
  root.style.setProperty('--color-error',          c.error)
  root.style.setProperty('--gradient-brand',       g.brand)
  root.style.setProperty('--gradient-text',        g.text)
  root.style.setProperty('--gradient-nav-active',  g.navActive)
  root.style.setProperty('--gradient-live-button', g.liveButton)
  root.style.setProperty('--gradient-overlay',     g.overlay)
  root.style.setProperty('--glass-opacity',        String(theme.chrome.glassOpacity))
  root.style.setProperty('--glass-blur',           `${theme.chrome.glassBlur}px`)
  root.style.setProperty('--transition-ms',        `${theme.motion.transitionMs}ms`)

  // Font faces
  if (theme.fonts.display !== 'Inter') {
    const link = document.getElementById('theme-font') || document.createElement('link')
    link.id   = 'theme-font'
    link.rel  = 'stylesheet'
    const fonts = [theme.fonts.display, theme.fonts.body, theme.fonts.mono]
      .filter((f, i, a) => f && a.indexOf(f) === i && f !== 'Inter')
      .map(f => `family=${f.replace(/ /g,'+')}:wght@400;600;700;900`)
      .join('&')
    link.href = `https://fonts.googleapis.com/css2?${fonts}&display=swap`
    document.head.appendChild(link)
  }

  // Base background
  document.body.style.background = c.bg900
  document.body.style.color      = c.textPrimary
}

// ── Main hook ─────────────────────────────────────────────────
export function useTheme() {
  const { activeThemeId, setTheme } = useThemeStore()
  const theme    = getTheme(activeThemeId)
  const allThemes = listThemes()

  // Shorthand helpers
  const colors    = theme.colors
  const gradients = theme.gradients
  const overlays  = theme.overlays
  const motion    = theme.motion

  /** Generates a theme-aware className string for glass cards */
  const css = {
    glass:       'themed-glass',
    card:        'themed-card',
    primary:     'themed-primary',
    liveButton:  'themed-live-btn',
    gradientText:'themed-gradient-text',
  }

  /** Inline style helpers */
  const style = {
    bg: (level = 800) => ({ background: colors[`bg${level}`] }),
    primary: (alpha = 1) => ({ color: colors.primary }),
    glow: (color = colors.primary) => ({
      boxShadow: `0 0 ${20 * motion.glowIntensity}px ${color}55, 0 0 ${40 * motion.glowIntensity}px ${color}22`
    }),
    liveButton: { background: gradients.liveButton },
    transition: { transition: `all ${motion.transitionMs}ms ease` },
  }

  return {
    theme,
    colors,
    gradients,
    overlays,
    motion,
    css,
    style,
    allThemes,
    activeThemeId,
    setTheme,
  }
}
