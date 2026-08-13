import { SERVER_URL } from '../config'

/**
 * Map a locally-served image URL (/images/...) to the backend thumbnail
 * endpoint. Prepends SERVER_URL so Tauri mobile builds reach the actual
 * backend server (set VITE_API_URL in frontend/.env.mobile).
 */
export function thumb(src, w = 200) {
  if (!src || typeof src !== 'string') return src
  if (src.startsWith('/images/')) {
    const rel = src.slice('/images/'.length)
    return `${SERVER_URL}/api/thumb?path=${encodeURIComponent(rel)}&w=${w}`
  }
  // Prefix any absolute-path URL so it reaches the server in mobile builds
  if (src.startsWith('/')) return `${SERVER_URL}${src}`
  return src
}
