import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'

// Alan grupları: [key, label-i18n-or-null, type]
const GROUPS = [
  ['identity', [
    ['title', null, 'text'], ['vin', null, 'text'], ['lot_number', 'admin.lot', 'text'],
    ['make', 'admin.make', 'text'], ['model', 'admin.model', 'text'],
    ['year', 'card.year', 'number'], ['color', 'card.color', 'text'],
  ]],
  ['pricing', [
    ['car_price', 'admin.price', 'number'], ['transport_price', 'admin.transport', 'number'],
    ['status', 'admin.status', 'text'], ['auction_city', 'admin.auctionCity', 'text'],
  ]],
  ['logistics', [
    ['container', 'card.container', 'text'], ['shipping_line', 'card.shipping', 'text'],
    ['key_status', 'admin.keyStatus', 'text'], ['booking_code', 'admin.bookingCode', 'text'],
  ]],
  ['dates', [
    ['purchase_date', 'admin.purchaseDate', 'text'], ['pickup_date', 'admin.pickupDate', 'text'],
    ['warehouse_date', 'admin.warehouseDate', 'text'], ['loading_date', 'admin.loadingDate', 'text'],
    ['dispatch_date', 'admin.dispatchDate', 'text'], ['arrival_date', 'card.arrival', 'text'],
  ]],
]

const LABELS = { title: 'Title', vin: 'VIN' }

export default function CarForm({ car, onClose, onSaved }) {
  const { t } = useTranslation()
  const editing = !!car
  const [form, setForm] = useState(() => {
    const f = {}
    GROUPS.forEach(([, fields]) => fields.forEach(([k]) => { f[k] = car?.[k] ?? '' }))
    return f
  })
  const [files, setFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title?.trim()) { setErr('Title required'); return }
    setSaving(true); setErr('')
    try {
      const payload = { ...form }
      ;['year', 'car_price', 'transport_price'].forEach((k) => {
        payload[k] = payload[k] === '' || payload[k] == null ? null : Number(payload[k])
      })
      const saved = editing ? await api.updateCar(car.id, payload) : await api.createCar(payload)
      if (files.length) await api.uploadCarImages(saved.id, files)
      onSaved()
    } catch (e2) {
      setErr(e2.message || 'Error')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-dark-800 border border-white/10 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
          <h2 className="text-white font-bold text-lg">{editing ? t('admin.editCar') : t('admin.addCar')}</h2>
          <button onClick={onClose} aria-label={t('common.close')} className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-xl cursor-pointer">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={submit} className="overflow-y-auto flex-1 p-5 space-y-5">
          {GROUPS.map(([gid, fields]) => (
            <div key={gid} className="grid grid-cols-2 gap-3">
              {fields.map(([k, lk, type]) => (
                <label key={k} className="block">
                  <span className="text-gray-500 text-[11px] font-medium uppercase tracking-wide">{lk ? t(lk) : (LABELS[k] || k)}</span>
                  <input
                    type={type} value={form[k]} onChange={(e) => set(k, e.target.value)}
                    step={type === 'number' ? 'any' : undefined}
                    className="mt-1 w-full bg-dark-900 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold-500/50"
                  />
                </label>
              ))}
            </div>
          ))}

          <label className="block">
            <span className="text-gray-500 text-[11px] font-medium uppercase tracking-wide">{t('admin.uploadPhotos')}</span>
            <input type="file" multiple accept="image/*" onChange={(e) => setFiles(Array.from(e.target.files))}
              className="mt-1 w-full text-sm text-gray-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-gold-500/20 file:text-gold-300 file:cursor-pointer" />
            {files.length > 0 && <span className="text-gray-500 text-xs">{files.length} 📷</span>}
          </label>

          {err && <div className="text-red-400 text-sm">{err}</div>}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="flex-1 bg-gold-500 hover:bg-gold-400 text-dark-900 font-semibold rounded-xl py-3 text-sm cursor-pointer disabled:opacity-50">
              {saving ? '…' : t('admin.save')}
            </button>
            <button type="button" onClick={onClose} className="px-5 bg-white/5 hover:bg-white/10 text-white rounded-xl py-3 text-sm cursor-pointer">
              {t('admin.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
