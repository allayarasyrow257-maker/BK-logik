import { SERVER_URL } from '../config'
import { toast } from './toast'
import { startProgress, updateProgress, finishProgress } from './progressBar'

// Translate with fallback + {{var}} interpolation. `t` is the i18next t()
// passed in from the calling component so toasts follow the selected language.
function tr(t, key, opts, fallback) {
  try {
    if (typeof t === 'function') {
      const full = 'common.' + key
      const s = t(full, opts || {})
      if (s && s !== full) return s
    }
  } catch { /* ignore */ }
  let f = fallback
  if (opts) for (const k in opts) f = f.split('{{' + k + '}}').join(opts[k])
  return f
}

export function downloadUrl(src) {
  if (!src || typeof src !== 'string') return src
  if (src.startsWith('http')) {
    return `${SERVER_URL}/api/proxy-image?url=${encodeURIComponent(src)}`
  }
  if (src.startsWith('/')) return `${SERVER_URL}${src}`
  return src
}

// Evaluated at CALL time (not module load) so Tauri's injected globals are ready.
function inTauri() {
  return typeof window !== 'undefined' &&
    (!!window.__TAURI_INTERNALS__ || !!window.__TAURI__ || !!window.isTauri)
}
const UA = () => (typeof navigator !== 'undefined' && navigator.userAgent) || ''
const isAndroid = () => /Android/i.test(UA())
const isMobile = () => /Android|iPhone|iPad|iPod/i.test(UA()) ||
  (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

const ALBUM = 'BK Logistics'

async function fetchBlob(src) {
  const res = await fetch(downloadUrl(src))   // served from HTTP cache on repeat
  if (!res.ok) throw new Error('image fetch failed (' + res.status + ')')
  return res.blob()
}

function saveViaAnchor(blob, name) {
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

function openOriginal(src) {
  const url = src.startsWith('http') ? src : `${SERVER_URL}${src}`
  try { window.open(url, '_blank') } catch { window.location.href = url }
}

// ── iOS native Photos (Tauri, non-Android) ───────────────────────────────────
let _photos = null
let _invoke = null
async function nativeApi() {
  if (!_photos) _photos = await import('@gbyte/tauri-plugin-ios-photos')
  if (!_invoke) _invoke = (await import('@tauri-apps/api/core')).invoke
  return { photos: _photos, invoke: _invoke }
}

async function ensurePermission(photos, t) {
  let status = await photos.getPhotosAuthStatus()
  if (status === 3 || status === 4) return
  status = await photos.requestPhotosAuth()
  if (status !== 3 && status !== 4) {
    throw new Error(tr(t, 'photoPermission', null, 'Photo access denied. Settings > BK Logistics > Photos'))
  }
}

let _albumId = null
async function resolveAlbumId(photos) {
  if (_albumId) return _albumId
  try {
    const albums = await photos.requestAlbums({
      with: photos.PHAssetCollectionType.album,
      subtype: photos.PHAssetCollectionSubtype.albumRegular,
    })
    const found = (albums || []).find((a) => a.name === ALBUM)
    if (found && found.id) { _albumId = found.id; return _albumId }
  } catch { /* fall through to create */ }
  const id = await photos.createAlbum({ title: ALBUM })
  if (!id) throw new Error('album create failed')
  _albumId = id
  return id
}

async function saveOneNative(photos, invoke, src, name) {
  const albumId = await resolveAlbumId(photos)
  const blob = await fetchBlob(src)
  const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()))
  const path = await invoke('save_temp_image', { name, bytes })
  try {
    await photos.createPhotos({ album: albumId, files: [path] })
  } catch {
    const uri = path.startsWith('file://') ? path : 'file://' + path
    await photos.createPhotos({ album: albumId, files: [uri] })
  }
}

const isApplePlatform = () => inTauri() && !isAndroid()

// ── Web / Android (share sheet) or desktop (download) ─────────────────────────
async function shareOrDownload(files) {
  // Android WebView + mobile browsers support the Web Share API (files).
  if (isMobile() && typeof navigator.share === 'function' &&
      (!navigator.canShare || navigator.canShare({ files }))) {
    try {
      await navigator.share({ files })
      return 'shared'
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancel'
      // else fall through to anchor
    }
  }
  for (const f of files) {
    saveViaAnchor(f, f.name)
    await new Promise((r) => setTimeout(r, 200))
  }
  return 'downloaded'
}

