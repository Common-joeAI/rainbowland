/**
 * Theme registry — add any theme file here to make it available.
 * The first theme in the list is the default.
 */
import rainbowland from './rainbowland'
import neonNights  from './neon-nights'
import lofiSunset  from './lofi-sunset'

export const THEMES = {
  [rainbowland.id]: rainbowland,
  [neonNights.id]:  neonNights,
  [lofiSunset.id]:  lofiSunset,
}

export const DEFAULT_THEME_ID = 'rainbowland'

export function getTheme(id) {
  return THEMES[id] ?? THEMES[DEFAULT_THEME_ID]
}

export function listThemes() {
  return Object.values(THEMES)
}
