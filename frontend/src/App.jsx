import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import SubmitPage from './pages/SubmitPage'
import ReviewPage from './pages/ReviewPage'
import ApprovalsPage from './pages/ApprovalsPage'
import GuidelinesPage from './pages/GuidelinesPage'
import AuditPage from './pages/AuditPage'
import Layout from './components/Layout'

function RequireAuth({ children, roles }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-blue" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />
  return children
}

function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  return <Navigate to={user ? '/dashboard' : '/login'} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <Layout><DashboardPage /></Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/submit"
            element={
              <RequireAuth roles={['creator', 'manager']}>
                <Layout><SubmitPage /></Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/review/:id"
            element={
              <RequireAuth>
                <Layout><ReviewPage /></Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/approvals"
            element={
              <RequireAuth roles={['manager', 'reviewer']}>
                <Layout><ApprovalsPage /></Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/guidelines"
            element={
              <RequireAuth roles={['admin']}>
                <Layout><GuidelinesPage /></Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/audit"
            element={
              <RequireAuth roles={['admin']}>
                <Layout><AuditPage /></Layout>
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
