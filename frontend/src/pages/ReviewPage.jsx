import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, getErrorMessage } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import IssueBadge from '../components/IssueBadge'
import ServerWakeup from '../components/ServerWakeup'
import {
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Edit3,
  CheckCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react'

const SEVERITY_HIGHLIGHT = {
  high: 'bg-red-200 border-b-2 border-red-400 cursor-pointer',
  medium: 'bg-yellow-200 border-b-2 border-yellow-400 cursor-pointer',
  low: 'bg-blue-100 border-b-2 border-blue-300 cursor-pointer',
}

const CATEGORY_COLORS = {
  tone: 'bg-purple-100 text-purple-700',
  fact: 'bg-red-100 text-red-700',
  claim: 'bg-orange-100 text-orange-700',
  visual: 'bg-pink-100 text-pink-700',
  accessibility: 'bg-teal-100 text-teal-700',
  compliance: 'bg-gray-100 text-gray-700',
}

function IssueCard({ issue, onAction, isActive, onClick }) {
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState(null)
  const [localStatus, setLocalStatus] = useState(issue.status || 'open')
  const cardRef = useRef(null)

  useEffect(() => {
    if (isActive && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isActive])

  const handleAction = async (action) => {
    setActionLoading(action)
    try {
      await onAction(issue.id, action)
      setLocalStatus(action)
    } finally {
      setActionLoading(null)
    }
  }

  const isDone = localStatus !== 'open'

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      className={`rounded-xl border p-4 mb-3 cursor-pointer transition-all ${
        isActive
          ? 'border-nimbus-blue shadow-md bg-blue-50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      } ${isDone ? 'opacity-60' : ''}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <IssueBadge severity={issue.severity} />
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              CATEGORY_COLORS[issue.category] || 'bg-gray-100 text-gray-600'
            }`}
          >
            {issue.category}
          </span>
          {isDone && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              {localStatus}
            </span>
          )}
        </div>
      </div>

      {/* Message */}
      <p className="text-sm text-gray-700 mb-3 leading-relaxed">{issue.message}</p>

      {/* Suggestion */}
      {issue.suggestion && (
        <div className="mb-3 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <p className="text-xs font-semibold text-green-700 mb-0.5">💡 Suggestion</p>
          <p className="text-xs text-green-800">{issue.suggestion}</p>
        </div>
      )}

      {/* Evidence collapsible */}
      {(issue.evidence || issue.source_doc) && (
        <div className="mb-3">
          <button
            onClick={(e) => { e.stopPropagation(); setEvidenceOpen((p) => !p) }}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            {evidenceOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {evidenceOpen ? 'Hide' : 'Show'} evidence
          </button>
          {evidenceOpen && (
            <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600">
              {issue.source_doc && (
                <p className="font-semibold mb-1 text-gray-700">📄 {issue.source_doc}</p>
              )}
              <p className="italic">{issue.evidence || issue.quote}</p>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {!isDone && (
        <div className="flex gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => handleAction('accepted')}
            disabled={!!actionLoading}
            className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors disabled:opacity-50"
          >
            {actionLoading === 'accepted' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            Accept
          </button>
          <button
            onClick={() => handleAction('edited')}
            disabled={!!actionLoading}
            className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors disabled:opacity-50"
          >
            {actionLoading === 'edited' ? <Loader2 size={12} className="animate-spin" /> : <Edit3 size={12} />}
            Edit
          </button>
          <button
            onClick={() => handleAction('dismissed')}
            disabled={!!actionLoading}
            className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors disabled:opacity-50"
          >
            {actionLoading === 'dismissed' ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}

function highlightContent(content, issues, activeIssueId, onIssueClick) {
  if (!issues || issues.length === 0) {
    return <p className="whitespace-pre-wrap text-gray-800 text-sm leading-relaxed">{content}</p>
  }

  // Build segments with highlights
  let segments = [{ text: content, issueId: null, severity: null }]

  issues.forEach((issue) => {
    if (!issue.span_start && !issue.highlighted_text) return
    const target = issue.highlighted_text || ''
    if (!target) return

    const newSegments = []
    segments.forEach((seg) => {
      if (seg.issueId !== null) {
        newSegments.push(seg)
        return
      }
      const idx = seg.text.indexOf(target)
      if (idx === -1) {
        newSegments.push(seg)
        return
      }
      newSegments.push({ text: seg.text.slice(0, idx), issueId: null, severity: null })
      newSegments.push({ text: target, issueId: issue.id, severity: issue.severity })
      newSegments.push({ text: seg.text.slice(idx + target.length), issueId: null, severity: null })
    })
    segments = newSegments
  })

  return (
    <p className="whitespace-pre-wrap text-gray-800 text-sm leading-relaxed">
      {segments.map((seg, i) =>
        seg.issueId ? (
          <mark
            key={i}
            onClick={() => onIssueClick(seg.issueId)}
            className={`rounded px-0.5 ${SEVERITY_HIGHLIGHT[seg.severity?.toLowerCase()] || SEVERITY_HIGHLIGHT.low} ${
              activeIssueId === seg.issueId ? 'ring-2 ring-offset-1 ring-nimbus-blue' : ''
            }`}
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </p>
  )
}

export default function ReviewPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [review, setReview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [wakeup, setWakeup] = useState(false)
  const [error, setError] = useState('')
  const [activeIssueId, setActiveIssueId] = useState(null)
  const [decisionLoading, setDecisionLoading] = useState(null)
  const [decisionDone, setDecisionDone] = useState('')

  const fetchReview = useCallback(async () => {
    setLoading(true)
    const wakeupTimer = setTimeout(() => setWakeup(true), 5000)
    try {
      const endpoint = id === 'sample' ? '/reviews/sample' : `/reviews/${id}`
      const res = await api.get(endpoint)
      setReview(res.data)
    } catch (err) {
      if (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED') {
        setWakeup(true)
      } else {
        setError(getErrorMessage(err, 'Could not load review.'))
      }
    } finally {
      clearTimeout(wakeupTimer)
      setLoading(false)
      setWakeup(false)
    }
  }, [id])

  useEffect(() => { fetchReview() }, [fetchReview])

  const handleIssueAction = async (issueId, action) => {
    const reviewId = id === 'sample' ? (review?.id || 'sample') : id
    await api.patch(`/reviews/${reviewId}/issues/${issueId}`, { status: action })
  }

  const handleDecision = async (decision) => {
    setDecisionLoading(decision)
    try {
      await api.post(`/reviews/${id}/decision`, { decision })
      setDecisionDone(decision)
      await fetchReview()
    } catch (err) {
      alert(getErrorMessage(err, 'Action failed.'))
    } finally {
      setDecisionLoading(null)
    }
  }

  if (loading || wakeup) {
    return (
      <div className="p-6">
        <ServerWakeup />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <AlertCircle className="mx-auto text-red-400 mb-3" size={32} />
          <p className="text-red-700 font-medium">{error}</p>
          <button onClick={() => navigate(-1)} className="mt-4 text-sm text-nimbus-blue hover:underline">
            ← Go back
          </button>
        </div>
      </div>
    )
  }

  if (!review) return null

  const issues = review.issues || []
  const canDecide = ['manager', 'reviewer'].includes(user?.role) && review.status === 'in_review'

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-lg font-bold text-gray-800 truncate max-w-lg">{review.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-500">
              {review.status?.replace('_', ' ')} ·{' '}
              {review.created_at ? new Date(review.created_at).toLocaleDateString() : ''}
            </span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {issues.length} issue{issues.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {canDecide && !decisionDone && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => handleDecision('approved')}
              disabled={!!decisionLoading}
              className="flex items-center gap-1.5 bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {decisionLoading === 'approved' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              Approve
            </button>
            <button
              onClick={() => handleDecision('changes_requested')}
              disabled={!!decisionLoading}
              className="flex items-center gap-1.5 bg-orange-500 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-orange-600 disabled:opacity-50"
            >
              {decisionLoading === 'changes_requested' ? <Loader2 size={14} className="animate-spin" /> : <AlertCircle size={14} />}
              Request Changes
            </button>
          </div>
        )}

        {decisionDone && (
          <div className="flex items-center gap-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 px-4 py-2 rounded-lg">
            <CheckCircle size={16} />
            {decisionDone === 'approved' ? 'Approved!' : 'Changes Requested'}
          </div>
        )}
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: Content */}
        <div className="w-3/5 overflow-y-auto border-r border-gray-200 p-6 bg-white">
          <div className="mb-4 flex items-center gap-3">
            <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Content</h2>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1"><mark className="bg-red-200 px-1 rounded">■</mark> High</span>
              <span className="flex items-center gap-1"><mark className="bg-yellow-200 px-1 rounded">■</mark> Medium</span>
              <span className="flex items-center gap-1"><mark className="bg-blue-100 px-1 rounded">■</mark> Low</span>
            </div>
          </div>
          <div className="prose prose-sm max-w-none">
            {highlightContent(review.content, issues, activeIssueId, setActiveIssueId)}
          </div>
        </div>

        {/* RIGHT: Issues */}
        <div className="w-2/5 overflow-y-auto p-4 bg-gray-50">
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-4 px-1">
            Issues ({issues.length})
          </h2>
          {issues.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle size={36} className="mx-auto text-green-400 mb-3" />
              <p className="text-gray-500 text-sm font-medium">No issues found!</p>
              <p className="text-gray-400 text-xs mt-1">This content looks brand-compliant.</p>
            </div>
          ) : (
            issues.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                onAction={handleIssueAction}
                isActive={activeIssueId === issue.id}
                onClick={() => setActiveIssueId(issue.id === activeIssueId ? null : issue.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
