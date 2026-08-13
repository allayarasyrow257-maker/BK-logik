import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import CarCard from '../components/CarCard'
import carsData from '../../public/cars.json'

export default function Home() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [filterMake, setFilterMake] = useState('all')
  const [filterYear, setFilterYear] = useState('all')

  const makes = useMemo(() => {
    const set = new Set(carsData.map((c) => c.make).filter(Boolean))
    return ['all', ...Array.from(set).sort()]
  }, [])

  const years = useMemo(() => {
    const set = new Set(carsData.map((c) => String(c.year)).filter(Boolean))
    return ['all', ...Array.from(set).sort((a, b) => b - a)]
  }, [])

  const filtered = useMemo(() => {
    return carsData.filter((car) => {
      const q = search.toLowerCase()
      const matchSearch =
        !q ||
        car.make?.toLowerCase().includes(q) ||
        car.model?.toLowerCase().includes(q) ||
        car.title?.toLowerCase().includes(q) ||
        car.vin?.toLowerCase().includes(q)
      const matchMake = filterMake === 'all' || car.make === filterMake
      const matchYear = filterYear === 'all' || String(car.year) === filterYear
      return matchSearch && matchMake && matchYear
    })
  }, [search, filterMake, filterYear])

  return (
    <>
      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
        {/* Background */}
        <div className="absolute inset-0 bg-dark-900">
          <div className="absolute inset-0 bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900" />
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gold-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-gold-500/3 rounded-full blur-3xl pointer-events-none" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-24">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-gold-500/10 border border-gold-500/20 text-gold-400 text-sm font-medium px-4 py-2 rounded-full mb-8">
            <div className="w-1.5 h-1.5 bg-gold-400 rounded-full animate-pulse" />
            {t('hero.badge')}
          </div>

          {/* Title */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-black text-white leading-tight mb-6">
            {t('hero.title')}
            <br />
            <span className="text-gold-gradient">{t('hero.titleAccent')}</span>
          </h1>

          <p className="text-gray-400 text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            {t('hero.subtitle')}
          </p>

          <a
            href="#catalog"
            className="inline-flex items-center gap-2 gold-gradient text-black font-bold px-8 py-4 rounded-xl text-base hover:opacity-90 transition-opacity shadow-lg shadow-gold-500/20"
          >
            {t('hero.cta')}
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </a>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-6 max-w-lg mx-auto mt-16">
            <Stat value={carsData.length} label={t('stats.cars')} />
            <Stat value="45" label={t('stats.delivery')} />
            <Stat value="5+" label={t('stats.years')} />
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-gray-600">
          <div className="w-px h-12 bg-gradient-to-b from-transparent to-gray-600" />
          <div className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce" />
        </div>
      </section>

      {/* Catalog */}
      <section id="catalog" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="mb-10">
          <h2 className="text-3xl font-bold text-white mb-2">{t('catalog.title')}</h2>
          <p className="text-gray-500">{filtered.length} {t('catalog.results')}</p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          {/* Search */}
          <div className="relative flex-1">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={t('catalog.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-dark-800 border border-white/10 text-white placeholder-gray-500 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-gold-500/50 transition-colors"
            />
          </div>

          {/* Make filter */}
          <select
            value={filterMake}
            onChange={(e) => setFilterMake(e.target.value)}
            className="bg-dark-800 border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gold-500/50 transition-colors min-w-[140px]"
          >
            {makes.map((m) => (
              <option key={m} value={m} className="bg-dark-800">
                {m === 'all' ? t('catalog.all') + ' Makes' : m}
              </option>
            ))}
          </select>

          {/* Year filter */}
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="bg-dark-800 border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gold-500/50 transition-colors min-w-[130px]"
          >
            {years.map((y) => (
              <option key={y} value={y} className="bg-dark-800">
                {y === 'all' ? t('catalog.all') + ' Years' : y}
              </option>
            ))}
          </select>
        </div>

        {/* Grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map((car) => (
              <CarCard key={car.id} car={car} />
            ))}
          </div>
        ) : (
          <div className="text-center py-24">
            <div className="text-5xl mb-4">🔍</div>
            <h3 className="text-white font-semibold text-xl mb-2">{t('catalog.noResults')}</h3>
            <p className="text-gray-500">{t('catalog.noResultsSub')}</p>
          </div>
        )}
      </section>
    </>
  )
}

function Stat({ value, label }) {
  return (
    <div className="text-center">
      <div className="text-3xl font-black text-gold-400">{value}</div>
      <div className="text-gray-500 text-xs mt-1 leading-tight">{label}</div>
    </div>
  )
}
