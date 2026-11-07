import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { ClipboardCheck, ChevronRight, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'

const STATUS_TABS = [
  { key: 'in_review', label: 'Pending', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { key: 'changes_requested', label: 'Changes Requested', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { key: 'approved', label: 'Approved', color: 'bg-green-100 text-green-800 border-green-300' },
]

function StatusBadge({ status }) {
  const map = {
    in_review: 'bg-amber-100 text-amber-800 border-amber-200',
    approved: 'bg-green-100 text-green-800 border-green-200',
    changes_requested: 'bg-orange-100 text-orange-800 border-orange-200',
  }
  const labels = {
    in_review: 'Pending Review',
    approved: 'Approved',
    changes_requested: 'Changes Requested',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${map[status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
      {labels[status] || status}
    </span>
  )
}

function SeverityPips({ counts }) {
  if (!counts) return <span className="text-gray-400 text-xs">—</span>
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {counts.high > 0 && (
        <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-semibold border border-red-200">
          {counts.high}H
        </span>
      )}
      {counts.medium > 0 && (
        <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold border border-amber-200">
          {counts.medium}M
        </span>
      )}
      {counts.low > 0 && (
        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold border border-blue-200">
          {counts.low}L
        </span>
      )}
      {counts.total === 0 && (
        <span className="text-xs text-gray-400">None</span>
      )}
    </div>
  )
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ApprovalsPage() {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('in_review')
  const [counts, setCounts] = useState({ in_review: 0, changes_requested: 0, approved: 0 })

  const fetchReviews = async () => {
    setLoading(true)
    setError('')
    try {
      const [pendingRes, changesRes, approvedRes] = await Promise.all([
        api.get('/approvals', { params: { status: 'in_review' } }),
        api.get('/approvals', { params: { status: 'changes_requested' } }),
        api.get('/approvals', { params: { status: 'approved' } }),
      ])
      const pending = Array.isArray(pendingRes.data) ? pendingRes.data : []
      const changes = Array.isArray(changesRes.data) ? changesRes.data : []
      const approved = Array.isArray(approvedRes.data) ? approvedRes.data : []
      setCounts({ in_review: pending.length, changes_requested: changes.length, approved: approved.length })
      const all = { in_review: pending, changes_requested: changes, approved }
      setReviews(all)
    } catch (err) {
      setError(err.code === 'ERR_NETWORK'
        ? 'Could not reach the server. It may be starting up — please wait a moment and retry.'
        : 'Could not load review queue. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchReviews() }, [])

  const visibleReviews = Array.isArray(reviews[activeTab]) ? reviews[activeTab] : []

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <ClipboardCheck size={28} className="text-brand-blue" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Review Queue</h1>
            <p className="text-sm text-gray-500">Review submitted content and approve or request changes.</p>
          </div>
        </div>
        <button
          onClick={fetchReviews}
          disabled={loading}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Summary count cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-amber-200 p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-amber-700">{counts.in_review}</div>
          <div className="text-sm text-gray-500 mt-1 font-medium">Pending Review</div>
        </div>
        <div className="bg-white rounded-xl border border-orange-200 p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-orange-600">{counts.changes_requested}</div>
          <div className="text-sm text-gray-500 mt-1 font-medium">Changes Requested</div>
        </div>
        <div className="bg-white rounded-xl border border-green-200 p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-green-700">{counts.approved}</div>
          <div className="text-sm text-gray-500 mt-1 font-medium">Approved</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {STATUS_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors -mb-px border-b-2 ${
              activeTab === key
                ? 'text-brand-blue border-brand-blue bg-blue-50'
                : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {label}
            {counts[key] > 0 && (
              <span className="ml-2 text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded-full font-semibold">
                {counts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="px-6 py-16 flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-blue" />
            <p className="text-sm text-gray-500">Loading review queue…</p>
          </div>
        ) : error ? (
          <div className="px-6 py-12 text-center">
            <AlertTriangle size={36} className="mx-auto text-amber-400 mb-3" />
            <p className="text-gray-600 font-medium">{error}</p>
            <button
              onClick={fetchReviews}
              className="mt-4 text-sm text-brand-blue hover:underline font-medium"
            >
              Try again
            </button>
          </div>
        ) : visibleReviews.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <CheckCircle2 size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">
              {activeTab === 'in_review' ? 'No items waiting for review.' :
               activeTab === 'approved' ? 'No approved reviews yet.' :
               'No reviews with changes requested.'}
            </p>
            <p className="text-gray-400 text-sm mt-1">
              {activeTab === 'in_review' ? 'Check back when creators submit content.' : ''}
            </p>
          </div>
        ) : (
          <>
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 grid grid-cols-12 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <span className="col-span-4">Title</span>
              <span className="col-span-2">Creator</span>
              <span className="col-span-2">Submitted</span>
              <span className="col-span-2">Issues</span>
              <span className="col-span-2 text-right">Action</span>
            </div>
            {visibleReviews.map((r) => (
              <div
                key={r.id}
                className="px-6 py-4 border-b border-gray-100 grid grid-cols-12 items-center hover:bg-gray-50 transition-colors last:border-0"
              >
                <div className="col-span-4 pr-4">
                  <p className="font-semibold text-gray-800 text-sm truncate">{r.title}</p>
                  <StatusBadge status={r.status} />
                </div>
                <div className="col-span-2 text-sm text-gray-600 truncate">
                  {r.creator_name || r.submitted_by || '—'}
                </div>
                <div className="col-span-2 text-sm text-gray-500">
                  {formatDate(r.submitted_at || r.updated_at)}
                </div>
                <div className="col-span-2">
                  <SeverityPips counts={r.issue_counts} />
                </div>
                <div className="col-span-2 text-right">
                  <Link
                    to={`/review/${r.id}`}
                    className="inline-flex items-center gap-1 bg-brand-blue text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Review <ChevronRight size={12} />
                  </Link>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
