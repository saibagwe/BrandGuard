import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../api/client'
import ServerWakeup from '../components/ServerWakeup'
import IssueBadge from '../components/IssueBadge'
import { FileText, Clock, CheckCircle, AlertTriangle, ChevronRight } from 'lucide-react'

const ROLE_LABELS = {
  creator: 'Content Creator',
  reviewer: 'Brand Reviewer',
}

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-600',
  submitted: 'bg-blue-100 text-blue-700',
  in_review: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  changes_requested: 'bg-orange-100 text-orange-700',
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-800">{value}</div>
        <div className="text-sm text-gray-500">{label}</div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [wakeup, setWakeup] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setWakeup(true), 5000)
    api
      .get('/reviews')
      .then((res) => {
        setReviews(Array.isArray(res.data) ? res.data : res.data.items || [])
      })
      .catch((err) => {
        if (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED') {
          setWakeup(true)
        } else {
          setError('Could not load reviews.')
        }
      })
      .finally(() => {
        clearTimeout(timer)
        setLoading(false)
        setWakeup(false)
      })
    return () => clearTimeout(timer)
  }, [])

  const totalSubmissions = reviews.length
  const pending = reviews.filter((r) => ['submitted', 'in_review'].includes(r.status)).length
  const approved = reviews.filter((r) => r.status === 'approved').length
  const issuesFound = reviews.reduce((acc, r) => acc + (r.issue_count || 0), 0)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Welcome banner */}
      <div className="bg-nimbus-navy text-white rounded-2xl px-7 py-6 mb-8">
        <h1 className="text-2xl font-bold mb-1">
          Welcome back, {user?.full_name?.split(' ')[0] || 'User'}! 👋
        </h1>
        <p className="text-blue-200 text-sm">
          {ROLE_LABELS[user?.role] || user?.role} · BrandGuard AI Dashboard
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={FileText} label="Total Submissions" value={totalSubmissions} color="bg-nimbus-blue" />
        <StatCard icon={Clock} label="Pending Review" value={pending} color="bg-yellow-500" />
        <StatCard icon={CheckCircle} label="Approved" value={approved} color="bg-nimbus-green" />
        <StatCard icon={AlertTriangle} label="Issues Found" value={issuesFound} color="bg-red-500" />
      </div>

      {/* Recent submissions */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Recent Submissions</h2>
          {user?.role === 'creator' && (
            <Link
              to="/submit"
              className="text-sm text-nimbus-blue hover:underline font-medium"
            >
              + New Submission
            </Link>
          )}
        </div>

        {(loading || wakeup) ? (
          <ServerWakeup />
        ) : error ? (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">{error}</div>
        ) : reviews.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <FileText size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 text-sm">No submissions yet.</p>
            {user?.role === 'creator' && (
              <Link
                to="/submit"
                className="mt-3 inline-block bg-nimbus-blue text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
              >
                Submit Content
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold">Title</th>
                  <th className="px-6 py-3 text-left font-semibold">Status</th>
                  <th className="px-6 py-3 text-left font-semibold">Issues</th>
                  <th className="px-6 py-3 text-left font-semibold">Submitted</th>
                  <th className="px-6 py-3 text-left font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reviews.slice(0, 10).map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3.5 font-medium text-gray-800 max-w-xs truncate">
                      {r.title}
                    </td>
                    <td className="px-6 py-3.5">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {r.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      {r.issue_count != null ? (
                        <IssueBadge
                          severity={r.issue_count > 3 ? 'high' : r.issue_count > 0 ? 'medium' : 'low'}
                        />
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-gray-500">
                      {r.created_at
                        ? new Date(r.created_at).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-6 py-3.5">
                      <Link
                        to={`/review/${r.id}`}
                        className="inline-flex items-center gap-1 text-nimbus-blue hover:underline text-xs font-medium"
                      >
                        View <ChevronRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick access for demo */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-5">
        <h3 className="font-semibold text-nimbus-navy mb-2">🚀 Quick Demo</h3>
        <p className="text-sm text-blue-700 mb-3">
          Try the sample review to see AI-detected brand issues with highlights and suggestions.
        </p>
        <Link
          to="/review/sample"
          className="inline-block bg-nimbus-blue text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          View Sample Review →
        </Link>
      </div>
    </div>
  )
}
