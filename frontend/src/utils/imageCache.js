/**
 * Local image cache backed by the Cache Storage API.
 *
 *  - cachedImage(url, carId): returns a blob: URL served from cache (fetching &
 *    caching on first miss). Falls back to the original network URL on any error,
 *    so display never breaks.
 *  - purgeCarImages(carId): removes every cached image belonging to one car —
 *    call this when a car is deleted.
 *  - reconcileCache(existingCarIds): drops cache entries for cars that no longer
 *    exist — call on list load.
 *
 * A small per-car URL index is kept in localStorage so we know which cache
 * entries belong to which car.
 */
const CACHE_NAME = 'bk-car-images-v1'
const INDEX_KEY = 'bk_img_index'

const supported = () => typeof window !== 'undefined' && 'caches' in window

function readIndex() {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY) || '{}') } catch { return {} }
}
function writeIndex(idx) {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(idx)) } catch { /* quota — ignore */ }
}

function track(carId, url) {
  if (carId == null) return
  const idx = readIndex()
  const key = String(carId)
  const arr = idx[key] || []
  if (!arr.includes(url)) {
    arr.push(url)
    idx[key] = arr
    writeIndex(idx)
  }
}

/** Resolve an image URL to a cached blob URL (or the original on any failure). */
export async function cachedImage(url, carId) {
  if (!url || !supported()) return url
  try {
    const cache = await caches.open(CACHE_NAME)
    let res = await cache.match(url)
    if (!res) {
      const net = await fetch(url)
      if (!net.ok) return url
      await cache.put(url, net.clone())
      res = net
      track(carId, url)
    } else {
      track(carId, url)
    }
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  } catch {
    return url
  }
}

/** Delete every cached image for one car (call on car delete). */
export async function purgeCarImages(carId) {
  if (carId == null || !supported()) return
  try {
    const idx = readIndex()
    const key = String(carId)
    const urls = idx[key] || []
    const cache = await caches.open(CACHE_NAME)
    await Promise.all(urls.map((u) => cache.delete(u)))
    delete idx[key]
    writeIndex(idx)
  } catch { /* ignore */ }
}

/** Drop cache entries for cars that are no longer in the given id list. */
export async function reconcileCache(existingCarIds) {
  if (!supported()) return
  try {
    const keep = new Set((existingCarIds || []).map(String))
    const idx = readIndex()
    const cache = await caches.open(CACHE_NAME)
    let changed = false
    for (const carId of Object.keys(idx)) {
      if (!keep.has(carId)) {
        await Promise.all((idx[carId] || []).map((u) => cache.delete(u)))
        delete idx[carId]
        changed = true
      }
    }
    if (changed) writeIndex(idx)
  } catch { /* ignore */ }
}
