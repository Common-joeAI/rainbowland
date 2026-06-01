import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'
import { getTheme, DEFAULT_THEME_ID } from './themes'
import { applyThemeToCSSVars }        from './hooks/useTheme'
import { useThemeStore }               from './hooks/useTheme'

// Apply the stored (or default) theme before first render
const storedId    = (() => {
  try {
    return JSON.parse(localStorage.getItem('rainbowland-theme') || '{}')?.state?.activeThemeId
  } catch { return null }
})()
applyThemeToCSSVars(getTheme(storedId || DEFAULT_THEME_ID))

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
