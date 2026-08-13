import { API_BASE } from './config'

function getToken() {
  return localStorage.getItem('bklogic_token')
}

// Wrap fetch with a hard timeout so a stuck request never hangs the UI forever.
async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Baglanti zaman asimina ugradi. Sunucuya ulasilamiyor.')
    }
    throw new Error('Sunucuya baglanilamadi. Ag baglantinizi kontrol edin.')
  } finally {
    clearTimeout(id)
  }
}

async function request(path, options = {}) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetchWithTimeout(`${API_BASE}${path}`, { ...options, headers })

  if (res.status === 401) {
    localStorage.removeItem('bklogic_token')
    localStorage.removeItem('bklogic_user')
    window.location.href = '/login'
    return
  }

  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'API error')
  return data
}

export const api = {
  login: (username, password) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  getCars: () => request('/cars'),
  getCar: (id) => request(`/cars/${id}`),
  createCar: (data) =>
    request('/cars', { method: 'POST', body: JSON.stringify(data) }),
  updateCar: (id, data) =>
    request(`/cars/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCar: (id) =>
    request(`/cars/${id}`, { method: 'DELETE' }),
  uploadCarImages: async (id, filesList) => {
    const token = getToken()
    const fd = new FormData()
    Array.from(filesList || []).forEach((f) => fd.append('files', f))
    const headers = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetchWithTimeout(`${API_BASE}/cars/${id}/images`, {
      method: 'POST',
      headers,
      body: fd,
    }, 60000)
    if (res.status === 401) {
      localStorage.removeItem('bklogic_token')
      localStorage.removeItem('bklogic_user')
      window.location.href = '/login'
      return
    }
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'API error')
    return data
  },

  getCustomers: () => request('/customers'),
  getCustomerCars: (id) => request(`/customers/${id}/cars`),
  createCustomer: (data) =>
    request('/customers', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomer: (id, data) =>
    request(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCustomer: (id) =>
    request(`/customers/${id}`, { method: 'DELETE' }),

  getAssignments: () => request('/assignments'),
  createAssignment: (car_id, customer_id) =>
    request('/assignments', {
      method: 'POST',
      body: JSON.stringify({ car_id, customer_id }),
    }),
  updateAssignment: (id, data) =>
    request(`/assignments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAssignment: (id) =>
    request(`/assignments/${id}`, { method: 'DELETE' }),

  changePassword: (current_password, new_password) =>
    request('/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ current_password, new_password }),
    }),

  updateProfile: (data) =>
    request('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),

  triggerSync: () => request('/sync', { method: 'POST' }),
  getSyncStatus: () => request('/sync/status'),

  getStats: () => request('/stats'),

  getSettings: () => request('/settings'),
  updateSettings: (data) => request('/settings', { method: 'PUT', body: JSON.stringify(data) }),
}
