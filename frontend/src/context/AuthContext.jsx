import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('bklogic_user')
    return saved ? JSON.parse(saved) : null
  })

  const login = (userData, token) => {
    const u = { ...userData, token }
    localStorage.setItem('bklogic_token', token)
    localStorage.setItem('bklogic_user', JSON.stringify(u))
    setUser(u)
  }

  const logout = () => {
    localStorage.removeItem('bklogic_token')
    localStorage.removeItem('bklogic_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isDealer: user?.role === 'dealer', isBKadmin: user?.role === 'bkadmin', isAdmin: user?.role === 'dealer' || user?.role === 'bkadmin' }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
