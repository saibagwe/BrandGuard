import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import ServerWakeup from '../components/ServerWakeup'
import IssueBadge from '../components/IssueBadge'
import { ClipboardCheck, ChevronRight } from 'lucide-react'

export default function ApprovalsPage() {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [wakeup, setWakeup] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setWakeup(true), 5000)
    api
      .get('/approvals')
      .then((res) => {
        setReviews(Array.isArray(res.data) ? res.data : res.data.items || [])
      })
      .catch((err) => {
        // Fall back to /reviews filtered by status
        return api
          .get('/reviews', { params: { status: 'in_review' } })
          .then((res2) => {
            const data = Array.isArray(res2.data) ? res2.data : res2.data.items || []
            setReviews(data.filter((r) => ['submitted', 'in_review'].includes(r.status)))
          })
          .catch(() => {
            if (err.code === 'ERR_NETWORK') setWakeup(true)
            else setError('Could not load review queue.')
          })
      })
      .finally(() => {
        clearTimeout(timer)
        setLoading(false)
        setWakeup(false)
      })
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <ClipboardCheck size={28} className="text-brand-blue" />
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Review Queue</h1>
          <p className="text-sm text-gray-500">Content awaiting your review and decision.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading || wakeup ? (
          <ServerWakeup />
        ) : error ? (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">{error}</div>
        ) : reviews.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <ClipboardCheck size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-600 font-medium">No items in the review queue.</p>
            <p className="text-gray-400 text-sm mt-1">Check back when creators submit content for review.</p>
          </div>
        ) : (
          <>
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 grid grid-cols-12 text-xs font-semibold text-gray-500 uppercase">
              <span className="col-span-5">Title</span>
              <span className="col-span-2">Submitted By</span>
              <span className="col-span-2">Date</span>
              <span className="col-span-1">Issues</span>
              <span className="col-span-2 text-right">Action</span>
            </div>
            {reviews.map((r) => (
              <div
                key={r.id}
                className="px-6 py-4 border-b border-gray-100 grid grid-cols-12 items-center hover:bg-gray-50 transition-colors"
              >
                <div className="col-span-5">
                  <p className="font-medium text-gray-800 text-sm truncate pr-4">{r.title}</p>
                  <span className="text-xs inline-block mt-0.5 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">
                    {r.status?.replace('_', ' ')}
                  </span>
                </div>
                <div className="col-span-2 text-sm text-gray-600 truncate">
                  {r.creator_name || r.submitted_by || '—'}
                </div>
                <div className="col-span-2 text-sm text-gray-500">
                  {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                </div>
                <div className="col-span-1">
                  {r.issue_count != null ? (
                    <IssueBadge
                      severity={r.issue_count > 3 ? 'high' : r.issue_count > 0 ? 'medium' : 'low'}
                    />
                  ) : (
                    <span className="text-gray-400 text-sm">—</span>
                  )}
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
