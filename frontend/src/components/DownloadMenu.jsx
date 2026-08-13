import { useState, useRef, useEffect } from 'react'
import { downloadImage, downloadImages } from '../utils/download'

export default function DownloadMenu({ images, active, filenameBase, downloadFn, t, position = 'top-2 right-2' }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return

    const handleMousedown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false)
      }
    }

    const handleKeydown = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handleMousedown)
    document.addEventListener('keydown', handleKeydown)

    return () => {
      document.removeEventListener('mousedown', handleMousedown)
      document.removeEventListener('keydown', handleKeydown)
    }
  }, [open])

  // downloadFn is an optional override; by default we use the shared,
  // iOS-aware util (native share sheet on iPhone, file download on desktop).
  const saveOne = downloadFn || downloadImage

  const downloadOne = async (i) => {
    setBusy(true)
    try {
      await saveOne(images[i], `${filenameBase}-${i + 1}.jpg`, t)
    } finally {
      setBusy(false)
    }
  }

  const downloadAll = async () => {
    setBusy(true)
    try {
      await downloadImages(images, filenameBase, t)
    } finally {
      setBusy(false)
    }
  }

  const handleButtonClick = (e) => {
    e.stopPropagation()
    if (images.length <= 1) {
      downloadOne(active)
      return
    }
    setOpen((prev) => !prev)
  }

  return (
    <div className={`absolute ${position} z-10`} ref={rootRef}>
      <button
        onClick={handleButtonClick}
        aria-label={t('common.download')}
        title={t('common.download')}
        className="bg-black/60 rounded-full w-9 h-9 flex items-center justify-center text-white cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      </button>

      {open && images.length > 1 && (
        <div className="absolute right-0 top-full mt-2 min-w-[168px] bg-dark-800 border border-white/10 rounded-xl shadow-xl overflow-hidden">
          <button
            onClick={(e) => {
              e.stopPropagation()
              downloadOne(active)
              setOpen(false)
            }}
            className={`w-full text-left px-3 py-2.5 text-sm text-white hover:bg-white/10 flex items-center gap-2 cursor-pointer${busy ? ' opacity-60 pointer-events-none' : ''}`}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {t('common.downloadThis')}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              downloadAll()
              setOpen(false)
            }}
            className={`w-full text-left px-3 py-2.5 text-sm text-white hover:bg-white/10 flex items-center gap-2 cursor-pointer border-t border-white/5${busy ? ' opacity-60 pointer-events-none' : ''}`}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7l8-4 8 4-8 4-8-4zm0 5l8 4 8-4M4 17l8 4 8-4" />
            </svg>
            {t('common.downloadAll')} · {images.length}
          </button>
        </div>
      )}
    </div>
  )
}
