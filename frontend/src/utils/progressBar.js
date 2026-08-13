// Slim, non-blocking progress bar fixed to the top of the viewport — same
// plain-DOM approach as toast.js, so it works from anywhere (utils, event
// handlers) without lifting state into the component tree. It never
// intercepts clicks (pointer-events: none), so the user can keep browsing
// while a multi-photo download runs in the background.
let barEl = null
let fillEl = null
let hideTimer = null

function ensureEl() {
  if (barEl) return
  barEl = document.createElement('div')
  barEl.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'height:3px',
    'z-index:2147483647', 'background:rgba(255,255,255,.08)',
    'opacity:0', 'transition:opacity .2s ease', 'pointer-events:none',
  ].join(';')
  fillEl = document.createElement('div')
  fillEl.style.cssText = [
    'height:100%', 'width:0%', 'background:#facc15',
    'transition:width .25s ease', 'box-shadow:0 0 8px rgba(250,204,21,.6)',
  ].join(';')
  barEl.appendChild(fillEl)
  document.body.appendChild(barEl)
}

/** Show the bar and reset it to 0%. Safe to call multiple times (e.g. nested downloads). */
export function startProgress() {
  try {
    ensureEl()
    clearTimeout(hideTimer)
    fillEl.style.transition = 'none'
    fillEl.style.width = '0%'
    void fillEl.offsetWidth // force reflow so the next width change animates
    fillEl.style.transition = 'width .25s ease'
    barEl.style.opacity = '1'
  } catch { /* ignore */ }
}

/** Update fill to done/total (0–100%). */
export function updateProgress(done, total) {
  try {
    if (!barEl) ensureEl()
    const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
    fillEl.style.width = pct + '%'
  } catch { /* ignore */ }
}

/** Fill to 100% then fade out. */
export function finishProgress() {
  try {
    if (!barEl) return
    fillEl.style.width = '100%'
    hideTimer = setTimeout(() => {
      barEl.style.opacity = '0'
      setTimeout(() => { fillEl.style.width = '0%' }, 200)
    }, 300)
  } catch { /* ignore */ }
}
