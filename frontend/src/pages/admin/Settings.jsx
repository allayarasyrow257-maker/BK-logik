import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../api'
import { useAuth } from '../../context/AuthContext'

export default function Settings() {
  const { t } = useTranslation()
  const { isDealer } = useAuth()
  const [flags, setFlags] = useState({})
  useEffect(() => { if (isDealer) api.getSettings().then(setFlags).catch(() => {}) }, [isDealer])
  const toggleFlag = async (key) => {
    const next = { ...flags, [key]: !flags[key] }
    setFlags(next)
    try { await api.updateSettings({ [key]: next[key] }) } catch (e) {}
  }

  const storedUser = JSON.parse(localStorage.getItem('bklogic_user') || '{}')
  const [currentUsername, setCurrentUsername] = useState(storedUser.username || 'admin')

  // Password change form
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' })
  const [pwLoading, setPwLoading] = useState(false)
  const [pwMsg, setPwMsg] = useState({ type: '', text: '' })

  // Username change form
  const [unForm, setUnForm] = useState({ username: '' })
  const [unLoading, setUnLoading] = useState(false)
  const [unMsg, setUnMsg] = useState({ type: '', text: '' })

  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    setPwMsg({ type: '', text: '' })

    if (pwForm.newPw.length < 6) {
      setPwMsg({ type: 'error', text: t('admin.passwordTooShort') })
      return
    }
    if (pwForm.newPw !== pwForm.confirm) {
      setPwMsg({ type: 'error', text: t('admin.passwordMismatch') })
      return
    }

    setPwLoading(true)
    try {
      await api.changePassword(pwForm.current, pwForm.newPw)
      setPwMsg({ type: 'success', text: t('admin.passwordChanged') })
      setPwForm({ current: '', newPw: '', confirm: '' })
    } catch (err) {
      setPwMsg({ type: 'error', text: err.message })
    } finally {
      setPwLoading(false)
    }
  }

  const handleUsernameSubmit = async (e) => {
    e.preventDefault()
    setUnMsg({ type: '', text: '' })

    const trimmed = unForm.username.trim()
    if (trimmed.length < 3) {
      setUnMsg({ type: 'error', text: t('admin.usernameTooShort') })
      return
    }

    setUnLoading(true)
    try {
      await api.updateProfile({ username: trimmed })
      setCurrentUsername(trimmed)
      // Update stored user info
      const stored = JSON.parse(localStorage.getItem('bklogic_user') || '{}')
      localStorage.setItem('bklogic_user', JSON.stringify({ ...stored, username: trimmed }))
      setUnMsg({ type: 'success', text: t('admin.usernameChanged') })
      setUnForm({ username: '' })
    } catch (err) {
      setUnMsg({ type: 'error', text: err.message })
    } finally {
      setUnLoading(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1">{t('admin.settings')}</h1>
      <p className="text-gray-500 text-sm mb-8">{t('admin.settingsSub')}</p>

      <div className="space-y-4 max-w-md">

        {isDealer && (
          <div className="bg-dark-800 border border-white/5 rounded-2xl p-6">
            <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {t('admin.bkadminPerms')}
            </h2>
            {[['bkadmin_sync_enabled', t('admin.enableSync')], ['bkadmin_add_enabled', t('admin.enableAdd')]].map(([key, label]) => (
              <button key={key} onClick={() => toggleFlag(key)} className="w-full flex items-center justify-between py-2.5 cursor-pointer">
                <span className="text-gray-300 text-sm text-left">{label}</span>
                <span className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${flags[key] ? 'bg-gold-500' : 'bg-white/15'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${flags[key] ? 'translate-x-5' : ''}`} />
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Username change */}
        <div className="bg-dark-800 border border-white/5 rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-1 flex items-center gap-2">
            <svg className="w-5 h-5 text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            {t('admin.changeUsername')}
          </h2>
          <p className="text-gray-500 text-xs mb-4">
            {t('admin.currentUsername')}: <span className="text-gray-300 font-mono">{currentUsername}</span>
          </p>

          {unMsg.text && (
            <div className={`text-sm rounded-xl px-4 py-3 mb-4 ${
              unMsg.type === 'success'
                ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                : 'bg-red-500/10 border border-red-500/20 text-red-400'
            }`}>
              {unMsg.text}
            </div>
          )}

          <form onSubmit={handleUsernameSubmit} className="space-y-4">
            <div>
              <label className="block text-gray-400 text-xs mb-1.5">{t('admin.newUsername')}</label>
              <input
                type="text"
                value={unForm.username}
                onChange={(e) => setUnForm({ username: e.target.value })}
                required
                autoComplete="username"
                className="w-full bg-dark-700 border border-white/10 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-gold-500/50"
              />
            </div>
            <button
              type="submit"
              disabled={unLoading}
              className="w-full gold-gradient text-black font-bold py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 text-sm cursor-pointer"
            >
              {unLoading ? '...' : t('admin.saveUsername')}
            </button>
          </form>
        </div>

        {/* Password change */}
        <div className="bg-dark-800 border border-white/5 rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-5 flex items-center gap-2">
            <svg className="w-5 h-5 text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            {t('admin.changePassword')}
          </h2>

          {pwMsg.text && (
            <div className={`text-sm rounded-xl px-4 py-3 mb-4 ${
              pwMsg.type === 'success'
                ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                : 'bg-red-500/10 border border-red-500/20 text-red-400'
            }`}>
              {pwMsg.text}
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-gray-400 text-xs mb-1.5">{t('admin.currentPassword')}</label>
              <input
                type="password"
                value={pwForm.current}
                onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
                required
                autoComplete="current-password"
                className="w-full bg-dark-700 border border-white/10 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-gold-500/50"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-xs mb-1.5">{t('admin.newPassword')}</label>
              <input
                type="password"
                value={pwForm.newPw}
                onChange={(e) => setPwForm({ ...pwForm, newPw: e.target.value })}
                required
                autoComplete="new-password"
                className="w-full bg-dark-700 border border-white/10 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-gold-500/50"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-xs mb-1.5">{t('admin.confirmPassword')}</label>
              <input
                type="password"
                value={pwForm.confirm}
                onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                required
                autoComplete="new-password"
                className="w-full bg-dark-700 border border-white/10 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-gold-500/50"
              />
            </div>
            <button
              type="submit"
              disabled={pwLoading}
              className="w-full gold-gradient text-black font-bold py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 text-sm cursor-pointer"
            >
              {pwLoading ? '...' : t('admin.changePassword')}
            </button>
          </form>
        </div>

      </div>
    </div>
  )
}