// Fetches run FETCH_CONCURRENCY at a time instead of one-by-one — with 20+
// photos a sequential loop meant nothing downloaded for many seconds while
// each image was fetched in turn. `onProgress(done, total)` fires after every
// completed fetch so the caller can drive a progress indicator.
const FETCH_CONCURRENCY = 6

async function toFiles(list, filenameBase, onProgress) {
  const files = new Array(list.length)
  let done = 0

  async function worker(start) {
    for (let i = start; i < list.length; i += FETCH_CONCURRENCY) {
      try {
        const blob = await fetchBlob(list[i])
        const name = list.length === 1 ? `${filenameBase}.jpg` : `${filenameBase}-${i + 1}.jpg`
        files[i] = new File([blob], name, { type: blob.type || 'image/jpeg' })
      } catch { /* skip */ }
      done++
      if (onProgress) onProgress(done, list.length)
    }
  }

  const workers = []
  for (let w = 0; w < Math.min(FETCH_CONCURRENCY, list.length); w++) workers.push(worker(w))
  await Promise.all(workers)

  return files.filter(Boolean)
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function downloadImage(src, filename, t) {
  const name = filename || 'image.jpg'

  // iOS (Tauri) → save straight into the Photos library.
  if (isApplePlatform()) {
    try {
      const { photos, invoke } = await nativeApi()
      await ensurePermission(photos, t)
      await saveOneNative(photos, invoke, src, name)
      toast(tr(t, 'savedToGallery', null, 'Saved to gallery'))
    } catch (err) {
      const e = (err && (err.message || String(err))) || ''
      toast(tr(t, 'saveError', { error: e }, 'Save error: {{error}}'), 'error', 4000)
    }
    return
  }

  // Android (Tauri) & browsers → share sheet on mobile, download on desktop.
  const base = name.replace(/\.jpg$/i, '')
  const files = await toFiles([src], base)
  if (!files.length) { openOriginal(src); return }
  const res = await shareOrDownload(files)
  if (res !== 'cancel' && isMobile()) toast(tr(t, 'savedToGallery', null, 'Saved to gallery'))
}

export async function downloadImages(list, filenameBase = 'image', t) {
  // iOS (Tauri) → save each into Photos with progress.
  if (isApplePlatform()) {
    let ok = 0
    startProgress()
    try {
      const { photos, invoke } = await nativeApi()
      await ensurePermission(photos, t)
      for (let i = 0; i < list.length; i++) {
        try {
          await saveOneNative(photos, invoke, list[i], `${filenameBase}-${i + 1}.jpg`)
          ok++
          toast(tr(t, 'saving', { i: ok, n: list.length }, 'Saving {{i}}/{{n}}…'), 'info', 700)
        } catch { /* skip */ }
        updateProgress(i + 1, list.length)
      }
      if (ok) toast(tr(t, 'savedCount', { n: ok }, '{{n}} photos saved to gallery'))
      else toast(tr(t, 'saveNone', null, 'No photo could be saved'), 'error', 4000)
    } catch (err) {
      const e = (err && (err.message || String(err))) || ''
      toast(tr(t, 'saveError', { error: e }, 'Save error: {{error}}'), 'error', 4000)
    } finally {
      finishProgress()
    }
    return ok
  }

  // Android (Tauri) & browsers → one share sheet with all images (or downloads).
  // Fetches happen in parallel (see toFiles) and the top progress bar tracks
  // them, so the tab stays fully usable — the user isn't stuck watching a
  // spinner while 20+ photos download in the background.
  startProgress()
  try {
    const files = await toFiles(list, filenameBase, (done, total) => updateProgress(done, total))
    if (!files.length) { toast(tr(t, 'saveNone', null, 'No photo could be saved'), 'error', 4000); return 0 }
    const res = await shareOrDownload(files)
    if (res !== 'cancel' && isMobile()) toast(tr(t, 'savedCount', { n: files.length }, '{{n}} photos saved to gallery'))
    return files.length
  } finally {
    finishProgress()
  }
}
