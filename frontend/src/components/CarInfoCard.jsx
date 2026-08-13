import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import CopyField from './CopyField'
import Lightbox from './Lightbox'
import DownloadMenu from './DownloadMenu'
import LazyImage from './LazyImage'
import { thumb } from '../utils/img'
import { statusMeta } from '../utils/carStatus'

/** Rich car card — cover, specs, status/payment badges, expandable photo gallery.
 *  Shared by the customer "My Cars" page and the admin customer-detail sheet. */
export default function CarInfoCard({ car, showPayment = true }) {
  const { t } = useTranslation()
  const [showPhotos, setShowPhotos] = useState(false)

  return (
    <div className="bg-dark-800 border border-white/5 rounded-2xl overflow-hidden">
      {(car.cover || car.local_images?.length > 0) && (
        <div className="relative aspect-[16/9] sm:aspect-[21/9] bg-dark-700 overflow-hidden">
          <LazyImage
            src={thumb(car.local_images?.[0] ? `/images/${car.local_images[0].replace('images/', '')}` : car.cover, 640)}
            alt={car.title}
            loading="eager"
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="p-4 sm:p-6">
        <div className="flex items-start justify-between mb-4 gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-xl font-bold text-white truncate">{car.title}</h2>
            <p className="text-gray-500 text-sm">{car.year} &middot; {car.color} &middot; {car.make}</p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <StatusBadge status={car.status} t={t} />
            {showPayment && <PaymentBadge status={car.payment_status} t={t} />}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-5">
          <Spec label={t('card.vin')} value={car.vin ? <CopyField value={car.vin} mono /> : null} />
          <Spec label={t('card.container')} value={car.container ? <CopyField value={car.container} mono /> : null} />
          <Spec label={t('card.shipping')} value={car.shipping_line} />
          <Spec label={t('card.arrival')} value={car.arrival_date} accent />
        </div>

        {car.images?.length > 0 && (
          <button
            onClick={() => setShowPhotos((v) => !v)}
            className="text-gold-400 text-sm font-medium hover:text-gold-300 cursor-pointer"
          >
            {showPhotos ? t('customer.hidePhotos') : `${t('customer.showPhotos')} (${car.images.length})`}
          </button>
        )}

        {showPhotos && <div className="mt-4"><Gallery car={car} /></div>}
      </div>
    </div>
  )
}

function Gallery({ car }) {
  const { t } = useTranslation()
  const [active, setActive] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const originals = car.local_images?.length > 0
    ? car.local_images.map((p) => `/images/${p.replace('images/', '')}`)
    : (car.images || [])
  const images = originals.map((u) => thumb(u, 1000))

  if (!images.length) return null

  return (
    <div>
      <div className="relative aspect-[16/10] bg-dark-700 rounded-xl overflow-hidden mb-2 group">
        <LazyImage
          key={images[active]}
          src={images[active]}
          alt=""
          loading="eager"
          fetchpriority="high"
          className="w-full h-full object-cover cursor-pointer"
          onClick={() => setLightbox(true)}
        />
        <DownloadMenu images={originals} active={active} filenameBase={car.vin || car.slug || 'car'} t={t} />
        {images.length > 1 && (
          <>
            <button
              onClick={() => setActive((a) => (a === 0 ? images.length - 1 : a - 1))}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/60 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              style={{ touchAction: 'manipulation' }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button
              onClick={() => setActive((a) => (a === images.length - 1 ? 0 : a + 1))}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/60 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              style={{ touchAction: 'manipulation' }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </>
        )}
        <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-lg">
          {active + 1} / {images.length}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {images.map((img, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`shrink-0 w-14 h-11 rounded-lg overflow-hidden border-2 cursor-pointer ${active === i ? 'border-gold-400' : 'border-transparent opacity-60 hover:opacity-100'}`}
          >
            <img src={thumb(img, 120)} alt="" loading="lazy" decoding="async" width={56} height={44} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>

      {lightbox && (
        <Lightbox images={images} index={active} onIndexChange={setActive} onClose={() => setLightbox(false)} />
      )}
    </div>
  )
}

function Spec({ label, value, mono, accent }) {
  return (
    <div className="bg-dark-700/50 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3">
      <div className="text-gray-500 text-xs mb-1">{label}</div>
      <div className={`text-xs sm:text-sm font-medium ${accent ? 'text-gold-400' : 'text-white'} ${mono ? 'font-mono text-[10px] sm:text-xs' : ''} truncate`}>
        {value || '-'}
      </div>
    </div>
  )
}

function StatusBadge({ status, t }) {
  const meta = statusMeta(status)
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-xl ${meta.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {t(meta.labelKey)}
    </span>
  )
}

function PaymentBadge({ status, t }) {
  const isPaid = status === 'paid'
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-xl ${isPaid ? 'bg-green-500/10 text-green-400' : 'bg-orange-500/10 text-orange-400'}`}>
      {isPaid ? t('customer.paid') : t('customer.unpaid')}
    </span>
  )
}
