import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api, getErrorMessage } from '../api/client'
import ServerWakeup from '../components/ServerWakeup'
import {
  FileText,
  Clock,
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  PlusCircle,
  AlertCircle,
  RefreshCw,
  Info,
} from 'lucide-react'

const ROLE_LABELS = {
  creator: 'Content Creator',
  reviewer: 'Brand Reviewer',
}

const STATUS_CONFIG = {
  draft: {
    label: 'Draft',
    cls: 'bg-gray-100 text-gray-700 border border-gray-300',
  },
  checking: {
    label: 'Checking…',
    cls: 'bg-indigo-100 text-indigo-700 border border-indigo-300 animate-pulse',
  },
  ready: {
    label: 'Ready',
    cls: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
  },
  in_review: {
    label: 'In Review',
    cls: 'bg-amber-100 text-amber-800 border border-amber-300',
  },
  changes_requested: {
    label: 'Changes Requested',
    cls: 'bg-orange-100 text-orange-800 border border-orange-300',
  },
  approved: {
    label: 'Approved',
    cls: 'bg-green-100 text-green-800 border border-green-300',
  },
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [wakeup, setWakeup] = useState(false)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [hasNoGuidelines, setHasNoGuidelines] = useState(false)

  const fetchReviews = async () => {
    setLoading(true)
    setError('')
    const timer = setTimeout(() => setWakeup(true), 5000)
    try {
      const url = statusFilter && statusFilter !== 'all' ? `/reviews?status=${statusFilter}` : '/reviews'
      const res = await api.get(url)
      const data = Array.isArray(res.data) ? res.data : res.data.items || []
      setReviews(data)
      const anyNoGuidelines = data.some((r) => r.no_guidelines)
      if (anyNoGuidelines) {
        setHasNoGuidelines(true)
      } else {
        // Also check guidelines endpoint if empty
        try {
          const gRes = await api.get('/guidelines')
          const docs = gRes.data?.docs || gRes.data || []
          if (Array.isArray(docs) && docs.length === 0) {
            setHasNoGuidelines(true)
          } else {
            setHasNoGuidelines(false)
          }
        } catch {
          // Ignore guideline check failure
        }
      }
    } catch (err) {
      if (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED') {
        setWakeup(true)
      } else {
        setError(getErrorMessage(err, 'Could not load your reviews.'))
      }
    } finally {
      clearTimeout(timer)
      setLoading(false)
      setWakeup(false)
    }
  }

  useEffect(() => {
    fetchReviews()
  }, [statusFilter])

  const total = reviews.length
  const readyCount = reviews.filter((r) => r.status === 'ready').length
  const inReviewCount = reviews.filter((r) => ['checking', 'in_review'].includes(r.status)).length
  const approvedCount = reviews.filter((r) => r.status === 'approved').length
  const changesCount = reviews.filter((r) => r.status === 'changes_requested').length

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-nimbus-navy to-blue-900 text-white rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-1">
            Welcome back, {user?.full_name?.split(' ')[0] || 'Creator'}!
          </h1>
          <p className="text-blue-200 text-sm">
            {ROLE_LABELS[user?.role] || user?.role} · Creator Workspace
          </p>
        </div>
        <Link
          to="/submit"
          className="inline-flex items-center gap-2 bg-nimbus-blue hover:bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow transition-colors shrink-0"
        >
          <PlusCircle size={18} />
          New Review
        </Link>
      </div>

      {/* Guidelines Missing Warning Banner */}
      {hasNoGuidelines && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3">
          <Info className="text-amber-600 shrink-0 mt-0.5" size={20} />
          <div>
            <p className="text-sm font-semibold text-amber-900">
              No brand guidelines have been added yet.
            </p>
            <p className="text-xs text-amber-800 mt-0.5">
              A Reviewer needs to add them before your content can be checked against brand rules.
            </p>
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 font-medium">Total Reviews</div>
          <div className="text-2xl font-bold text-gray-800 mt-1">{total}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-emerald-600 font-medium">Ready to Submit</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{readyCount}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-amber-600 font-medium">In Review / Checking</div>
          <div className="text-2xl font-bold text-amber-700 mt-1">{inReviewCount}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-green-600 font-medium">Approved</div>
          <div className="text-2xl font-bold text-green-700 mt-1">{approvedCount}</div>
        </div>
      </div>

      {/* Recent submissions */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-gray-800">Recent Submissions</h2>
            <button
              onClick={fetchReviews}
              disabled={loading}
              title="Refresh reviews"
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            {user?.role === 'creator' && (
              <Link
                to="/submit"
                className="text-sm text-nimbus-blue hover:underline font-medium"
              >
                + New Submission
              </Link>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">Filter status:</span>
            {[
              { key: 'all', label: 'All' },
              { key: 'draft', label: 'Draft' },
              { key: 'checking', label: 'Checking' },
              { key: 'ready', label: 'Ready' },
              { key: 'in_review', label: 'In Review' },
              { key: 'changes_requested', label: 'Changes Requested' },
              { key: 'approved', label: 'Approved' },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  statusFilter === f.key
                    ? 'bg-nimbus-navy text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* State rendering */}
        {loading || wakeup ? (
          <div className="p-8">
            <ServerWakeup />
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <AlertCircle className="mx-auto text-red-500 mb-2" size={28} />
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={fetchReviews}
              className="mt-3 text-xs text-nimbus-blue hover:underline font-medium"
            >
              Try again
            </button>
          </div>
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
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase border-b border-gray-100">
                <tr>
                  <th className="px-6 py-3.5 text-left font-semibold">Title</th>
                  <th className="px-6 py-3.5 text-left font-semibold">Status</th>
                  <th className="px-6 py-3.5 text-left font-semibold">Open Issues</th>
                  <th className="px-6 py-3.5 text-left font-semibold">Format</th>
                  <th className="px-6 py-3.5 text-left font-semibold">Updated</th>
                  <th className="px-6 py-3.5 text-right font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reviews.map((r) => {
                  const cfg = STATUS_CONFIG[r.status] || {
                    label: r.status?.replace('_', ' ') || 'Unknown',
                    cls: 'bg-gray-100 text-gray-700',
                  }
                  const counts = r.issue_counts || { high: 0, medium: 0, low: 0, total: 0 }

                  return (
                    <tr key={r.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900 max-w-xs">
                        <Link
                          to={`/review/${r.id}`}
                          className="hover:text-nimbus-blue line-clamp-1 font-semibold"
                        >
                          {r.title}
                        </Link>
                        {r.original_filename && (
                          <span className="text-[11px] text-gray-400 block truncate">
                            📎 {r.original_filename}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.cls}`}
                        >
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {counts.total === 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium">
                            <CheckCircle size={14} /> None
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {counts.high > 0 && (
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-700 border border-red-200">
                                {counts.high} High
                              </span>
                            )}
                            {counts.medium > 0 && (
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                {counts.medium} Med
                              </span>
                            )}
                            {counts.low > 0 && (
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-700 border border-blue-200">
                                {counts.low} Low
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 uppercase font-medium">
                        {r.source_type || r.content_type || 'text'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                        {r.updated_at
                          ? new Date(r.updated_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <Link
                          to={`/review/${r.id}`}
                          className="inline-flex items-center gap-1 text-nimbus-blue hover:text-blue-800 text-xs font-semibold hover:underline"
                        >
                          Workspace <ChevronRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
