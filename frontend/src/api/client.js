import axios from 'axios'

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

export const api = axios.create({
  baseURL,
  timeout: 90000, // 90s to handle Render cold starts
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('bg_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Only redirect on 401 for protected routes, not the login endpoint itself
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/login')) {
      localStorage.removeItem('bg_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export function getErrorMessage(err, fallback = 'An error occurred.') {
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((d) => (typeof d === 'string' ? d : d.msg || JSON.stringify(d))).join(', ')
  }
  if (detail && typeof detail === 'object') {
    return detail.msg || JSON.stringify(detail)
  }
  if (err?.code === 'ERR_NETWORK') {
    return 'Cannot reach server. It may be starting up — try again in 30s.'
  }
  return err?.message || fallback
}
