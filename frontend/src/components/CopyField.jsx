import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { copyText } from '../utils/clipboard'

/**
 * Reusable value display that supports:
 *  - LONG-PRESS (~500ms, mouse or touch) → copies value to clipboard + shows a brief "copied" checkmark
 *  - DOUBLE-CLICK → selects the element's text so the user can manually copy/share
 * The text is user-selectable (CSS user-select: text).
 */
export default function CopyField({ value, mono = false, className = '' }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)
  const firedRef = useRef(false)
  const elRef = useRef(null)

  const doCopy = async () => {
    if (!value) return
    const ok = await copyText(String(value))
    if (ok) showCopied()
  }

  const showCopied = () => {
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const startPress = () => {
    if (!value) return
    firedRef.current = false
    timerRef.current = setTimeout(() => {
      firedRef.current = true
      doCopy()
    }, 500)
  }

  const cancelPress = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const selectText = () => {
    if (!elRef.current) return
    const sel = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(elRef.current)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  if (!value) {
    return <span className="text-gray-600">—</span>
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        ref={elRef}
        title={t('common.copyHint')}
        onMouseDown={startPress}
        onMouseUp={cancelPress}
        onMouseLeave={cancelPress}
        onTouchStart={startPress}
        onTouchEnd={cancelPress}
        onTouchCancel={cancelPress}
        onDoubleClick={selectText}
        onContextMenu={(e) => { if (firedRef.current) e.preventDefault() }}
        className={`select-text cursor-pointer ${mono ? 'font-mono' : ''} ${className}`}
        style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
      >
        {value}
      </span>
      {copied && (
        <span className="inline-flex items-center gap-0.5 text-gold-400 text-[10px] font-semibold">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          {t('common.copied')}
        </span>
      )}
    </span>
  )
}
