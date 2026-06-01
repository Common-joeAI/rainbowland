/**
 * Neon Nights — Gaming / Cyberpunk Creator Theme
 * Example of a completely different creator brand.
 */
export default {
  id:          'neon-nights',
  name:        'Neon Nights',
  description: 'Cyberpunk vibes for gaming streamers ⚡',
  author:      '@neon-nights',
  version:     '1.0.0',

  colors: {
    bg900: '#020209',
    bg800: '#06060f',
    bg700: '#0a0a16',
    bg600: '#0f0f20',
    bg500: '#14142a',
    bg400: '#1c1c36',

    primary:   '#00FFF0',   // cyan
    secondary: '#FF00FF',   // magenta
    tertiary:  '#FFE600',   // yellow

    textPrimary:   '#E0E0FF',
    textSecondary: 'rgba(224,224,255,0.7)',
    textMuted:     'rgba(224,224,255,0.3)',

    live:    '#FF0055',
    success: '#00FFC8',
    warning: '#FFE600',
    error:   '#FF0055',
  },

  fonts: {
    display: 'Orbitron',
    body:    'Rajdhani',
    mono:    'Share Tech Mono',
    weight:  { display: 700, body: 400 },
  },

  gradients: {
    brand:      'linear-gradient(135deg, #00FFF0 0%, #FF00FF 100%)',
    text:       'linear-gradient(90deg, #00FFF0, #FF00FF, #FFE600, #00FFF0)',
    navActive:  'linear-gradient(135deg, #00FFF0, #FF00FF)',
    liveButton: 'linear-gradient(135deg, #FF0055, #FF00FF)',
    overlay:    'linear-gradient(90deg, #00FFF0, #FF00FF, #FFE600)',
  },

  motion: {
    style:         'snappy',
    transitionMs:  120,
    glowIntensity: 0.8,
  },

  overlays: [
    { id: 'none',  label: 'None',       style: '' },
    { id: 'cyan',  label: '⚡ Cyan',    style: 'linear-gradient(90deg,#00FFF0,#0050FF)' },
    { id: 'fire',  label: '🔥 Fire',    style: 'linear-gradient(90deg,#FFE600,#FF4400,#FF0055)' },
    { id: 'glitch',label: '👾 Glitch',  style: 'linear-gradient(90deg,#00FFF0,#FF00FF,#00FFF0,#FF00FF)' },
    { id: 'matrix',label: '🟩 Matrix',  style: 'linear-gradient(90deg,#001a00,#00CC00,#001a00)' },
  ],

  assets: {
    logo:      'logo.svg',
    wordmark:  'wordmark.svg',
    favicon:   'favicon.ico',
    watermark: 'watermark.png',
  },

  overlay: {
    position:      'bottom',
    height:        4,
    showWatermark: true,
    watermarkPos:  'bottom-right',
  },

  chrome: {
    borderRadius: 'sm',
    glassOpacity: 0.08,
    glassBlur:    12,
    navStyle:     'underline',
  },
}
