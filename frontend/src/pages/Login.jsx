import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'

export default function Login() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const data = await api.login(username, password)
      login(data, data.token)
      navigate(data.role === 'dealer' ? '/admin' : data.role === 'bkadmin' ? '/BKadmin' : '/my-cars')
    } catch (err) {
      setError(err.message || t('login.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh overflow-y-auto flex flex-col items-center justify-center bg-dark-900 px-4 py-8" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2rem)' }}>
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gold-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img
              src="/LOGO_inner.png"
              alt="BK Logistics"
              className="h-24 w-auto object-contain drop-shadow-lg"
              loading="eager"
              decoding="sync"
            />
          </div>
          <p className="text-gray-500 text-sm mt-2">{t('login.subtitle')}</p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-dark-800 border border-white/5 rounded-2xl p-8 space-y-5"
        >
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              {t('login.username')}
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-dark-700 border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gold-500/50 transition-colors"
              placeholder={t('login.usernamePlaceholder')}
              required
              autoComplete="username"
              onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              {t('login.password')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-dark-700 border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gold-500/50 transition-colors"
              placeholder="••••••••"
              required
              autoComplete="current-password"
              onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full gold-gradient text-black font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            {loading ? t('login.loading') : t('login.submit')}
          </button>
        </form>
      </div>
    </div>
  )
}
