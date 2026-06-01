/**
 * Lo-Fi Sunset — Chill / Aesthetic Creator Theme
 * Warm pastel vibes for art, music, and lifestyle creators.
 */
export default {
  id:          'lofi-sunset',
  name:        'Lo-Fi Sunset',
  description: 'Warm pastel vibes for chill creators 🌅',
  author:      '@lofi-sunset',
  version:     '1.0.0',

  colors: {
    bg900: '#0f0a0a',
    bg800: '#1a1010',
    bg700: '#241616',
    bg600: '#2e1e1e',
    bg500: '#3a2424',
    bg400: '#4a2e2e',

    primary:   '#FF9A8B',   // coral
    secondary: '#FFECD2',   // cream
    tertiary:  '#A8EDEA',   // mint

    textPrimary:   '#FFF5E6',
    textSecondary: 'rgba(255,245,230,0.7)',
    textMuted:     'rgba(255,245,230,0.35)',

    live:    '#FF6B6B',
    success: '#A8EDEA',
    warning: '#FFECD2',
    error:   '#FF6B6B',
  },

  fonts: {
    display: 'Playfair Display',
    body:    'Lato',
    mono:    'Courier Prime',
    weight:  { display: 700, body: 400 },
  },

  gradients: {
    brand:      'linear-gradient(135deg, #FF9A8B 0%, #FF6A88 55%, #FF99AC 100%)',
    text:       'linear-gradient(90deg, #FF9A8B, #FFECD2, #A8EDEA, #FF9A8B)',
    navActive:  'linear-gradient(135deg, #FF9A8B, #FF6A88)',
    liveButton: 'linear-gradient(135deg, #FF6B6B, #FF9A8B)',
    overlay:    'linear-gradient(90deg, #FF9A8B, #FFECD2, #A8EDEA)',
  },

  motion: {
    style:         'bouncy',
    transitionMs:  300,
    glowIntensity: 0.2,
  },

  overlays: [
    { id: 'none',   label: 'None',         style: '' },
    { id: 'sunset', label: '🌅 Sunset',    style: 'linear-gradient(90deg,#FF9A8B,#FFECD2,#FF6A88)' },
    { id: 'mint',   label: '🌿 Mint',      style: 'linear-gradient(90deg,#A8EDEA,#FED6E3)' },
    { id: 'sakura', label: '🌸 Sakura',    style: 'linear-gradient(90deg,#FED6E3,#FFECD2,#FED6E3)' },
    { id: 'dusk',   label: '🌆 Dusk',      style: 'linear-gradient(90deg,#4a1942,#c9546f,#FF9A8B)' },
  ],

  assets: {
    logo:      'logo.svg',
    wordmark:  'wordmark.svg',
    favicon:   'favicon.ico',
    watermark: 'watermark.png',
  },

  overlay: {
    position:      'bottom',
    height:        5,
    showWatermark: false,
    watermarkPos:  'bottom-left',
  },

  chrome: {
    borderRadius: '2xl',
    glassOpacity: 0.06,
    glassBlur:    16,
    navStyle:     'pill',
  },
}
