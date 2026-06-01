/**
 * ThemePicker — lets the creator switch themes in the studio.
 * Shows a live preview swatch for each theme.
 */
import React from 'react'
import clsx from 'clsx'
import { Check, Palette } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'

export default function ThemePicker({ compact = false }) {
  const { allThemes, activeThemeId, setTheme } = useTheme()

  return (
    <div className={clsx('space-y-2', compact && 'px-3 pb-3')}>
      {!compact && (
        <div className="flex items-center gap-2 mb-3">
          <Palette className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
          <span className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Studio Theme
          </span>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            — affects the entire app
          </span>
        </div>
      )}

      {allThemes.map(theme => {
        const isActive = theme.id === activeThemeId
        return (
          <button
            key={theme.id}
            onClick={() => setTheme(theme.id)}
            className={clsx(
              'w-full flex items-center gap-3 px-3 py-3 rounded-xl border transition-all text-left',
              isActive
                ? 'border-white/20 bg-white/5'
                : 'border-white/5 hover:border-white/10 hover:bg-white/3'
            )}
          >
            {/* Color swatch */}
            <div className="flex-shrink-0 flex gap-0.5">
              {[theme.colors.primary, theme.colors.secondary, theme.colors.tertiary]
                .filter(Boolean)
                .map((c, i) => (
                  <div key={i} className="w-4 h-4 rounded-full border border-white/10"
                    style={{ background: c }} />
                ))}
            </div>

            {/* Gradient preview bar */}
            <div className="flex-shrink-0 w-16 h-2 rounded-full"
              style={{ background: theme.gradients.brand }} />

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-bold truncate">{theme.name}</p>
              <p className="text-white/40 text-xs truncate">{theme.description}</p>
            </div>

            {/* Active check */}
            {isActive && (
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}
          </button>
        )
      })}

      <p className="text-white/20 text-[10px] px-1 pt-1">
        Drop a .js theme file into src/themes/ to add your own brand.
      </p>
    </div>
  )
}
