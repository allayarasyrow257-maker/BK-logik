import { useState } from 'react'
import { copyText } from '../utils/clipboard'
import { useParams, Link, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import carsData from '../../public/cars.json'

export default function CarDetail() {
  const { slug } = useParams()
  const { t } = useTranslation()
  const car = carsData.find((c) => c.slug === slug)

  if (!car) return <Navigate to="/" replace />

  return (
    <div className="pt-16 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Back */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-gold-400 transition-colors text-sm mb-8"
        >
          {t('detail.back')}
        </Link>

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl font-black text-white mb-2">{car.title}</h1>
        <p className="text-gray-500 text-sm mb-8">{car.year} · {car.color} · {car.make}</p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left: Gallery */}
          <div className="lg:col-span-2">
            <Gallery images={car.images} title={car.title} t={t} />
          </div>

          {/* Right: Info panels */}
          <div className="space-y-4">
            <InfoPanel title={t('detail.specs')}>
              <InfoRow label={t('card.year')} value={car.year} />
              <InfoRow label={t('card.color')} value={car.color} />
              <InfoRow label="Make" value={car.make} />
              <InfoRow label="Model" value={car.model} />
              {car.vin && <VinRow vin={car.vin} label={t('card.vin')} copied={t('card.copied')} />}
            </InfoPanel>

            <InfoPanel title={t('detail.shipping')}>
              {car.arrivalDate && <InfoRow label={t('card.arrival')} value={car.arrivalDate} accent />}
              {car.shippingLine && <InfoRow label={t('card.shipping')} value={car.shippingLine} />}
              {car.container && <InfoRow label={t('card.container')} value={car.container} mono />}
            </InfoPanel>
          </div>
        </div>
      </div>
    </div>
  )
}

function Gallery({ images, title, t }) {
  const [active, setActive] = useState(0)
  const [imgErr, setImgErr] = useState({})

  if (!images?.length) return null

  const prev = () => setActive((a) => (a === 0 ? images.length - 1 : a - 1))
  const next = () => setActive((a) => (a === images.length - 1 ? 0 : a + 1))

  return (
    <div>
      {/* Main image */}
      <div className="relative aspect-[16/10] min-h-[180px] bg-dark-700 rounded-2xl overflow-hidden mb-3 group">
        {!imgErr[active] ? (
          <img
            src={images[active]}
            alt={`${title} ${active + 1}`}
            onError={() => setImgErr((e) => ({ ...e, [active]: true }))}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-dark-500">
            <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
            </svg>
          </div>
        )}

        {/* Arrows */}
        <button onClick={prev} className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <button onClick={next} className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>

        {/* Counter */}
        <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-lg">
          {t('detail.photo')} {active + 1} {t('detail.of')} {images.length}
        </div>
      </div>

      {/* Thumbnails */}
      <div className="grid grid-cols-6 gap-1.5">
        {images.slice(0, 12).map((img, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${
              active === i ? 'border-gold-400' : 'border-transparent opacity-60 hover:opacity-100'
            }`}
          >
            <img src={img} alt="" className="w-full h-full object-cover" onError={() => {}} />
          </button>
        ))}
      </div>
      {images.length > 12 && (
        <p className="text-gray-500 text-xs mt-2 text-center">+{images.length - 12} more photos</p>
      )}
    </div>
  )
}

function InfoPanel({ title, children }) {
  return (
    <div className="bg-dark-800 border border-white/5 rounded-2xl p-5">
      <h3 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
        <span className="w-1 h-4 gold-gradient rounded-full inline-block" />
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function InfoRow({ label, value, accent, mono }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-gray-500 text-sm flex-shrink-0">{label}</span>
      <span className={`text-sm font-medium text-right ${accent ? 'text-gold-400' : 'text-white'} ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </span>
    </div>
  )
}

function VinRow({ vin, label, copied: copiedLabel }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await copyText(vin)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-gray-500 text-sm flex-shrink-0">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-white text-xs font-mono">{vin}</span>
        <button onClick={copy} className="text-gray-500 hover:text-gold-400 transition-colors">
          {copied ? (
            <svg className="w-3.5 h-3.5 text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
