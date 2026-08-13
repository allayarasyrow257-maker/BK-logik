import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../api'
import { copyText } from '../../utils/clipboard'
import CarInfoCard from '../../components/CarInfoCard'

export default function Customers() {
  const { t } = useTranslation()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [detail, setDetail] = useState(null)

  const load = () => {
    api.getCustomers().then((data) => { setCustomers(data); setLoading(false) }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const resetForm = () => {
    setForm({ name: '', phone: '', email: '', password: '' })
    setShowForm(false)
    setEditId(null)
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (editId) {
        const updates = {}
        if (form.name) updates.name = form.name
        if (form.phone) updates.phone = form.phone
        if (form.email) updates.email = form.email
        if (form.password) updates.password = form.password
        await api.updateCustomer(editId, updates)
      } else {
        if (!form.password) {
          setError(t('admin.passwordRequired'))
          return
        }
        await api.createCustomer(form)
      }
      resetForm()
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleEdit = (c) => {
    setEditId(c.id)
    setForm({ name: c.name, phone: c.phone, email: c.email, password: '' })
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!confirm(t('admin.deleteConfirm'))) return
    try {
      await api.deleteCustomer(id)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('admin.customers')}</h1>
          <p className="text-gray-500 text-sm mt-1">{customers.length} {t('admin.customersTotal')}</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="w-full sm:w-auto gold-gradient text-black font-bold px-5 py-3 rounded-xl hover:opacity-90 transition-opacity text-sm cursor-pointer text-center"
        >
          + {t('admin.addCustomer')}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={resetForm}>
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="bg-dark-800 border border-white/10 rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6 space-y-4"
          >
            <h2 className="text-white font-bold text-lg">
              {editId ? t('admin.editCustomer') : t('admin.addCustomer')}
            </h2>

            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('admin.name')}</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-dark-700 border border-white/10 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-gold-500/50"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('admin.phone')}</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full bg-dark-700 border border-white/10 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-gold-500/50"
                placeholder="+995..."
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('admin.email')}</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full bg-dark-700 border border-white/10 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-gold-500/50"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                {t('login.password')} {editId && <span className="text-gray-600">({t('admin.leaveEmpty')})</span>}
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full bg-dark-700 border border-white/10 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-gold-500/50"
                required={!editId}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="flex-1 gold-gradient text-black font-bold py-2.5 rounded-xl hover:opacity-90 text-sm cursor-pointer"
              >
                {editId ? t('admin.save') : t('admin.create')}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-5 py-2.5 bg-dark-700 text-gray-300 rounded-xl hover:bg-dark-600 text-sm cursor-pointer"
              >
                {t('admin.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Customer list */}
      <div className="space-y-3">
        {customers.map((c) => (
          <div
            key={c.id}
            onClick={() => setDetail(c)}
            className="bg-dark-800 border border-white/5 rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-3 cursor-pointer hover:bg-white/[0.03] hover:border-white/10 transition-colors active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 bg-gold-500/10 rounded-full flex items-center justify-center shrink-0">
                <span className="text-gold-400 font-bold text-sm">{c.name[0]?.toUpperCase()}</span>
              </div>
              <div className="min-w-0">
                <div className="text-white font-medium truncate">{c.name}</div>
                <div className="text-gray-500 text-xs truncate">
                  {c.phone && <span>{c.phone}</span>}
                  {c.phone && c.email && <span> &middot; </span>}
                  {c.email && <span>{c.email}</span>}
                </div>
                <PasswordCell value={c.password_plain} t={t} />
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="bg-dark-700 text-gray-300 text-xs px-2.5 py-1 rounded-lg shrink-0 whitespace-nowrap">
                {c.car_count} {t('admin.cars').toLowerCase()}
              </span>
              <button onClick={(e) => { e.stopPropagation(); handleEdit(c) }} className="text-gray-400 hover:text-gold-400 w-9 h-9 flex items-center justify-center rounded-lg cursor-pointer">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id) }} className="text-gray-400 hover:text-red-400 w-9 h-9 flex items-center justify-center rounded-lg cursor-pointer">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              <svg className="w-4 h-4 text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </div>
          </div>
        ))}

        {customers.length === 0 && (
          <div className="text-center py-16">
            <svg className="w-12 h-12 text-gray-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-gray-500">{t('admin.noCustomers')}</p>
          </div>
        )}
      </div>

      {detail && <CustomerDetailSheet customer={detail} onClose={() => setDetail(null)} t={t} />}
    </div>
  )
}

function CustomerDetailSheet({ customer, onClose, t }) {
  const [cars, setCars] = useState(null)
  useEffect(() => {
    let alive = true
    api.getCustomerCars(customer.id).then((d) => { if (alive) setCars(d) }).catch(() => { if (alive) setCars([]) })
    return () => { alive = false }
  }, [customer.id])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-dark-900 sm:bg-dark-800 border-t sm:border border-white/10 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[92dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="pt-2 flex justify-center sm:hidden"><div className="w-10 h-1 rounded-full bg-white/20" /></div>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-gold-500/10 rounded-full flex items-center justify-center shrink-0">
              <span className="text-gold-400 font-bold">{customer.name[0]?.toUpperCase()}</span>
            </div>
            <div className="min-w-0">
              <div className="text-white font-bold truncate">{customer.name}</div>
              <div className="text-gray-500 text-xs truncate">
                {customer.phone}{customer.phone && customer.email ? ' \u00b7 ' : ''}{customer.email}
              </div>
            </div>
          </div>
          <button onClick={onClose} aria-label={t('common.close')} className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white rounded-lg cursor-pointer text-xl">
            &times;
          </button>
        </div>

        <div className="px-5 py-3 border-b border-white/5">
          <PasswordCell value={customer.password_plain} t={t} />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div className="text-gray-400 text-xs font-medium uppercase tracking-wide px-1">
            {t('common.customerCars')} {cars ? `(${cars.length})` : ''}
          </div>
          {cars === null ? (
            <div className="flex justify-center py-10"><div className="w-7 h-7 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" /></div>
          ) : cars.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm">{t('common.noCarsForCustomer')}</div>
          ) : (
            cars.map((car) => <CarInfoCard key={car.id} car={car} />)
          )}
        </div>
      </div>
    </div>
  )
}

function PasswordCell({ value, t }) {
  const [show, setShow] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!value) {
    return (
      <div className="text-gray-600 text-[11px] mt-0.5">
        {t('login.password')}: <span className="text-gray-600">—</span>
      </div>
    )
  }

  const doCopy = async (e) => {
    e.stopPropagation()
    const ok = await copyText(String(value))
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1500) }
  }

  return (
    <div className="flex items-center gap-1.5 mt-0.5">
      <span className="text-gray-500 text-[11px]">{t('login.password')}:</span>
      <span className={`text-gray-300 text-[11px] ${show ? 'font-mono' : 'tracking-widest'}`}>
        {show ? value : '••••••••'}
      </span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setShow((s) => !s) }}
        aria-label={show ? t('common.hide') : t('common.show')}
        title={show ? t('common.hide') : t('common.show')}
        className="text-gray-500 hover:text-gold-400 cursor-pointer"
      >
        {show ? (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
        )}
      </button>
      <button
        type="button"
        onClick={doCopy}
        aria-label={t('common.copy')}
        title={t('common.copy')}
        className="text-gray-500 hover:text-gold-400 cursor-pointer"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
      </button>
      {copied && <span className="text-green-400 text-[10px] font-semibold">{t('common.copied')}</span>}
    </div>
  )
}