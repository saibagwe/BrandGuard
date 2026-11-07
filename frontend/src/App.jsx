import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Component, Suspense, lazy } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import SubmitPage from './pages/SubmitPage'
import ReviewPage from './pages/ReviewPage'
import ApprovalsPage from './pages/ApprovalsPage'
import GuidelinesPage from './pages/GuidelinesPage'
import AuditPage from './pages/AuditPage'
import Layout from './components/Layout'

// ---------------------------------------------------------------------------
// Error Boundary
// ---------------------------------------------------------------------------

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.locationKey !== this.props.locationKey && this.state.hasError) {
      this.setState({ hasError: false, error: null })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="max-w-md w-full bg-white rounded-xl shadow-md p-8 text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-gray-500 text-sm mb-6">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => window.history.back()}
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200"
              >
                ← Back
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-lg bg-brand-blue text-white text-sm font-medium hover:bg-blue-700"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function ErrorBoundaryWithLocation({ children }) {
  const location = useLocation()
  return <ErrorBoundary locationKey={location.key}>{children}</ErrorBoundary>
}

// ---------------------------------------------------------------------------
// Auth guards
// ---------------------------------------------------------------------------

function RequireAuth({ children, creatorOnly, reviewerOnly }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-blue" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (creatorOnly && user.role !== 'creator') return <Navigate to="/approvals" replace />
  if (reviewerOnly && user.role !== 'reviewer') return <Navigate to="/dashboard" replace />
  return children
}

function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'reviewer' ? '/approvals' : '/dashboard'} replace />
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ErrorBoundaryWithLocation>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<LoginPage />} />

            {/* Creator-only routes */}
            <Route
              path="/dashboard"
              element={
                <RequireAuth creatorOnly>
                  <Layout><DashboardPage /></Layout>
                </RequireAuth>
              }
            />
            <Route
              path="/submit"
              element={
                <RequireAuth creatorOnly>
                  <Layout><SubmitPage /></Layout>
                </RequireAuth>
              }
            />

            {/* Shared review detail page — role determines what is shown */}
            <Route
              path="/review/:id"
              element={
                <RequireAuth>
                  <Layout><ReviewPage /></Layout>
                </RequireAuth>
              }
            />

            {/* Reviewer-only routes */}
            <Route
              path="/approvals"
              element={
                <RequireAuth reviewerOnly>
                  <Layout><ApprovalsPage /></Layout>
                </RequireAuth>
              }
            />
            <Route
              path="/guidelines"
              element={
                <RequireAuth reviewerOnly>
                  <Layout><GuidelinesPage /></Layout>
                </RequireAuth>
              }
            />
            <Route
              path="/audit"
              element={
                <RequireAuth reviewerOnly>
                  <Layout><AuditPage /></Layout>
                </RequireAuth>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundaryWithLocation>
      </BrowserRouter>
    </AuthProvider>
  )
}
