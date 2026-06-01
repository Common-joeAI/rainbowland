/**
 * Rainbow Land — Default Pride Theme
 * The flagship theme for LGBT+ creators.
 */
export default {
  id:          'rainbowland',
  name:        'Rainbow Land',
  description: 'The home of pride creators everywhere 🌈',
  author:      '@rainbowland',
  version:     '1.0.0',

  colors: {
    bg900: '#050508',
    bg800: '#0a0a10',
    bg700: '#111118',
    bg600: '#1a1a24',
    bg500: '#22222e',
    bg400: '#2e2e3e',

    primary:   '#9B59FF',
    secondary: '#FF3366',
    tertiary:  '#00B4FF',

    textPrimary:   '#ffffff',
    textSecondary: 'rgba(255,255,255,0.7)',
    textMuted:     'rgba(255,255,255,0.3)',

    live:    '#ef4444',
    success: '#00E676',
    warning: '#FFD700',
    error:   '#FF3366',
  },

  fonts: {
    display: 'Inter',
    body:    'Inter',
    mono:    'JetBrains Mono',
    weight:  { display: 900, body: 400 },
  },

  gradients: {
    brand:      'linear-gradient(135deg, #FF3366 0%, #9B59FF 50%, #00B4FF 100%)',
    text:       'linear-gradient(90deg, #FF3366, #FF7A00, #FFD700, #00E676, #00B4FF, #9B59FF, #FF69B4, #FF3366)',
    navActive:  'linear-gradient(135deg, #9B59FF, #FF3366)',
    liveButton: 'linear-gradient(135deg, #dc2626, #FF3366, #9B59FF)',
    overlay:    'linear-gradient(90deg, #FF3366, #FF7A00, #FFD700, #00E676, #00B4FF, #9B59FF)',
  },

  motion: {
    style:         'fluid',
    transitionMs:  200,
    glowIntensity: 0.4,
  },

  overlays: [
    { id: 'none',       label: 'None',           style: '' },
    { id: 'rainbow',    label: '🌈 Rainbow',     style: 'linear-gradient(90deg,#FF3366,#FF7A00,#FFD700,#00E676,#00B4FF,#9B59FF)' },
    { id: 'trans',      label: '⚧️ Trans',       style: 'linear-gradient(90deg,#55CDFC,#F7A8B8,#FFFFFF,#F7A8B8,#55CDFC)' },
    { id: 'bi',         label: '💜 Bisexual',    style: 'linear-gradient(90deg,#D60270,#D60270,#9B4F96,#0038A8,#0038A8)' },
    { id: 'nonbinary',  label: '🟡 Non-Binary',  style: 'linear-gradient(90deg,#FCF434,#FFFFFF,#9C59D1,#2C2C2C)' },
    { id: 'lesbian',    label: '🧡 Lesbian',     style: 'linear-gradient(90deg,#D52D00,#EF7627,#FF9A56,#FFFFFF,#D162A4,#B55690,#A50062)' },
    { id: 'pan',        label: '💛 Pansexual',   style: 'linear-gradient(90deg,#FF218C,#FF218C,#FFD800,#21B1FF,#21B1FF)' },
    { id: 'ace',        label: '🖤 Asexual',     style: 'linear-gradient(90deg,#000000,#A4A4A4,#FFFFFF,#810081)' },
    { id: 'genderfluid',label: '💜 Genderfluid', style: 'linear-gradient(90deg,#FF76A4,#FFFFFF,#BE18D6,#000000,#333EBC)' },
    { id: 'progress',   label: '✊ Progress',    style: 'linear-gradient(90deg,#FF3366,#FF7A00,#FFD700,#00E676,#00B4FF)' },
  ],

  assets: {
    logo:      'logo.svg',
    wordmark:  'wordmark.svg',
    favicon:   'favicon.ico',
    watermark: 'watermark.png',
  },

  overlay: {
    position:      'both',
    height:        6,
    showWatermark: true,
    watermarkPos:  'bottom-right',
  },

  chrome: {
    borderRadius: 'xl',
    glassOpacity: 0.05,
    glassBlur:    8,
    navStyle:     'glow',
  },
}
