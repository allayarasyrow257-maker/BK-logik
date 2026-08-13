import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../api'
import { useAuth } from '../../context/AuthContext'

export default function Dashboard() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [settings, setSettings] = useState({})
  const [stats, setStats] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  useEffect(() => {
    api.getStats().then(setStats).catch(() => {})
    api.getSettings().then(setSettings).catch(() => {})
  }, [])

  const base = user?.role === 'bkadmin' ? '/BKadmin' : '/admin'
  const canSync = user?.role === 'dealer' || (user?.role === 'bkadmin' && settings.bkadmin_sync_enabled)

  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg('')
    try {
      await api.triggerSync()
      setSyncMsg(t('admin.syncStarted'))
      // Poll status
      const poll = setInterval(async () => {
        const status = await api.getSyncStatus()
        if (!status.running) {
          clearInterval(poll)
          setSyncing(false)
          setSyncMsg(t('admin.syncDone'))
          api.getStats().then(setStats)
        }
      }, 5000)
    } catch (err) {
      setSyncing(false)
      setSyncMsg(err.message)
    }
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('admin.dashboard')}</h1>
          <p className="text-gray-500 text-sm mt-1">{t('admin.dashboardSub')}</p>
        </div>
        {canSync && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="w-full sm:w-auto gold-gradient text-black font-bold px-5 py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 text-sm cursor-pointer"
          >
            {syncing ? t('admin.syncing') : t('admin.syncNow')}
          </button>
        )}
      </div>

      {syncMsg && (
        <div className="bg-gold-500/10 border border-gold-500/20 text-gold-400 text-sm rounded-xl px-4 py-3 mb-6">
          {syncMsg}
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label={t('admin.totalCars')}
          value={stats.total_cars}
          to={base + '/cars'}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 17h.01M16 17h.01M3 11l1.5-5A2 2 0 016.4 4h11.2a2 2 0 011.9 1.4L21 11M3 11v6a1 1 0 001 1h1m16-7v6a1 1 0 01-1 1h-1M3 11h18" />
            </svg>
          }
        />
        <StatCard
          label={t('admin.totalCustomers')}
          value={stats.total_customers}
          to={base + '/customers'}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
        <StatCard
          label={t('admin.assigned')}
          value={stats.total_assignments}
          to={base + '/assignments'}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          }
        />
        <StatCard
          label={t('admin.unassigned')}
          value={stats.unassigned_cars}
          to={base + '/cars'}
          accent
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />
      </div>

      {/* Status breakdown */}
      {stats.status_breakdown && Object.keys(stats.status_breakdown).length > 0 && (
        <div className="bg-dark-800 border border-white/5 rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-4">{t('admin.statusBreakdown')}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(stats.status_breakdown).map(([status, count]) => (
              <div
                key={status}
                className="bg-dark-700 rounded-xl px-4 py-3 flex items-center justify-between"
              >
                <span className="text-gray-400 text-sm">{status || 'Unknown'}</span>
                <span className="text-white font-bold">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon, accent, to }) {
  const navigate = useNavigate()
  return (
    <div
      onClick={() => navigate(to)}
      className="bg-dark-800 border border-white/5 rounded-2xl p-5 cursor-pointer hover:bg-white/5 transition-colors active:scale-[0.98]"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${accent ? 'bg-red-500/10 text-red-400' : 'bg-gold-500/10 text-gold-400'}`}>
        {icon}
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-gray-500 text-xs mt-1">{label}</div>
    </div>
  )
}
