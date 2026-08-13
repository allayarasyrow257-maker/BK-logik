// Lightweight on-screen toast — works everywhere (unlike alert() in WKWebView).
export function toast(message, type = 'success', ms = 2200) {
  try {
    const bg = type === 'error' ? '#b91c1c' : type === 'info' ? '#334155' : '#15803d'
    const el = document.createElement('div')
    el.textContent = message
    el.style.cssText = [
      'position:fixed', 'left:50%',
      'bottom:calc(env(safe-area-inset-bottom, 0px) + 28px)',
      'transform:translateX(-50%)', 'z-index:2147483647',
      'padding:11px 18px', 'border-radius:14px', 'font-size:14px',
      'font-weight:600', 'color:#fff', 'max-width:88%', 'text-align:center',
      'box-shadow:0 10px 30px rgba(0,0,0,.45)', 'pointer-events:none',
      'opacity:0', 'transition:opacity .2s ease', `background:${bg}`,
    ].join(';')
    document.body.appendChild(el)
    requestAnimationFrame(() => { el.style.opacity = '1' })
    setTimeout(() => {
      el.style.opacity = '0'
      setTimeout(() => el.remove(), 250)
    }, ms)
  } catch { /* ignore */ }
}
