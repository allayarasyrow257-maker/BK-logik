import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../api'
import { useAuth } from '../../context/AuthContext'
import CopyField from '../../components/CopyField'
import CarForm from '../../components/CarForm'
import Lightbox from '../../components/Lightbox'
import { copyText, shareOrCopy } from '../../utils/clipboard'
import DownloadMenu from '../../components/DownloadMenu'
import { thumb } from '../../utils/img'
import { purgeCarImages } from '../../utils/imageCache'

export default function Cars() {
  const { t } = useTranslation()
  const { user, isDealer } = useAuth()
  const [settings, setSettings] = useState({})
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [selectedCar, setSelectedCar] = useState(null)
  const [formCar, setFormCar] = useState(null)
  const [formOpen, setFormOpen] = useState(false)

  const load = () => {
    setLoading(true)
    api.getCars()
      .then((data) => { setCars(data); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(() => { load(); api.getSettings().then(setSettings).catch(() => {}) }, [])

  const canAdd = user?.role === 'dealer' || (user?.role === 'bkadmin' && settings.bkadmin_add_enabled)

  const openAdd = () => { setFormCar(null); setFormOpen(true) }
  const openEdit = (car) => { setSelectedCar(null); setFormCar(car); setFormOpen(true) }
  const onSaved = () => { setFormOpen(false); load() }
  const handleDelete = async (car) => {
    if (!window.confirm(t('admin.deleteCarConfirm'))) return
    try { await api.deleteCar(car.id) } catch (e) {}
    purgeCarImages(car.id)
    setSelectedCar(null); load()
  }

  const statuses = useMemo(() => {
    const set = new Set(cars.map((c) => c.status).filter(Boolean))
    return ['all', ...Array.from(set).sort()]
  }, [cars])

  const filtered = useMemo(() => {
    return cars.filter((car) => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        car.title?.toLowerCase().includes(q) ||
        car.vin?.toLowerCase().includes(q) ||
        car.make?.toLowerCase().includes(q)
      const matchStatus = filterStatus === 'all' || car.status === filterStatus
      return matchSearch && matchStatus
    })
  }, [cars, search, filterStatus])

  // ── Field selection across the list (dealer only) ──
  const [selected, setSelected] = useState(() => new Set())
  const [copyToast, setCopyToast] = useState(false)
  const pingToast = () => { setCopyToast(true); setTimeout(() => setCopyToast(false), 1500) }

  const SEL_FIELDS = useMemo(() => ([
    { key: 'vin', label: t('card.vin'), get: (c) => c.vin, mono: true },
    { key: 'lot', label: t('admin.lot'), get: (c) => c.lot_number, mono: true },
    { key: 'container', label: t('card.container'), get: (c) => c.container, mono: true },
    { key: 'location', label: t('card.location'), get: (c) => c.auction_city },
  ]), [t])

  const toggleField = (carId, key) => {
    setSelected((prev) => {
      const n = new Set(prev)
      const id = `${carId}::${key}`
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }
  const clearSel = () => setSelected(new Set())
  const copyOne = async (text) => { const ok = await copyText(text); if (ok) pingToast() }

  const buildSelText = () => {
    const out = []
    filtered.forEach((car) => {
      const picked = SEL_FIELDS.filter((f) => selected.has(`${car.id}::${f.key}`) && f.get(car))
      if (!picked.length) return
      out.push(car.title)
      picked.forEach((f) => out.push(`${f.label}: ${f.get(car)}`))
      out.push('')
    })
    return out.join('\n').trim()
  }
  const copySel = async () => { const ok = await copyText(buildSelText()); if (ok) pingToast() }
  const shareSel = async () => { const r = await shareOrCopy({ title: 'BK Logic', text: buildSelText() }); if (r === 'copied') pingToast() }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white">{t('admin.cars')}</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {filtered.length} / {cars.length} {t('admin.carsShown')}
        </p>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-2 mb-5">
        {/* Search: full width on mobile, flexes on sm+ */}
        <div className="relative w-full sm:flex-1 min-w-0">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            placeholder={t('admin.searchCars')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-dark-800 border border-white/10 text-white placeholder-gray-600 rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:border-gold-500/50 touch-manipulation"
            style={{ touchAction: 'manipulation' }}
          />
        </div>
        {/* Second row on mobile: status select + add button share the width */}
        <div className="flex gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="flex-1 sm:flex-none bg-dark-800 border border-white/10 text-white rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-gold-500/50 sm:min-w-[120px] cursor-pointer"
          >
            {statuses.map((s) => (
              <option key={s} value={s} className="bg-dark-800">
                {s === 'all' ? t('catalog.all') : s}
              </option>
            ))}
          </select>
          {canAdd && (
            <button onClick={openAdd} className="shrink-0 bg-gold-500 hover:bg-gold-400 text-dark-900 font-semibold rounded-xl px-4 py-3 text-sm cursor-pointer whitespace-nowrap">
              + {t('admin.addCar')}
            </button>
          )}
        </div>
      </div>

      {/* ── Car list (responsive selectable cards) ── */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500 text-sm">{t('catalog.noResults')}</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((car) => (
            <CarCard
              key={car.id}
              car={car}
              onOpen={() => setSelectedCar(car)}
              selectable={isDealer}
              selFields={SEL_FIELDS}
              selected={selected}
              onToggle={toggleField}
              onCopyOne={copyOne}
            />
          ))}
        </div>
      )}
      {isDealer && selected.size > 0 && <div className="h-24" />}

      {selectedCar && (
        <CarModal car={selectedCar} onClose={() => setSelectedCar(null)} t={t} onEdit={openEdit} onDelete={handleDelete} selectable={isDealer} />
      )}

      {formOpen && (
        <CarForm car={formCar} onClose={() => setFormOpen(false)} onSaved={onSaved} />
      )}

      {/* Floating selection action bar (dealer only) */}
      {isDealer && selected.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 px-3 pointer-events-none">
          <div className="mx-auto max-w-2xl mb-3 bg-dark-800/95 backdrop-blur border border-white/10 rounded-2xl shadow-xl px-3 py-2.5 flex items-center gap-2 pointer-events-auto">
            <span className="text-white text-xs font-semibold whitespace-nowrap">{selected.size}<span className="text-gray-400 font-normal"> {t('common.selected')}</span></span>
            <div className="flex-1" />
            <button onClick={clearSel} aria-label={t('common.clear')} title={t('common.clear')} className="shrink-0 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <button onClick={copySel} aria-label={t('common.copy')} title={t('common.copy')} className="shrink-0 inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/15 text-white text-xs font-medium h-8 px-2.5 rounded-lg cursor-pointer">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              <span className="hidden sm:inline">{t('common.copy')}</span>
            </button>
            <button onClick={shareSel} aria-label={t('common.share')} title={t('common.share')} className="shrink-0 inline-flex items-center gap-1.5 bg-gold-500 hover:bg-gold-400 text-dark-900 text-xs font-semibold h-8 px-2.5 rounded-lg cursor-pointer">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
              <span className="hidden sm:inline">{t('common.share')}</span>
            </button>
          </div>
        </div>
      )}
      {copyToast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-50 bg-black/90 text-green-400 text-xs font-semibold px-3 py-1.5 rounded-lg pointer-events-none">{t('common.copied')}</div>
      )}
    </div>
  )
}

