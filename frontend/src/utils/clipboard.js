/**
 * Copy text to the clipboard.
 * Falls back to the execCommand approach for insecure contexts (http over LAN)
 * where navigator.clipboard is undefined.
 */
export async function copyText(text) {
  const str = String(text ?? '')
  if (!str) return false

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(str)
      return true
    } catch {}
  }

  try {
    const ta = document.createElement('textarea')
    ta.value = str
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0'
    ta.readOnly = true
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    ta.setSelectionRange(0, str.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/**
 * Share content via the native share sheet when available; otherwise fall back
 * to copyText so LAN/http users still get a usable result.
 * AbortError means the user cancelled — we do not fall through to copy.
 */
export async function shareOrCopy({ title, text }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text })
      return 'shared'
    } catch (e) {
      if (e && e.name === 'AbortError') return 'aborted'
    }
  }

  const ok = await copyText(text)
  return ok ? 'copied' : 'failed'
}
