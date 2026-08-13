import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import LangSwitch from '../components/LangSwitch'
import CarInfoCard from '../components/CarInfoCard'
import StatusFilter from '../components/StatusFilter'
import { reconcileCache } from '../utils/imageCache'
import { carBucket } from '../utils/carStatus'

export default function MyCars() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    api.getCars()
      .then((data) => { setCars(data); setLoading(false); reconcileCache(data.map((x) => x.id)) })
      .catch(() => setLoading(false))
  }, [])

  const handleLogout = () => { logout(); navigate('/login') }

  const filtered = useMemo(
    () => (filter === 'all' ? cars : cars.filter((c) => carBucket(c.status) === filter)),
    [cars, filter]
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-dark-900 pb-20">
      {/* Header */}
      <header className="bg-dark-800 border-b border-white/5 sticky top-0 z-30" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-5xl mx-auto px-4 py-3 sm:py-4 flex items-center justify-between">
          <img src="/LOGO_inner.png" alt="BK Logistics" className="h-8 w-auto object-contain" loading="eager" decoding="sync" />
          <div className="flex items-center gap-4">
            <span className="text-gray-400 text-sm hidden sm:inline">{user?.name}</span>
            <LangSwitch />
            <button onClick={handleLogout} className="text-gray-500 hover:text-red-400 text-xs cursor-pointer">
              {t('admin.logout')}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">{t('customer.myCars')}</h1>
        <p className="text-gray-500 text-sm mb-6">{t('customer.subtitle')}</p>

        {cars.length === 0 ? (
          <div className="text-center py-16 sm:py-20">
            <svg className="w-14 h-14 sm:w-16 sm:h-16 text-gray-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 17h.01M16 17h.01M3 11l1.5-5A2 2 0 016.4 4h11.2a2 2 0 011.9 1.4L21 11M3 11v6a1 1 0 001 1h1m16-7v6a1 1 0 01-1 1h-1M3 11h18" />
            </svg>
            <h3 className="text-white text-lg font-semibold mb-2">{t('customer.noCars')}</h3>
            <p className="text-gray-500">{t('customer.noCarsDesc')}</p>
          </div>
        ) : (
          <>
            {/* Status dashboard */}
            <StatusFilter cars={cars} active={filter} onChange={setFilter} />

            {filtered.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-sm">{t('common.noCarsInStatus')}</div>
            ) : (
              <div className="space-y-4 sm:space-y-6">
                {filtered.map((car) => (
                  <CarInfoCard key={car.id} car={car} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-dark-800 border-t border-white/5 z-40 flex" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <button className="flex-1 flex flex-col items-center gap-1 py-3 text-gold-400 text-[10px] font-medium">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 17h.01M16 17h.01M3 11l1.5-5A2 2 0 016.4 4h11.2a2 2 0 011.9 1.4L21 11M3 11v6a1 1 0 001 1h1m16-7v6a1 1 0 01-1 1h-1M3 11h18" />
          </svg>
          {t('customer.myCars')}
        </button>
        <button onClick={handleLogout} className="flex-1 flex flex-col items-center gap-1 py-3 text-gray-500 hover:text-red-400 text-[10px] font-medium cursor-pointer">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {t('admin.logout')}
        </button>
      </div>
    </div>
  )
}
