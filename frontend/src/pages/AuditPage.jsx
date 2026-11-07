import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { ScrollText, AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react'

const ACTION_LABELS = {
  create_review: 'Review created',
  content_edited: 'Content edited',
  content_updated: 'Content updated',
  issue_accepted: 'Suggestion accepted',
  issue_dismissed: 'Issue dismissed',
  issue_reopened: 'Issue reopened',
  submit_for_approval: 'Submitted for approval',
  approved: 'Review approved',
  changes_requested: 'Changes requested',
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  guideline_created: 'Guideline created',
  guideline_updated: 'Guideline updated',
  guideline_deleted: 'Guideline deleted',
  recheck: 'Re-check triggered',
  delete_review: 'Review deleted',
}

const ACTION_COLORS = {
  create_review: 'bg-blue-100 text-blue-800',
  submit_for_approval: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  changes_requested: 'bg-orange-100 text-orange-800',
  delete: 'bg-red-100 text-red-800',
  delete_review: 'bg-red-100 text-red-800',
  content_edited: 'bg-gray-100 text-gray-700',
  content_updated: 'bg-gray-100 text-gray-700',
}

function ActionBadge({ action }) {
  const label = ACTION_LABELS[action] || action.replace(/_/g, ' ')
  const color = ACTION_COLORS[action] || 'bg-gray-100 text-gray-600'
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${color}`}>
      {label}
    </span>
  )
}

function timeAgo(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const RESOURCE_LABEL = {
  review: 'Review',
  guideline_doc: 'Guideline',
}

export default function AuditPage() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ user: '', action: '', review_id: '' })
  const [pendingFilters, setPendingFilters] = useState({ user: '', action: '', review_id: '' })

  const fetchAudit = async (f = filters) => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (f.user) params.user = f.user
      if (f.action) params.action = f.action
      if (f.review_id) params.review_id = f.review_id
      params.limit = 100
      const res = await api.get('/audit', { params })
      setEntries(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      setError('Could not load audit log.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAudit() }, [])

  const handleSearch = (e) => {
    e.preventDefault()
    setFilters(pendingFilters)
    fetchAudit(pendingFilters)
  }

  const handleClear = () => {
    const empty = { user: '', action: '', review_id: '' }
    setPendingFilters(empty)
    setFilters(empty)
    fetchAudit(empty)
  }

  const isFiltered = filters.user || filters.action || filters.review_id

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ScrollText size={28} className="text-brand-blue" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Audit Log</h1>
            <p className="text-sm text-gray-500">Track all actions across reviews and guidelines.</p>
          </div>
        </div>
        <button
          onClick={() => fetchAudit(filters)}
          disabled={loading}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <form onSubmit={handleSearch} className="mb-5 bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-end shadow-sm">
        <div className="flex-1 min-w-36">
          <label className="block text-xs font-semibold text-gray-600 mb-1">User (name or email)</label>
          <input
            value={pendingFilters.user}
            onChange={e => setPendingFilters(f => ({ ...f, user: e.target.value }))}
            placeholder="Search by user…"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
          />
        </div>
        <div className="flex-1 min-w-36">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Action</label>
          <select
            value={pendingFilters.action}
            onChange={e => setPendingFilters(f => ({ ...f, action: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
          >
            <option value="">All actions</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-36">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Review ID</label>
          <input
            value={pendingFilters.review_id}
            onChange={e => setPendingFilters(f => ({ ...f, review_id: e.target.value }))}
            placeholder="Paste review ID…"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
          />
        </div>
        <div className="flex gap-2 items-center">
          <button
            type="submit"
            className="px-4 py-1.5 bg-brand-blue text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            Search
          </button>
          {isFiltered && (
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Clear
            </button>
          )}
        </div>
      </form>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-blue" />
            <p className="text-sm text-gray-500">Loading audit log…</p>
          </div>
        ) : error ? (
          <div className="py-12 text-center">
            <AlertTriangle size={36} className="mx-auto text-amber-400 mb-3" />
            <p className="text-gray-600">{error}</p>
            <button onClick={() => fetchAudit(filters)} className="mt-3 text-sm text-brand-blue hover:underline">Retry</button>
          </div>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center">
            <ScrollText size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">{isFiltered ? 'No entries match your filters.' : 'No audit events yet.'}</p>
            <p className="text-gray-400 text-sm mt-1">Events will appear here as users take actions.</p>
          </div>
        ) : (
          <>
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 grid grid-cols-12 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <span className="col-span-2">When</span>
              <span className="col-span-2">User</span>
              <span className="col-span-3">Action</span>
              <span className="col-span-2">Resource</span>
              <span className="col-span-3">Detail</span>
            </div>
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="px-6 py-3.5 border-b border-gray-100 grid grid-cols-12 items-start gap-1 hover:bg-gray-50 transition-colors last:border-0 text-sm"
              >
                <div className="col-span-2 text-gray-400 text-xs pt-0.5" title={entry.created_at}>
                  {timeAgo(entry.created_at)}
                </div>
                <div className="col-span-2">
                  <div className="font-medium text-gray-800 truncate">{entry.actor_name || entry.actor_email || '—'}</div>
                  {entry.actor_name && entry.actor_email && (
                    <div className="text-xs text-gray-400 truncate">{entry.actor_email}</div>
                  )}
                </div>
                <div className="col-span-3">
                  <ActionBadge action={entry.action} />
                </div>
                <div className="col-span-2 text-xs text-gray-500">
                  <div className="font-medium">{RESOURCE_LABEL[entry.resource_type] || entry.resource_type}</div>
                  {entry.resource_type === 'review' && (
                    <Link
                      to={`/review/${entry.resource_id}`}
                      className="text-brand-blue hover:underline flex items-center gap-0.5 mt-0.5"
                    >
                      Open <ExternalLink size={10} />
                    </Link>
                  )}
                </div>
                <div className="col-span-3 text-xs text-gray-600 truncate" title={entry.detail || ''}>
                  {entry.detail || <span className="text-gray-300 italic">—</span>}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
