import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { thumb } from '../utils/img'
import LazyImage from './LazyImage'
import { copyText } from '../utils/clipboard'

export default function CarCard({ car }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const copyVin = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    await copyText(car.vin)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Link to={`/car/${car.slug}`} className="block group">
      <div className="bg-dark-800 rounded-2xl overflow-hidden border border-white/5 card-hover hover:border-gold-500/30">

        {/* Image */}
        <div className="relative aspect-[16/10] min-h-[180px] overflow-hidden bg-dark-700">
          <LazyImage
            src={thumb(car.cover, 480)}
            alt={car.title}
            loading="lazy"
            carId={car.id}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          {/* Photos count badge */}
          {car.images?.length > 0 && (
            <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              </svg>
              {car.images.length}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-5">
          <h3 className="font-bold text-white text-lg leading-tight mb-3 group-hover:text-gold-400 transition-colors">
            {car.title}
          </h3>

          <div className="grid grid-cols-2 gap-2 mb-4">
            <Spec label={t('card.year')} value={car.year} />
            <Spec label={t('card.color')} value={car.color} />
            {car.arrivalDate && (
              <Spec label={t('card.arrival')} value={car.arrivalDate} className="col-span-2" />
            )}
          </div>

          {/* VIN */}
          {car.vin && (
            <div className="flex items-center justify-between bg-dark-700 rounded-lg px-3 py-2 mb-4">
              <div>
                <div className="text-gray-500 text-xs mb-0.5">{t('card.vin')}</div>
                <div className="text-gray-300 text-xs font-mono tracking-wider">{car.vin}</div>
              </div>
              <button
                onClick={copyVin}
                className="text-gray-400 hover:text-gold-400 transition-colors p-1 rounded"
                title={t('common.copyVin')}
              >
                {copied ? (
                  <svg className="w-4 h-4 text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">{car.shippingLine}</span>
            <span className="text-gold-400 text-sm font-semibold group-hover:translate-x-1 transition-transform">
              {t('card.viewDetails')} →
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

function Spec({ label, value, className = '' }) {
  return (
    <div className={`bg-dark-700/50 rounded-lg px-3 py-2 ${className}`}>
      <div className="text-gray-500 text-xs mb-0.5">{label}</div>
      <div className="text-white text-sm font-medium">{value || '—'}</div>
    </div>
  )
}
