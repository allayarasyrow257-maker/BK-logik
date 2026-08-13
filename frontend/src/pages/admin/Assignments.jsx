import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../api'

export default function Assignments() {
  const { t } = useTranslation()
  const [assignments, setAssignments] = useState([])
  const [cars, setCars] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedCar, setSelectedCar] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [error, setError] = useState('')

  const load = () => {
    Promise.all([api.getAssignments(), api.getCars(), api.getCustomers()])
      .then(([a, c, cu]) => {
        setAssignments(a)
        setCars(c)
        setCustomers(cu)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleAssign = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await api.createAssignment(selectedCar, parseInt(selectedCustomer))
      setShowForm(false)
      setSelectedCar('')
      setSelectedCustomer('')
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleTogglePayment = async (id, currentStatus) => {
    try {
      await api.updateAssignment(id, {
        payment_status: currentStatus === 'paid' ? 'unpaid' : 'paid',
      })
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleRemove = async (id) => {
    if (!confirm(t('admin.removeAssignConfirm'))) return
    try {
      await api.deleteAssignment(id)
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
          <h1 className="text-2xl font-bold text-white">{t('admin.assignments')}</h1>
          <p className="text-gray-500 text-sm mt-1">{assignments.length} {t('admin.assignmentsTotal')}</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          disabled={customers.length === 0}
          className="w-full sm:w-auto gold-gradient text-black font-bold px-4 py-3 rounded-xl hover:opacity-90 transition-opacity text-sm disabled:opacity-50 cursor-pointer text-center"
        >
          + {t('admin.assignCar')}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {customers.length === 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm rounded-xl px-4 py-3 mb-4">
          {t('admin.addCustomerFirst')}
        </div>
      )}

      {/* Assignment form modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setShowForm(false)}
        >
          <form
            onSubmit={handleAssign}
            onClick={(e) => e.stopPropagation()}
            className="bg-dark-800 border border-white/10 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-6 space-y-4"
          >
            {/* drag handle on mobile */}
            <div className="flex justify-center sm:hidden mb-2">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            <h2 className="text-white font-bold text-lg">{t('admin.assignCar')}</h2>

            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('admin.selectCar')}</label>
              <select
                value={selectedCar}
                onChange={(e) => setSelectedCar(e.target.value)}
                className="w-full bg-dark-700 border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gold-500/50"
                required
              >
                <option value="" className="bg-dark-800">--</option>
                {cars.map((c) => (
                  <option key={c.id} value={c.id} className="bg-dark-800">
                    {c.title} ({c.vin?.slice(-6)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('admin.selectCustomer')}</label>
              <select
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                className="w-full bg-dark-700 border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gold-500/50"
                required
              >
                <option value="" className="bg-dark-800">--</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id} className="bg-dark-800">
                    {c.name} {c.phone && `(${c.phone})`}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="flex-1 gold-gradient text-black font-bold py-3 rounded-xl hover:opacity-90 text-sm cursor-pointer"
              >
                {t('admin.assign')}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-5 py-3 bg-dark-700 text-gray-300 rounded-xl hover:bg-dark-600 text-sm cursor-pointer"
              >
                {t('admin.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Assignments list */}
      <div className="space-y-3">
        {assignments.map((a) => (
          <div key={a.id} className="bg-dark-800 border border-white/5 rounded-2xl p-4">
            {/* Car info row */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-9 h-9 bg-blue-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10h10zM13 8h4l3 3v5h-7V8z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="text-white font-medium text-sm truncate">{a.car_title}</div>
                  <div className="text-gray-500 text-xs font-mono truncate">{a.car_vin}</div>
                </div>
              </div>
              {/* Payment toggle — top right */}
              <button
                onClick={() => handleTogglePayment(a.id, a.payment_status)}
                className={`flex-shrink-0 whitespace-nowrap text-xs font-semibold px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  a.payment_status === 'paid'
                    ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                    : 'bg-orange-500/15 text-orange-400 hover:bg-orange-500/25'
                }`}
              >
                {a.payment_status === 'paid' ? t('admin.paid') : t('admin.unpaid')}
              </button>
            </div>

            {/* Divider */}
            <div className="border-t border-white/5 my-2" />

            {/* Customer info + remove */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-8 h-8 bg-gold-500/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-gold-400 font-bold text-xs">{a.customer_name?.[0]?.toUpperCase()}</span>
                </div>
                <div className="min-w-0">
                  <div className="text-white text-sm font-medium truncate">{a.customer_name}</div>
                  {a.customer_phone && (
                    <div className="text-gray-500 text-xs truncate">{a.customer_phone}</div>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleRemove(a.id)}
                className="shrink-0 w-9 h-9 flex items-center justify-center text-gray-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer"
                title={t('admin.removeAssign')}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        ))}

        {assignments.length === 0 && (
          <div className="text-center py-16">
            <svg className="w-12 h-12 text-gray-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <p className="text-gray-500">{t('admin.noAssignments')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
