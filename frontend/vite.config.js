import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// TAURI_DEV_HOST is set by `tauri dev` for mobile live-reload on physical device
const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react()],

  // Tauri requires exact port + prevents opening browser in mobile dev mode
  clearScreen: false,

  server: {
    host: host || '0.0.0.0',
    port: 5173,
    strictPort: true,
    // HMR over websocket for mobile physical device
    hmr: host
      ? { protocol: 'ws', host, port: 5174 }
      : undefined,
    // Dev-only proxy — mobile production builds use VITE_API_URL directly
    proxy: {
      '/api': process.env.VITE_API_URL || 'http://localhost:8001',
      '/images': process.env.VITE_API_URL || 'http://localhost:8001',
    },
  },

  // Expose VITE_ and TAURI_ prefixed env vars to the app
  envPrefix: ['VITE_', 'TAURI_'],

  build: {
    // Tauri uses Chromium on Android and WebKit on iOS — target accordingly
    target:
      process.env.TAURI_ENV_PLATFORM === 'android'
        ? 'chrome105'
        : 'safari13',
    minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
})
