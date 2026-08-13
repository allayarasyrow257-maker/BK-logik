import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import App from './App'
import './i18n'
import './index.css'

// Disable native WebView page zoom (pinch / double-tap) for a fixed, native feel.
// Component-level gestures (e.g. Lightbox image zoom) use their own touch handlers
// with touch-action:none and are unaffected.
;['gesturestart', 'gesturechange', 'gestureend'].forEach((evt) => {
  document.addEventListener(evt, (e) => e.preventDefault(), { passive: false })
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
