import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const LANGS = ['en', 'ru', 'ka']
const LANG_LABELS = { en: 'EN', ru: 'RU', ka: 'GE' }

export default function Navbar() {
  const { t, i18n } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  const changeLang = (lng) => {
    i18n.changeLanguage(lng)
    localStorage.setItem('bklogic_lang', lng)
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-dark-900/95 backdrop-blur-md border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group" aria-label="BK Logistics Home">
            <img
              src="/LOGO_inner.png"
              alt="BK Logistics"
              className="h-9 w-auto object-contain"
              loading="eager"
              decoding="sync"
            />
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            <Link
              to="/"
              className={`text-sm font-medium transition-colors ${
                location.pathname === '/' ? 'text-gold-400' : 'text-gray-400 hover:text-white'
              }`}
            >
              {t('nav.catalog')}
            </Link>

            {/* Language switcher */}
            <div className="flex items-center gap-1 bg-dark-700 rounded-lg p-1">
              {LANGS.map((lng) => (
                <button
                  key={lng}
                  onClick={() => changeLang(lng)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    i18n.language === lng
                      ? 'gold-gradient text-black'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {LANG_LABELS[lng]}
                </button>
              ))}
            </div>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2 text-gray-400 hover:text-white"
          >
            <div className="w-6 h-0.5 bg-current mb-1.5 transition-all" />
            <div className="w-6 h-0.5 bg-current mb-1.5" />
            <div className="w-6 h-0.5 bg-current" />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-dark-800 border-t border-white/5 px-4 py-4 space-y-4">
          <Link
            to="/"
            onClick={() => setMenuOpen(false)}
            className="block text-sm font-medium text-gray-300 hover:text-white"
          >
            {t('nav.catalog')}
          </Link>
          <div className="flex gap-2">
            {LANGS.map((lng) => (
              <button
                key={lng}
                onClick={() => { changeLang(lng); setMenuOpen(false) }}
                className={`px-3 py-1 text-xs font-semibold rounded-md ${
                  i18n.language === lng ? 'gold-gradient text-black' : 'text-gray-400 bg-dark-700'
                }`}
              >
                {LANG_LABELS[lng]}
              </button>
            ))}
          </div>
        </div>
      )}
    </nav>
  )
}
