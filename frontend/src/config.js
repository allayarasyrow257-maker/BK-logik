// ── Backend URL configuration ───────────────────────────────────────────────
// In dev: VITE_API_URL is empty → uses Vite proxy (relative URLs work)
// In mobile build: set VITE_API_URL=http://192.168.x.x:8001 in .env.mobile
// Easy to change: edit frontend/.env.mobile and re-run build-mobile.sh
export const SERVER_URL = import.meta.env.VITE_API_URL || ''
export const API_BASE = `${SERVER_URL}/api`
