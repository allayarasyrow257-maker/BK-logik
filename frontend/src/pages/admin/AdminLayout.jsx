import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import LangSwitch from '../../components/LangSwitch'
import { useAuth } from '../../context/AuthContext'

const NAV_ITEMS = [
  { path: '', label: 'admin.dashboard', icon: DashboardIcon, end: true },
  { path: '/cars', label: 'admin.cars', icon: CarsIcon },
  { path: '/customers', label: 'admin.customers', icon: CustomersIcon },
  { path: '/assignments', label: 'admin.assignments', icon: AssignIcon },
  { path: '/settings', label: 'admin.settings', icon: SettingsIcon },
]

export default function AdminLayout() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const base = user?.role === 'bkadmin' ? '/BKadmin' : '/admin'
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-dark-900 flex w-full overflow-x-hidden">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-dark-800 border-r border-white/5 fixed inset-y-0 left-0 z-40">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-white/5">
          <img
            src="/LOGO_inner.png"
            alt="BK Logistics"
            className="h-9 w-auto object-contain"
            loading="eager"
            decoding="sync"
          />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path || "home"}
              to={base + item.path}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-gold-500/10 text-gold-400 border border-gold-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {t(item.label)}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-white/5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-gold-500/20 rounded-full flex items-center justify-center">
              <span className="text-gold-400 font-bold text-sm">
                {user?.name?.[0] || 'D'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-medium truncate">{user?.name}</div>
              <div className="text-gray-500 text-xs">{t('admin.dealer')}</div>
            </div>
          </div>
          <LangSwitch className="w-full justify-center mb-2" />
          <button
            onClick={handleLogout}
            className="w-full text-gray-400 hover:text-red-400 text-xs py-2 rounded-lg hover:bg-white/5 transition-all cursor-pointer"
          >
            {t('admin.logout')}
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-dark-800 border-b border-white/5 z-40">
        <div style={{ height: 'env(safe-area-inset-top, 0px)' }} />
        <div className="h-14 flex items-center justify-between px-4">
          <div className="flex items-center min-w-0">
            <img
              src="/LOGO_inner.png"
              alt="BK Logistics"
              className="h-8 w-auto object-contain"
              loading="eager"
              decoding="sync"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <LangSwitch />
            <button onClick={handleLogout} className="text-gray-400 text-xs cursor-pointer whitespace-nowrap">
              {t('admin.logout')}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-dark-800 border-t border-white/5 z-40 flex safe-area-bottom"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path || "home"}
            to={base + item.path}
            end={item.end}
            className={({ isActive }) =>
              `flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-2.5 min-h-[56px] transition-colors ${
                isActive ? 'text-gold-400' : 'text-gray-500'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className="w-[22px] h-[22px] shrink-0" />
                <span className={`text-[9px] font-medium leading-none truncate max-w-full px-0.5 ${isActive ? 'text-gold-400' : 'text-gray-500'}`}>
                  {t(item.label)}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-x-hidden md:ml-64 pb-36 md:pb-0 md:pt-0" style={{ paddingTop: 'calc(56px + env(safe-area-inset-top, 0px))' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

function DashboardIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

function CarsIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 17h.01M16 17h.01M3 11l1.5-5A2 2 0 016.4 4h11.2a2 2 0 011.9 1.4L21 11M3 11v6a1 1 0 001 1h1m16-7v6a1 1 0 01-1 1h-1M3 11h18" />
    </svg>
  )
}

function CustomersIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  )
}

function AssignIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  )
}

function SettingsIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}
