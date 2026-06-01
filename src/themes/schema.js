/**
 * Rainbow Land Theme Schema
 * 
 * Every theme is a plain JS object matching this shape.
 * Load via ThemeProvider — no hardcoded colors anywhere else.
 *
 * To create a creator theme:
 *   1. Copy any theme file in src/themes/
 *   2. Change the values
 *   3. Register it in src/themes/index.js
 *   4. Done — the entire studio re-skins automatically
 */

export const THEME_SCHEMA = {
  // ── Identity ────────────────────────────────────────────────
  id:          'string  — unique slug, e.g. "rainbowland"',
  name:        'string  — display name, e.g. "Rainbow Land"',
  description: 'string  — short tagline',
  author:      'string  — creator handle',
  version:     'string  — semver, e.g. "1.0.0"',

  // ── Brand colors ────────────────────────────────────────────
  colors: {
    // Background scale (darkest → lightest)
    bg900: '#hex',
    bg800: '#hex',
    bg700: '#hex',
    bg600: '#hex',
    bg500: '#hex',
    bg400: '#hex',

    // Primary accent (buttons, active states, glow)
    primary:   '#hex',
    secondary: '#hex',
    tertiary:  '#hex',

    // Text
    textPrimary:   '#hex',
    textSecondary: '#hex',
    textMuted:     '#hex',

    // Status
    live:    '#hex',  // LIVE badge
    success: '#hex',
    warning: '#hex',
    error:   '#hex',
  },

  // ── Typography ──────────────────────────────────────────────
  fonts: {
    display: 'string  — Google Font name or system font, e.g. "Inter"',
    body:    'string',
    mono:    'string',
    weight: {
      display: 'number  — e.g. 900',
      body:    'number  — e.g. 400',
    }
  },

  // ── Gradient definitions ─────────────────────────────────────
  gradients: {
    brand:     'string  — CSS gradient for hero elements',
    text:      'string  — CSS gradient for gradient text',
    navActive: 'string  — active tab indicator',
    liveButton:'string  — Go Live button',
    overlay:   'string  — video overlay bar',
  },

  // ── Animation style ──────────────────────────────────────────
  motion: {
    // 'fluid' | 'snappy' | 'minimal' | 'bouncy'
    style:          'string',
    transitionMs:   'number  — default transition duration ms',
    glowIntensity:  'number  — 0–1, shadow spread multiplier',
  },

  // ── Pride overlays (shown on the video stream) ───────────────
  overlays: [
    {
      id:    'string',
      label: 'string',
      // CSS gradient or solid color
      style: 'string',
    }
  ],

  // ── Logo / branding assets ───────────────────────────────────
  assets: {
    // Relative to /public/themes/<id>/
    logo:      'string  — e.g. "logo.svg"',
    wordmark:  'string  — e.g. "wordmark.svg"',
    favicon:   'string  — e.g. "favicon.ico"',
    // Shown in stream overlay bottom-left
    watermark: 'string  — e.g. "watermark.png"',
  },

  // ── Stream overlay layout ────────────────────────────────────
  overlay: {
    position:     'string  — "top" | "bottom" | "both" | "corners"',
    height:       'number  — px',
    showWatermark: 'boolean',
    watermarkPos:  'string  — "bottom-left" | "bottom-right" | "top-right"',
  },

  // ── UI chrome ────────────────────────────────────────────────
  chrome: {
    borderRadius: 'string  — e.g. "xl" | "2xl" | "none" | "full"',
    glassOpacity: 'number  — 0–1',
    glassBlur:    'number  — px',
    navStyle:     'string  — "pill" | "underline" | "glow"',
  },
}
