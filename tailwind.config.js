/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'sans-serif'] },
      colors: {
        rainbow: {
          red:    '#FF3366',
          orange: '#FF7A00',
          yellow: '#FFD700',
          green:  '#00E676',
          blue:   '#00B4FF',
          purple: '#9B59FF',
          pink:   '#FF69B4',
        },
        dark: {
          900: '#050508',
          800: '#0a0a10',
          700: '#111118',
          600: '#1a1a24',
          500: '#22222e',
          400: '#2e2e3e',
        }
      },
      animation: {
        'gradient-x': 'gradient-x 4s ease infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'slide-up': 'slide-up 0.3s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        'rainbow-border': 'rainbow-border 3s linear infinite',
      },
      keyframes: {
        'gradient-x': {
          '0%, 100%': { 'background-position': '0% 50%' },
          '50%': { 'background-position': '100% 50%' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.6 },
        },
        'slide-up': {
          '0%': { transform: 'translateY(20px)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        },
        'fade-in': {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        'rainbow-border': {
          '0%':   { 'background-position': '0% 0%' },
          '100%': { 'background-position': '200% 0%' },
        }
      },
      backgroundSize: { '200%': '200%' },
    },
  },
  plugins: [],
}
