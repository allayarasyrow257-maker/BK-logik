import { useState } from 'react'

/**
 * Drop-in <img> replacement with a loading spinner and error fallback.
 * Parent must be `relative overflow-hidden`.
 *
 * Caching is handled by the browser/WebView HTTP cache (the backend sends
 * `Cache-Control: immutable` on /images and /api/thumb), which is far faster
 * than a JS blob cache — images render progressively and in parallel.
 * `carId` is accepted for API compatibility but no longer changes behaviour.
 */
export default function LazyImage({ src, alt, className = '', loading = 'lazy', width, height, onClick, style, decoding = 'async', fetchpriority }) {
  const [status, setStatus] = useState('loading')

  return (
    <>
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-dark-700">
          <div className="w-8 h-8 border-2 border-gold-400/20 border-t-gold-400 rounded-full animate-spin" />
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-dark-700">
          <svg className="w-12 h-12 text-dark-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      )}
      <img
        src={src}
        alt={alt || ''}
        loading={loading}
        decoding={decoding}
        width={width}
        height={height}
        style={style}
        onClick={onClick}
        fetchPriority={fetchpriority}
        className={`${className} transition-opacity duration-300 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
    </>
  )
}
