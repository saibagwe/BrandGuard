import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../api/client'

const AuthContext = createContext(null)

function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(jsonPayload)
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('bg_token')
    if (stored) {
      const payload = parseJwt(stored)
      if (payload && payload.exp * 1000 > Date.now()) {
        setToken(stored)
        setUser({
          id: payload.sub || payload.id,
          email: payload.email,
          role: payload.role,
          full_name: payload.full_name || payload.name || payload.email,
        })
      } else {
        localStorage.removeItem('bg_token')
      }
    }
    setLoading(false)
  }, [])

  const login = async (email, password) => {
    const res = await api.post('/auth/login', {
      email,
      username: email,
      password,
    })

    const { access_token } = res.data
    localStorage.setItem('bg_token', access_token)
    const payload = parseJwt(access_token)
    const userData = {
      id: payload.sub || payload.id,
      email: payload.email,
      role: payload.role,
      full_name: payload.full_name || payload.name || email,
    }
    setToken(access_token)
    setUser(userData)
    return userData
  }

  const logout = () => {
    localStorage.removeItem('bg_token')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
