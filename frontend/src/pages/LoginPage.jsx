import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getErrorMessage } from '../api/client'
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react'

const DEMO_ACCOUNTS = [
  { label: 'Try as Creator', email: 'creator@nimbus.bank', password: 'demo1234', color: 'bg-nimbus-blue hover:bg-blue-700' },
  { label: 'Try as Reviewer', email: 'reviewer@nimbus.bank', password: 'demo1234', color: 'bg-purple-600 hover:bg-purple-700' },
]

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showWakeup, setShowWakeup] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const wakeupTimer = useRef(null)

  const startLogin = async (em, pw) => {
    setError('')
    setLoading(true)
    setShowWakeup(false)
    wakeupTimer.current = setTimeout(() => setShowWakeup(true), 3000)
    
    try {
      await login(em, pw)
      navigate('/dashboard')
    } catch (err) {
      setError(getErrorMessage(err, 'Login failed. Check credentials.'))
    } finally {
      clearTimeout(wakeupTimer.current)
      setLoading(false)
      setShowWakeup(false)
    }
  }

  const handleManualSubmit = (e) => {
    e.preventDefault()
    if (!email || !password) return setError('Enter email and password.')
    startLogin(email, password)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      {/* Header strip */}
      <div className="w-full max-w-md">
        <div className="bg-nimbus-navy rounded-t-2xl px-8 py-6 flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-nimbus-blue flex items-center justify-center text-white font-bold text-xl shrink-0">
            NB
          </div>
          <div className="text-white">
            <h1 className="text-2xl font-bold leading-tight">BrandGuard AI</h1>
            <p className="text-blue-300 text-sm">Brand Governance Platform</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-b-2xl shadow-xl px-8 py-7">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Sign in to your account</h2>
          <p className="text-sm text-gray-500 mb-6">Select a demo role or sign in manually below.</p>

          {/* Demo buttons */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {DEMO_ACCOUNTS.map(({ label, email: em, password: pw, color }) => (
              <button
                key={label}
                onClick={() => startLogin(em, pw)}
                disabled={loading}
                className={`text-sm font-semibold py-2.5 px-3 rounded-lg text-white transition-colors disabled:opacity-50 ${color}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Wakeup indicator */}
          {showWakeup && (
            <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <Loader2 size={18} className="animate-spin text-amber-500 shrink-0" />
              <p className="text-xs text-amber-700">
                Server is waking up (Render free tier). Usually 30–60 seconds…
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Loading state */}
          {loading && !showWakeup && (
            <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
              <Loader2 size={16} className="animate-spin" />
              Signing in…
            </div>
          )}

          {/* Collapsible manual form */}
          <button
            onClick={() => setShowManual((p) => !p)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-3"
          >
            {showManual ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            Sign in manually
          </button>

          {showManual && (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@nimbus.bank"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-nimbus-blue"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-nimbus-blue"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-nimbus-navy text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-900 transition-colors disabled:opacity-50"
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