/* ── Car thumbnail helper ── */
function CarThumb({ car, size = 'md' }) {
  const imgSrc = car.local_images?.[0]
    ? `/images/${car.local_images[0].replace('images/', '')}`
    : car.cover || null

  const cls = size === 'sm'
    ? 'w-12 h-9 rounded-lg'
    : 'w-full h-full'

  if (imgSrc) {
    return (
      <img
        src={thumb(imgSrc, size === 'sm' ? 96 : 200)}
        alt={car.title}
        loading="lazy"
        decoding="async"
        className={`${cls} object-cover bg-dark-700`}
        onError={(e) => { e.target.style.display = 'none' }}
      />
    )
  }
  return (
    <div className={`${cls} bg-dark-700 flex items-center justify-center`}>
      <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01" />
      </svg>
    </div>
  )
}

/* ── Car list card (rich, selectable fields) ── */
function CarCard({ car, onOpen, selectable, selFields, selected, onToggle, onCopyOne }) {
  const photoCount = car.images?.length || 0

  return (
    <div className="bg-dark-800 border border-white/5 rounded-2xl overflow-hidden flex items-stretch">
      {/* Thumbnail opens the detail modal */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={car.title}
        className="shrink-0 relative cursor-pointer bg-dark-700"
        style={{ width: 108 }}
      >
        <CarThumb car={car} size="md" />
        {photoCount > 0 && (
          <div className="absolute bottom-1 right-1 bg-black/70 rounded px-1 py-0.5 flex items-center gap-0.5">
            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-white text-[10px] font-semibold leading-none">{photoCount}</span>
          </div>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0 p-3 flex flex-col gap-2">
        <button type="button" onClick={onOpen} className="text-left cursor-pointer">
          <div className="text-white font-semibold text-sm leading-snug line-clamp-2">{car.title}</div>
        </button>

        {/* Selectable fields: VIN / LOT / Container / Location */}
        <div className="flex flex-col gap-0.5">
          {selFields.map((f) => (
            <ListField
              key={f.key}
              label={f.label}
              value={f.get(car)}
              mono={f.mono}
              selectable={selectable}
              isSelected={selected.has(`${car.id}::${f.key}`)}
              selectionActive={selected.size > 0}
              onToggle={() => onToggle(car.id, f.key)}
              onCopyOne={() => onCopyOne(String(f.get(car)))}
            />
          ))}
        </div>

        {/* Status + price */}
        <div className="flex items-center justify-between gap-2 flex-wrap mt-0.5">
          <StatusBadge status={car.status} />
          {car.car_price != null && (
            <span className="text-gold-400 font-bold text-sm tabular-nums">${car.car_price.toLocaleString()}</span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Selectable list field: double-click selects · long-press copies ── */
function ListField({ label, value, mono, selectable, isSelected, selectionActive, onToggle, onCopyOne }) {
  const has = value != null && value !== ''
  const timerRef = useRef(null)
  const firedRef = useRef(false)

  const startPress = () => {
    if (!has || !selectable) return
    firedRef.current = false
    timerRef.current = setTimeout(() => { firedRef.current = true; onCopyOne() }, 500)
  }
  const cancelPress = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null } }
  const handleClick = (e) => {
    if (!selectable) return
    e.stopPropagation()
    if (!has || firedRef.current) return
    if (selectionActive) onToggle()
  }
  const handleDouble = (e) => {
    if (!selectable) return
    e.stopPropagation()
    if (!has || selectionActive) return
    onToggle()
  }

  return (
    <div
      onMouseDown={startPress}
      onMouseUp={cancelPress}
      onMouseLeave={cancelPress}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onTouchCancel={cancelPress}
      onClick={handleClick}
      onDoubleClick={handleDouble}
      className={`flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors ${selectable && has ? 'cursor-pointer' : ''} ${
        isSelected
          ? 'bg-gold-500/15 ring-1 ring-gold-400/50'
          : (selectionActive && selectable && has ? 'hover:bg-white/5' : '')
      }`}
      style={selectable ? { WebkitUserSelect: 'none', userSelect: 'none' } : undefined}
    >
      <span className="text-gray-500 text-[10px] font-semibold uppercase tracking-wide w-[70px] shrink-0">{label}</span>
      <span className={`text-white text-xs leading-snug truncate min-w-0 ${mono ? 'font-mono' : ''}`}>
        {has ? value : <span className="text-gray-600">—</span>}
      </span>
      {isSelected && (
        <svg className="w-3 h-3 text-gold-400 ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      )}
    </div>
  )
}

/* ── Status badge ── */
function StatusBadge({ status }) {
  const { t } = useTranslation()
  let color = 'bg-gray-500/10 text-gray-400'
  const s = status?.toLowerCase() || ''
  if (s.includes('arrived') || s.includes('delivered')) color = 'bg-green-500/15 text-green-400'
  else if (s.includes('loaded') || s.includes('container')) color = 'bg-blue-500/15 text-blue-400'
  else if (s.includes('transit') || s.includes('shipping')) color = 'bg-yellow-500/15 text-yellow-400'
  else if (s.includes('not') || s.includes('warehouse')) color = 'bg-orange-500/15 text-orange-400'
  else if (s.includes('reserved')) color = 'bg-purple-500/15 text-purple-400'

  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-lg leading-none ${color}`}>
      {status || t('admin.unknown')}
    </span>
  )
}

/* ── Car detail modal ── */
function CarModal({ car, onClose, t, onEdit, onDelete, selectable = false }) {
  const [shareCopied, setShareCopied] = useState(false)
  const [selected, setSelected] = useState([])

  const showToast = () => { setShareCopied(true); setTimeout(() => setShareCopied(false), 2000) }

  const doShare = async () => {
    const summary = `${car.title}\nVIN: ${car.vin || '-'}\nLOT: ${car.lot_number || '-'}\nContainer: ${car.container || '-'}`
    const res = await shareOrCopy({ title: car.title, text: summary })
    if (res === 'copied') showToast()
  }

  // Data-driven detail fields (shared by plain + selectable renderers)
  const fields = [
    { key: 'vin', label: t('card.vin'), value: car.vin, mono: true, always: true },
    { key: 'lot', label: t('admin.lot'), value: car.lot_number, mono: true, always: true },
    { key: 'year', label: t('card.year'), value: car.year, always: true },
    { key: 'color', label: t('card.color'), value: car.color, always: true },
    { key: 'make', label: t('admin.make'), value: car.make, always: true },
    { key: 'model', label: t('admin.model'), value: car.model, always: true },
    { key: 'price', label: t('admin.price'), value: car.car_price ? `$${car.car_price.toLocaleString()}` : null, always: true },
    { key: 'transport', label: t('admin.transport'), value: car.transport_price ? `$${car.transport_price.toLocaleString()}` : null, always: true },
    { key: 'status', label: t('admin.status'), value: car.status, always: true },
    { key: 'auctionCity', label: t('admin.auctionCity'), value: car.auction_city, always: true },
    { key: 'container', label: t('card.container'), value: car.container, mono: true, always: true },
    { key: 'shipping', label: t('card.shipping'), value: car.shipping_line, always: true },
    { key: 'arrival', label: t('card.arrival'), value: car.arrival_date, always: true },
    { key: 'keyStatus', label: t('admin.keyStatus'), value: car.key_status },
    { key: 'purchaseDate', label: t('admin.purchaseDate'), value: car.purchase_date },
    { key: 'warehouseDate', label: t('admin.warehouseDate'), value: car.warehouse_date },
    { key: 'bookingCode', label: t('admin.bookingCode'), value: car.booking_code },
    { key: 'pickupDate', label: t('admin.pickupDate'), value: car.pickup_date },
    { key: 'loadingDate', label: t('admin.loadingDate'), value: car.loading_date },
    { key: 'dispatchDate', label: t('admin.dispatchDate'), value: car.dispatch_date },
  ]
  const visibleFields = fields.filter((f) => f.always || (f.value != null && f.value !== ''))

  const toggleSelect = (key) => {
    setSelected((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key])
  }
  const clearSelection = () => setSelected([])

  const selectedText = () => visibleFields
    .filter((f) => selected.includes(f.key))
    .map((f) => `${f.label}: ${f.value}`)
    .join('\n')

  const copySelected = async () => {
    const ok = await copyText(selectedText())
    if (ok) showToast()
  }
  const shareSelected = async () => {
    const res = await shareOrCopy({ title: car.title, text: selectedText() })
    if (res === 'copied') showToast()
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-dark-800 border border-white/10 rounded-t-3xl sm:rounded-2xl w-full max-w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle — mobile only */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-white/5 shrink-0">
          <h2 className="text-white font-bold text-base sm:text-lg leading-snug pr-4 line-clamp-2">{car.title}</h2>
          <div className="flex items-center gap-1 shrink-0">
            <div className="relative">
             
              {shareCopied && (
                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-green-400 bg-dark-900 px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none">
                  {t('common.copied')}
                </span>
              )}
            </div>
            <button onClick={() => onEdit && onEdit(car)} aria-label={t('admin.editCar')} title={t('admin.editCar')} className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gold-400 hover:bg-white/10 rounded-xl cursor-pointer">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            </button>
            <button onClick={() => onDelete && onDelete(car)} aria-label={t('admin.deleteCar')} title={t('admin.deleteCar')} className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-red-400 hover:bg-white/10 rounded-xl cursor-pointer">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
            <button onClick={onClose} aria-label={t('common.close')} className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Selection action bar (dealer only) */}
        {selectable && selected.length > 0 && (
          <div className="shrink-0 border-b border-white/10 bg-dark-900/95 px-3 py-2 flex items-center gap-2">
            <span className="text-white text-xs font-semibold whitespace-nowrap">
              {selected.length}<span className="text-gray-400 font-normal"> {t('common.selected')}</span>
            </span>
            <div className="flex-1" />
            <button onClick={clearSelection} aria-label={t('common.clear')} title={t('common.clear')} className="shrink-0 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <button onClick={copySelected} aria-label={t('common.copy')} title={t('common.copy')} className="shrink-0 inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/15 text-white text-xs font-medium h-8 px-2.5 rounded-lg cursor-pointer">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              <span className="hidden sm:inline">{t('common.copy')}</span>
            </button>
            <button onClick={shareSelected} aria-label={t('common.share')} title={t('common.share')} className="shrink-0 inline-flex items-center gap-1.5 bg-gold-500 hover:bg-gold-400 text-dark-900 text-xs font-semibold h-8 px-2.5 rounded-lg cursor-pointer">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
              <span className="hidden sm:inline">{t('common.share')}</span>
            </button>
          </div>
        )}

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1">
          {/* Gallery */}
          {(car.cover || car.local_images?.length > 0 || car.images?.length > 0) && (
            <ModalGallery car={car} />
          )}

          {/* Details grid */}
          <div className="p-4 sm:p-6 space-y-5">
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              {visibleFields.map((f) => (
                <DetailCell
                  key={f.key}
                  field={f}
                  selectable={selectable}
                  isSelected={selected.includes(f.key)}
                  selectionActive={selected.length > 0}
                  onToggle={toggleSelect}
                  onCopyOne={async (v) => { const ok = await copyText(v); if (ok) showToast() }}
                />
              ))}
            </div>

            {/* Assigned customers */}
            {car.assigned_customers?.length > 0 && (
              <div className="border-t border-white/5 pt-4">
                <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
                  {t('admin.assignedTo')}
                </h3>
                <div className="space-y-2">
                  {car.assigned_customers.map((c) => (
                    <div key={c.assignment_id} className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-gold-500/10 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-gold-400 text-xs font-bold">{c.name?.[0]?.toUpperCase()}</span>
                      </div>
                      <div>
                        <div className="text-white text-sm">{c.name}</div>
                        {c.phone && <div className="text-gray-500 text-xs">{c.phone}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Photo count */}
            <div className="flex items-center gap-1.5 text-gray-600 text-xs pt-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {car.images?.length || 0} {t('admin.photos')} · {car.local_images?.length || 0} {t('admin.downloaded')}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Modal image gallery ── */
function ModalGallery({ car }) {
  const { t } = useTranslation()
  const [active, setActive] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  // Raw full-res URLs → downloads; thumbnailed → on-screen display (fast).
  const originals = car.local_images?.length > 0
    ? car.local_images.map((p) => `/images/${p.replace('images/', '')}`)
    : car.images || []
  const images = originals.map((u) => thumb(u, 1000))

  useEffect(() => {
    if (!images.length) return
    ;[active - 1, active + 1].forEach((d) => {
      const j = (d + images.length) % images.length
      const im = new Image()
      im.src = images[j]
    })
  }, [active, images.length])

  if (!images.length) return null

  const prev = () => setActive((a) => (a === 0 ? images.length - 1 : a - 1))
  const next = () => setActive((a) => (a === images.length - 1 ? 0 : a + 1))

  return (
    <div className="shrink-0">
      {/* Main image */}
      <div className="relative bg-dark-700" style={{ aspectRatio: '16/9' }}>
        <img
          src={images[active]}
          alt=""
          loading="eager"
          fetchpriority="high"
          decoding="async"
          className="w-full h-full object-cover cursor-pointer"
          onClick={() => setLightbox(true)}
        />
        <DownloadMenu
          images={originals}
          active={active}
          filenameBase={car.vin || car.slug || 'car'}
          t={t}
        />

        {images.length > 1 && (
          <>
            {/* Prev */}
            <button
              onClick={prev}
              aria-label={t('common.prevPhoto')}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/60 rounded-full flex items-center justify-center text-white cursor-pointer"
              style={{ touchAction: 'manipulation' }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            {/* Next */}
            <button
              onClick={next}
              aria-label={t('common.nextPhoto')}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/60 rounded-full flex items-center justify-center text-white cursor-pointer"
              style={{ touchAction: 'manipulation' }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}

        {/* Counter badge */}
        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs font-medium px-2.5 py-1 rounded-lg">
          {active + 1} / {images.length}
        </div>
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex gap-1.5 px-2 py-2 bg-dark-900/80 overflow-x-auto scrollbar-hide">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              aria-label={`${t('common.photo')} ${i + 1}`}
              className={`shrink-0 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                active === i
                  ? 'border-gold-400 opacity-100'
                  : 'border-transparent opacity-50 hover:opacity-80 active:opacity-100'
              }`}
              style={{ width: 52, height: 40, touchAction: 'manipulation' }}
            >
              <img src={thumb(img, 120)} alt="" loading="lazy" decoding="async" width={52} height={40} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {lightbox && (
        <Lightbox
          images={images}
          index={active}
          onIndexChange={setActive}
          onClose={() => setLightbox(false)}
        />
      )}
    </div>
  )
}

/* ── Detail field ── */
function Detail({ label, value, mono }) {
  return (
    <div>
      <div className="text-gray-500 text-[11px] font-medium uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-white text-sm leading-snug ${mono ? 'font-mono text-xs break-all' : ''}`}>
        {value || <span className="text-gray-600">—</span>}
      </div>
    </div>
  )
}


/* ── Detail cell: routes to plain (bkadmin) or selectable (dealer) rendering ── */
function DetailCell({ field, selectable, isSelected, selectionActive, onToggle, onCopyOne }) {
  const { label, value, mono } = field
  const has = value != null && value !== ''

  // Non-selectable (bkadmin) — preserve original behavior exactly
  if (!selectable) {
    return (
      <Detail
        label={label}
        value={has ? (mono ? <CopyField value={value} mono /> : value) : null}
      />
    )
  }

  return (
    <SelectableDetail
      label={label}
      value={value}
      mono={mono}
      has={has}
      isSelected={isSelected}
      selectionActive={selectionActive}
      onToggle={() => onToggle(field.key)}
      onCopyOne={() => onCopyOne(String(value))}
    />
  )
}

/* ── Selectable detail (dealer only): double-click selects · long-press copies ── */
function SelectableDetail({ label, value, mono, has, isSelected, selectionActive, onToggle, onCopyOne }) {
  const timerRef = useRef(null)
  const firedRef = useRef(false)

  const startPress = () => {
    if (!has) return
    firedRef.current = false
    timerRef.current = setTimeout(() => { firedRef.current = true; onCopyOne() }, 500)
  }
  const cancelPress = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }
  const handleClick = () => {
    if (!has || firedRef.current) return
    if (selectionActive) onToggle()          // once in selection mode, a tap toggles
  }
  const handleDouble = () => {
    if (!has || selectionActive) return
    onToggle()                                // double-click enters selection mode
  }

  return (
    <div
      onMouseDown={startPress}
      onMouseUp={cancelPress}
      onMouseLeave={cancelPress}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onTouchCancel={cancelPress}
      onClick={handleClick}
      onDoubleClick={handleDouble}
      title={label}
      className={`rounded-lg -mx-1.5 px-1.5 py-1 transition-colors ${has ? 'cursor-pointer' : ''} ${
        isSelected
          ? 'bg-gold-500/15 ring-1 ring-gold-400/60'
          : (selectionActive && has ? 'hover:bg-white/5' : '')
      }`}
      style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
    >
      <div className="text-gray-500 text-[11px] font-medium uppercase tracking-wide mb-1 flex items-center gap-1">
        {label}
        {isSelected && (
          <svg className="w-3 h-3 text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <div className={`text-white text-sm leading-snug ${mono ? 'font-mono text-xs break-all' : ''}`}>
        {has ? value : <span className="text-gray-600">—</span>}
      </div>
    </div>
  )
}
