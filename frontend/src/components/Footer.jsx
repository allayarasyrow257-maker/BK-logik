import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

export default function Footer() {
  const { t } = useTranslation()
  return (
    <footer className="bg-dark-800 border-t border-white/5 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <Link to="/" className="flex items-center gap-3" aria-label="BK Logistics Home">
            <img
              src="/LOGO_inner.png"
              alt="BK Logistics"
              className="h-14 w-auto object-contain"
              loading="lazy"
              decoding="async"
            />
            <div className="text-gray-500 text-xs">{t('footer.tagline')}</div>
          </Link>
          <p className="text-gray-600 text-sm">{t('footer.copy')}</p>
        </div>
      </div>
    </footer>
  )
}
