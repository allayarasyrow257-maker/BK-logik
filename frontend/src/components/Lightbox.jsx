import { useEffect, useState, useRef } from 'react'
import { thumb } from '../utils/img'

export default function Lightbox({ src, alt, onClose, images, index = 0, onIndexChange }) {
  const list = images && images.length ? images : (src ? [src] : [])
  const clamp = (i) => (list.length ? Math.max(0, Math.min(i, list.length - 1)) : 0)
  const [active, setActive] = useState(() => clamp(index))
  const showNav = list.length > 1

  const go = (dir) => {
    if (!list.length) return
    setActive((prev) => {
      const next = (prev + dir + list.length) % list.length
      onIndexChange?.(next)
      return next
    })
  }

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [onClose, list.length])

  useEffect(() => {
    if (!list.length) return
    ;[active - 1, active + 1].forEach((d) => {
      const j = (d + list.length) % list.length
      const im = new Image()
      im.src = list[j]
    })
  }, [active, list.length])

  return (
    <div
      className="fixed inset-0 z-[100] bg-black flex items-center justify-center"
      onClick={onClose}
    >
      <ZoomableImage
        key={list[active]}
        src={list[active] || ''}
        alt={alt || ''}
        showNav={showNav}
        onClose={onClose}
        onPrev={() => go(-1)}
        onNext={() => go(1)}
      />

      {/* Close button — below the notch, large tap target */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose() }}
        className="absolute right-3 w-11 h-11 bg-black/70 rounded-full flex items-center justify-center text-white text-2xl font-bold cursor-pointer active:bg-black/90 z-20"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)', touchAction: 'manipulation' }}
        aria-label="Close"
      >
        ×
      </button>

      {showNav && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); go(-1) }}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/50 rounded-full flex items-center justify-center text-white cursor-pointer hover:bg-black/80 transition-colors z-20"
            style={{ touchAction: 'manipulation' }}
            aria-label="Previous photo"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M13 4L7 10L13 16" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); go(1) }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/50 rounded-full flex items-center justify-center text-white cursor-pointer hover:bg-black/80 transition-colors z-20"
            style={{ touchAction: 'manipulation' }}
            aria-label="Next photo"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M7 4L13 10L7 16" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </>
      )}

      {showNav && (
        <div
          className="absolute bottom-0 left-0 right-0 bg-black/40 z-20"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <div className="text-center text-white text-sm py-1 opacity-80 select-none">
            {active + 1} / {list.length}
          </div>
          <div className="flex gap-1.5 overflow-x-auto px-3 pb-3 justify-start items-center">
            {list.map((url, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setActive(i); onIndexChange?.(i) }}
                className="flex-shrink-0 rounded overflow-hidden focus:outline-none"
                aria-label={`Photo ${i + 1}`}
              >
                <img
                  src={thumb(url, 120)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  width={56}
                  height={44}
                  className={[
                    'w-14 h-11 object-cover rounded transition-opacity',
                    i === active ? 'border-2 border-gold-400 opacity-100' : 'border-2 border-transparent opacity-50 hover:opacity-100',
                  ].join(' ')}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Full-screen image with pinch-to-zoom, pan, and double-tap zoom.
 * When NOT zoomed: swipe down closes, horizontal swipe navigates.
 * When zoomed: one finger pans, pinch adjusts zoom.
 */
function ZoomableImage({ src, alt, showNav, onClose, onPrev, onNext }) {
  const [loaded, setLoaded] = useState(false)
  const [tf, setTf] = useState({ scale: 1, x: 0, y: 0 })
  const gesture = useRef(null)
  const lastTap = useRef(0)
  const imgRef = useRef(null)
  const animating = useRef(false)

  const MAX = 4

  const clampPan = (scale, x, y) => {
    const el = imgRef.current
    if (!el) return { x, y }
    const maxX = (el.clientWidth * (scale - 1)) / 2
    const maxY = (el.clientHeight * (scale - 1)) / 2
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    }
  }

  const twoFingerDist = (touches) =>
    Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)

  const onTouchStart = (e) => {
    animating.current = false
    if (e.touches.length === 2) {
      gesture.current = {
        mode: 'pinch',
        startDist: twoFingerDist(e.touches),
        startScale: tf.scale,
        startX: tf.x,
        startY: tf.y,
      }
      return
    }
    if (e.touches.length === 1) {
      const now = Date.now()
      if (now - lastTap.current < 300) {
        // double-tap → toggle zoom
        lastTap.current = 0
        animating.current = true
        setTf((prev) => (prev.scale > 1 ? { scale: 1, x: 0, y: 0 } : { scale: 2.5, x: 0, y: 0 }))
        gesture.current = null
        return
      }
      lastTap.current = now
      const t = e.touches[0]
      gesture.current = {
        mode: tf.scale > 1 ? 'pan' : 'swipe',
        startX: t.clientX,
        startY: t.clientY,
        baseX: tf.x,
        baseY: tf.y,
        axis: null,
        dx: 0,
        dy: 0,
        moved: false,
      }
    }
  }

  const onTouchMove = (e) => {
    const g = gesture.current
    if (!g) return
    if (g.mode === 'pinch' && e.touches.length === 2) {
      const scale = Math.max(1, Math.min(MAX, g.startScale * (twoFingerDist(e.touches) / g.startDist)))
      const p = clampPan(scale, g.startX, g.startY)
      setTf({ scale, x: p.x, y: p.y })
    } else if (g.mode === 'pan' && e.touches.length === 1) {
      const dx = e.touches[0].clientX - g.startX
      const dy = e.touches[0].clientY - g.startY
      const p = clampPan(tf.scale, g.baseX + dx, g.baseY + dy)
      setTf((prev) => ({ ...prev, x: p.x, y: p.y }))
    } else if (g.mode === 'swipe' && e.touches.length === 1) {
      const dx = e.touches[0].clientX - g.startX
      const dy = e.touches[0].clientY - g.startY
      if (!g.axis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) g.axis = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x'
      g.dx = dx; g.dy = dy; g.moved = true
      if (g.axis === 'y' && dy > 0) setTf((prev) => ({ ...prev, y: dy }))
    }
  }

  const onTouchEnd = () => {
    const g = gesture.current
    gesture.current = null
    if (!g) return
    animating.current = true
    if (g.mode === 'pinch') {
      setTf((prev) => (prev.scale <= 1.03 ? { scale: 1, x: 0, y: 0 } : prev))
      return
    }
    if (g.mode === 'swipe') {
      if (g.axis === 'y' && g.dy > 110) { onClose(); return }
      if (g.axis === 'x' && Math.abs(g.dx) > 45) { g.dx < 0 ? onNext() : onPrev(); return }
      setTf({ scale: 1, x: 0, y: 0 })
    }
    // pan → keep position
  }

  const dragY = tf.scale === 1 ? Math.max(tf.y, 0) : 0
  const bgFade = 1 - Math.min(dragY / 400, 1) * 0.7

  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ touchAction: 'none', backgroundColor: `rgba(0,0,0,${1 - bgFade})` }}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt || ''}
        draggable={false}
        onLoad={() => setLoaded(true)}
        fetchPriority="high"
        className={`max-w-full object-contain select-none ${loaded ? 'opacity-100' : 'opacity-0'}`}
        style={{
          maxHeight: showNav ? 'calc(100dvh - 120px)' : '100dvh',
          transform: `translate(${tf.x}px, ${tf.y}px) scale(${tf.scale})`,
          transition: animating.current ? 'transform 0.22s ease' : 'none',
          willChange: 'transform',
        }}
      />
    </div>
  )
}
