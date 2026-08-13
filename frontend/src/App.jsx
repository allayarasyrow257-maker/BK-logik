import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import MyCars from './pages/MyCars'
import AdminLayout from './pages/admin/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import Cars from './pages/admin/Cars'
import Customers from './pages/admin/Customers'
import Assignments from './pages/admin/Assignments'
import Settings from './pages/admin/Settings'

function ProtectedRoute({ children, roles }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === 'customer' ? '/my-cars' : (user.role === 'bkadmin' ? '/BKadmin' : '/admin')} replace /> : <Login />} />

      {/* Dealer admin */}
      <Route path="/admin" element={<ProtectedRoute roles={['dealer']}><AdminLayout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="cars" element={<Cars />} />
        <Route path="customers" element={<Customers />} />
        <Route path="assignments" element={<Assignments />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* BKadmin (sinirli admin) */}
      <Route path="/BKadmin" element={<ProtectedRoute roles={['bkadmin']}><AdminLayout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="cars" element={<Cars />} />
        <Route path="customers" element={<Customers />} />
        <Route path="assignments" element={<Assignments />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* Customer */}
      <Route path="/my-cars" element={<ProtectedRoute roles={['customer']}><MyCars /></ProtectedRoute>} />

      {/* Default redirect */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
