import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, getErrorMessage } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import IssueBadge from '../components/IssueBadge'
import ServerWakeup from '../components/ServerWakeup'
import { buildHighlightSegments } from '../utils/highlights'
import {
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Edit3,
  CheckCircle,
  AlertCircle,
  Loader2,
  AlertTriangle,
  Send,
  RefreshCw,
  Copy,
  Download,
  Clock,
  RotateCcw,
  History,
  FileCheck,
  Save,
  MessageSquare,
  Lock,
} from 'lucide-react'

// ─── Styling definitions ──────────────────────────────────────────────────────

const SEVERITY_HIGHLIGHT = {
  high:   'bg-red-200 text-red-950 border-b-2 border-red-500 cursor-pointer underline underline-offset-2 decoration-red-500 font-medium',
  medium: 'bg-amber-200 text-amber-950 border-b-2 border-amber-500 cursor-pointer underline underline-offset-2 decoration-amber-500 font-medium',
  low:    'bg-blue-100 text-blue-950 border-b-2 border-blue-400 cursor-pointer underline underline-offset-2 decoration-blue-400 font-medium',
}

const SEVERITY_ACTIVE_RING = {
  high:   'ring-2 ring-offset-1 ring-red-600 bg-red-300',
  medium: 'ring-2 ring-offset-1 ring-amber-600 bg-amber-300',
  low:    'ring-2 ring-offset-1 ring-blue-600 bg-blue-200',
}

const CATEGORY_COLORS = {
  tone:          'bg-purple-100 text-purple-700',
  fact:          'bg-red-100 text-red-700',
  claim:         'bg-orange-100 text-orange-700',
  visual:        'bg-pink-100 text-pink-700',
  accessibility: 'bg-teal-100 text-teal-700',
}

// ─── Progress Panel (while checking) ──────────────────────────────────────────

function ProgressPanel({ progress, elapsedSeconds, onRetry }) {
  const checks = [
    { key: 'tone', label: 'Brand Voice & Tone' },
    { key: 'facts', label: 'Approved Facts Verification' },
    { key: 'claims', label: 'Superlative & Comparative Claims' },
    { key: 'accessibility', label: 'Inclusive & Accessible Language' },
    { key: 'visual', label: 'Visual & Layout Standards' },
  ]

  const isTimedOut = elapsedSeconds >= 90

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Loader2 className="animate-spin text-nimbus-blue" size={20} />
          <h3 className="text-sm font-bold text-indigo-950">AI Brand Analysis in Progress…</h3>
        </div>
        <span className="text-xs font-mono text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
          {elapsedSeconds}s
        </span>
      </div>

      <div className="space-y-2 mt-3">
        {checks.map(({ key, label }) => {
          const state = progress?.[key] || 'pending'
          return (
            <div
              key={key}
              className="flex items-center justify-between text-xs bg-white/70 px-3 py-2 rounded-lg border border-indigo-100"
            >
              <span className="font-medium text-gray-700">{label}</span>
              <div className="flex items-center gap-1.5">
                {state === 'pending' && <span className="text-gray-400">Waiting…</span>}
                {state === 'running' && (
                  <span className="text-indigo-600 font-semibold flex items-center gap-1">
                    <Loader2 size={12} className="animate-spin" /> Running
                  </span>
                )}
                {state === 'done' && (
                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                    <Check size={13} /> Done
                  </span>
                )}
                {state === 'failed' && (
                  <span className="text-amber-600 text-[11px] font-medium bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                    this check could not run
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {isTimedOut && (
        <div className="mt-4 pt-3 border-t border-indigo-200 flex items-center justify-between">
          <p className="text-xs text-indigo-900">
            Checks are taking longer than normal (over 90 seconds).
          </p>
          <button
            onClick={onRetry}
            className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-sm"
          >
            <RefreshCw size={12} /> Retry Checks
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Issue Card Component ─────────────────────────────────────────────────────

function IssueCard({
  issue,
  content,
  onAccept,
  onDismiss,
  onReopen,
  isActive,
  onClick,
  registerRef,
  isLocked,
}) {
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editText, setEditText] = useState(issue.suggestion || '')
  const [dismissReasonOpen, setDismissReasonOpen] = useState(false)
  const [dismissReason, setDismissReason] = useState('')
  const [actionLoading, setActionLoading] = useState(null)
  const cardRef = useRef(null)

  useEffect(() => {
    if (registerRef) registerRef(cardRef.current)
    return () => {
      if (registerRef) registerRef(null)
    }
  }, [registerRef])

  useEffect(() => {
    if (isActive && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isActive])

  const handleAccept = async (replacement) => {
    setActionLoading('accept')
    try {
      await onAccept(issue.id, replacement)
      setEditMode(false)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDismiss = async () => {
    setActionLoading('dismiss')
    try {
      await onDismiss(issue.id, dismissReason)
      setDismissReasonOpen(false)
    } finally {
      setActionLoading(null)
    }
  }

  const handleReopen = async () => {
    setActionLoading('reopen')
    try {
      await onReopen(issue.id)
    } finally {
      setActionLoading(null)
    }
  }

  // Determine original quote
  let originalQuote = ''
  if (
    issue.location &&
    issue.location.start != null &&
    issue.location.end != null &&
    content &&
    issue.location.start >= 0 &&
    issue.location.end <= content.length
  ) {
    originalQuote = content.slice(issue.location.start, issue.location.end)
  }

  const ev = issue.evidence
  const isDismissed = issue.status === 'dismissed'
  const isAccepted = issue.status === 'accepted' || issue.status === 'edited'

  return (
    <div
      ref={cardRef}
      tabIndex={0}
      onClick={onClick}
      className={`rounded-xl border p-4 mb-3 cursor-pointer transition-all outline-none ${
        isActive
          ? 'border-nimbus-blue shadow-md bg-blue-50/70 ring-2 ring-nimbus-blue'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
      } ${isDismissed || isAccepted ? 'opacity-70 bg-gray-50/80' : ''}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <IssueBadge severity={issue.severity} />
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              CATEGORY_COLORS[issue.category] || 'bg-gray-100 text-gray-700'
            }`}
          >
            {issue.category}
          </span>
          {issue.status !== 'open' && (
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                issue.status === 'dismissed'
                  ? 'bg-gray-200 text-gray-700'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {issue.status}
            </span>
          )}
          {!issue.location && (
            <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded italic">
              list-only
            </span>
          )}
        </div>
      </div>

      {/* Message */}
      <p className="text-sm text-gray-800 mb-3 leading-relaxed font-normal">{issue.message}</p>

      {/* Suggested Fix: old text -> new text */}
      {issue.suggestion && !editMode && (
        <div className="mb-3 bg-emerald-50/70 border border-emerald-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-emerald-900 mb-1.5 flex items-center gap-1">
            💡 Suggested Fix
          </p>
          <div className="text-xs flex items-center gap-2 flex-wrap">
            {originalQuote && (
              <span className="line-through text-red-700 bg-red-100/80 px-2 py-0.5 rounded font-mono">
                {originalQuote}
              </span>
            )}
            {originalQuote && <span className="text-gray-400 font-bold">→</span>}
            <span className="text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded font-medium">
              {issue.suggestion}
            </span>
          </div>
        </div>
      )}

      {/* Inline Edit Replacement Field */}
      {editMode && (
        <div className="mb-3 bg-blue-50 border border-blue-200 rounded-lg p-3" onClick={(e) => e.stopPropagation()}>
          <label className="text-xs font-semibold text-blue-900 mb-1 block">
            Custom Replacement Text
          </label>
          <textarea
            rows={2}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full text-xs border border-blue-300 rounded p-2 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => handleAccept(editText)}
              disabled={actionLoading === 'accept'}
              className="text-xs font-semibold px-3 py-1 rounded bg-nimbus-blue text-white hover:bg-blue-700 flex items-center gap-1"
            >
              {actionLoading === 'accept' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Apply & Replace
            </button>
            <button
              onClick={() => setEditMode(false)}
              className="text-xs text-gray-500 hover:text-gray-700 px-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Dismiss Reason Form */}
      {dismissReasonOpen && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg p-3" onClick={(e) => e.stopPropagation()}>
          <label className="text-xs font-semibold text-amber-900 mb-1 block">
            Reason for dismissal (optional)
          </label>
          <input
            type="text"
            value={dismissReason}
            onChange={(e) => setDismissReason(e.target.value)}
            placeholder="e.g. Approved exception by compliance, intentional style"
            className="w-full text-xs border border-amber-300 rounded p-1.5 focus:outline-none bg-white mb-2"
          />
          <div className="flex gap-2">
            <button
              onClick={handleDismiss}
              disabled={actionLoading === 'dismiss'}
              className="text-xs font-semibold px-3 py-1 rounded bg-amber-700 text-white hover:bg-amber-800 flex items-center gap-1"
            >
              {actionLoading === 'dismiss' ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
              Confirm Dismissal
            </button>
            <button
              onClick={() => setDismissReasonOpen(false)}
              className="text-xs text-gray-500 hover:text-gray-700 px-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Evidence Collapsible */}
      <div className="mb-2">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setEvidenceOpen((p) => !p)
          }}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 font-medium"
        >
          {evidenceOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {evidenceOpen ? 'Hide' : 'Show'} guideline evidence
        </button>

        {evidenceOpen && (
          <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-xs text-gray-600 space-y-1">
            {ev?.source_doc ? (
              <p className="font-semibold text-gray-800">📄 Source: {ev.source_doc}</p>
            ) : (
              <p className="text-amber-700 font-medium italic">No approved source found</p>
            )}
            {ev?.quote ? (
              <blockquote className="italic border-l-2 border-gray-300 pl-2 text-gray-700">
                &ldquo;{ev.quote}&rdquo;
              </blockquote>
            ) : (
              <p className="text-gray-400 italic">No quoted rule available.</p>
            )}
            {ev?.rule_id && (
              <p className="text-gray-400 font-mono text-[11px]">Rule ID: {ev.rule_id}</p>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {!isLocked && (
        <div className="flex gap-2 pt-2 border-t border-gray-100 flex-wrap" onClick={(e) => e.stopPropagation()}>
          {issue.status === 'open' && (
            <>
              {issue.location && (
                <button
                  onClick={() => handleAccept(issue.suggestion)}
                  disabled={actionLoading === 'accept'}
                  className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors"
                  title="Accept suggestion and replace text"
                >
                  {actionLoading === 'accept' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Accept
                </button>
              )}
              {issue.location && (
                <button
                  onClick={() => {
                    setEditText(issue.suggestion || originalQuote || '')
                    setEditMode(true)
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors"
                  title="Customize replacement text"
                >
                  <Edit3 size={12} />
                  Edit
                </button>
              )}
              <button
                onClick={() => setDismissReasonOpen(true)}
                disabled={actionLoading === 'dismiss'}
                className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                title="Dismiss this issue"
              >
                <X size={12} />
                Dismiss
              </button>
            </>
          )}

          {isDismissed && (
            <button
              onClick={handleReopen}
              disabled={actionLoading === 'reopen'}
              className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-blue-50 text-nimbus-blue hover:bg-blue-100 transition-colors"
              title="Reopen dismissed issue"
            >
              {actionLoading === 'reopen' ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
              Reopen Issue
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main ReviewPage Workspace ────────────────────────────────────────────────

export default function ReviewPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [review, setReview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [wakeup, setWakeup] = useState(false)
  const [error, setError] = useState('')

  // Workspace modes
  const [isEditMode, setIsEditMode] = useState(false)
  const [editTextContent, setEditTextContent] = useState('')
  const [saveLoading, setSaveLoading] = useState(false)
  const [activeIssueId, setActiveIssueId] = useState(null)

  // Filters
  const [activeSeverityFilter, setActiveSeverityFilter] = useState(null)
  const [activeCategoryFilter, setActiveCategoryFilter] = useState(null)
  const [statusFilter, setStatusFilter] = useState('open') // 'open' | 'accepted' | 'dismissed' | 'all'

  // Submission & Confirmation modal states
  const [submitLoading, setSubmitLoading] = useState(false)
  const [highConfirmOpen, setHighConfirmOpen] = useState(false)
  const [recheckLoading, setRecheckLoading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)

  // Elapsed polling timer for background checks
  const [checkingElapsed, setCheckingElapsed] = useState(0)

  const cardRefs = useRef({})

  // Fetch Review Data
  const fetchReview = useCallback(async () => {
    try {
      const endpoint = id === 'sample' ? '/reviews/sample' : `/reviews/${id}`
      const res = await api.get(endpoint)
      setReview(res.data)
      setEditTextContent(res.data.content_text || '')
    } catch (err) {
      if (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED') {
        setWakeup(true)
      } else {
        setError(getErrorMessage(err, 'Failed to load review.'))
      }
    } finally {
      setLoading(false)
      setWakeup(false)
    }
  }, [id])

  useEffect(() => {
    fetchReview()
  }, [fetchReview])

  // Polling while status === 'checking'
  useEffect(() => {
    if (!review || review.status !== 'checking') {
      setCheckingElapsed(0)
      return
    }

    const interval = setInterval(() => {
      setCheckingElapsed((prev) => prev + 2)
      fetchReview()
    }, 2000)

    return () => clearInterval(interval)
  }, [review?.status, fetchReview])

  // ── Action Handlers ──

  const handleRecheck = async () => {
    setRecheckLoading(true)
    setError('')
    try {
      const res = await api.post(`/reviews/${review.id}/recheck`)
      setReview(res.data)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not start re-check.'))
    } finally {
      setRecheckLoading(false)
    }
  }

  const handleSaveTextContent = async () => {
    if (!editTextContent.trim()) {
      alert('Content cannot be empty.')
      return
    }
    setSaveLoading(true)
    setError('')
    try {
      // 1. Save new content
      await api.put(`/reviews/${review.id}/content`, { text: editTextContent.trim() })
      // 2. Automatically trigger a re-check
      const res = await api.post(`/reviews/${review.id}/recheck`)
      setReview(res.data)
      setIsEditMode(false)
    } catch (err) {
      alert(getErrorMessage(err, 'Failed to update content.'))
    } finally {
      setSaveLoading(false)
    }
  }

  const handleCancelEdit = () => {
    if (editTextContent !== review.content_text) {
      const confirmed = window.confirm('You have unsaved changes. Discard changes?')
      if (!confirmed) return
    }
    setEditTextContent(review.content_text || '')
    setIsEditMode(false)
  }

  const handleAcceptIssue = async (issueId, customReplacement) => {
    setError('')
    try {
      const payload = customReplacement != null ? { replacement: customReplacement } : {}
      const res = await api.post(`/reviews/${review.id}/issues/${issueId}/accept`, payload)
      setReview(res.data)
      setEditTextContent(res.data.content_text || '')
    } catch (err) {
      alert(getErrorMessage(err, 'Could not accept fix.'))
    }
  }

  const handleDismissIssue = async (issueId, reason) => {
    setError('')
    try {
      const res = await api.post(`/reviews/${review.id}/issues/${issueId}/dismiss`, {
        reason: reason || undefined,
      })
      setReview(res.data)
    } catch (err) {
      alert(getErrorMessage(err, 'Could not dismiss issue.'))
    }
  }

  const handleReopenIssue = async (issueId) => {
    setError('')
    try {
      const res = await api.post(`/reviews/${review.id}/issues/${issueId}/reopen`)
      setReview(res.data)
    } catch (err) {
      alert(getErrorMessage(err, 'Could not reopen issue.'))
    }
  }

  const handleSubmitForApproval = async (confirmHigh = false) => {
    setSubmitLoading(true)
    setError('')
    try {
      const res = await api.post(`/reviews/${review.id}/submit`, {
        confirm_high: confirmHigh,
      })
      setReview(res.data)
      setHighConfirmOpen(false)
    } catch (err) {
      if (err.response?.status === 409) {
        const code = err.response.data?.code
        if (code === 'stale') {
          // Stale: prompt to re-check
          const doRecheck = window.confirm(
            'The content has been modified since the last check. Would you like to run a re-check now?'
          )
          if (doRecheck) {
            await handleRecheck()
          }
        } else if (code === 'high_open') {
          // Open high severity issues confirmation
          setHighConfirmOpen(true)
        } else {
          alert(getErrorMessage(err, 'Submission conflict.'))
        }
      } else {
        alert(getErrorMessage(err, 'Could not submit review for approval.'))
      }
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleCopyText = async () => {
    if (!review?.content_text) return
    try {
      await navigator.clipboard.writeText(review.content_text)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch {
      alert('Could not copy text to clipboard.')
    }
  }

  const handleExport = (format) => {
    window.open(`/api/reviews/${review.id}/export?format=${format}`, '_blank')
  }

  // ── Highlight click / Linking handlers ──
  const handleSpanClick = (issueId) => {
    setActiveIssueId((prev) => (prev === issueId ? null : issueId))
    const cardEl = cardRefs.current[issueId]
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      cardEl.focus()
    }
  }

  const handleCardClick = (issueId) => {
    const nextId = issueId === activeIssueId ? null : issueId
    setActiveIssueId(nextId)
    if (nextId) {
      const spanEl = document.querySelector(`mark[data-issue-id="${nextId}"]`)
      if (spanEl) {
        spanEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }

  // ── Loading & Error states ──
  if (loading || wakeup) {
    return (
      <div className="p-8">
        {wakeup ? (
          <ServerWakeup />
        ) : (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="animate-spin text-nimbus-blue" size={36} />
            <p className="text-gray-500 text-sm font-medium">Loading review workspace…</p>
          </div>
        )}
      </div>
    )
  }

  if (error || !review) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center">
        <AlertCircle size={36} className="text-red-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-gray-800">Error Loading Review</h2>
        <p className="text-sm text-red-600 mt-1">{error || 'Review could not be found.'}</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="mt-4 text-sm text-nimbus-blue hover:underline font-medium"
        >
          ← Return to Dashboard
        </button>
      </div>
    )
  }

  // State flags
  const isChecking = review.status === 'checking'
  const isLocked = ['in_review', 'approved'].includes(review.status)
  const isApproved = review.status === 'approved'
  const isChangesRequested = review.status === 'changes_requested'
  const isStale = review.is_stale || (review.checked_version !== review.content_version)
  const allIssues = review.issues || []

  // Filter issues
  const filteredIssues = allIssues.filter((iss) => {
    // Status filter
    if (statusFilter === 'open' && iss.status !== 'open') return false
    if (statusFilter === 'accepted' && !['accepted', 'edited'].includes(iss.status)) return false
    if (statusFilter === 'dismissed' && iss.status !== 'dismissed') return false

    // Severity filter
    if (activeSeverityFilter && iss.severity !== activeSeverityFilter) return false

    // Category filter
    if (activeCategoryFilter && iss.category !== activeCategoryFilter) return false

    return true
  })

  // Open High Issues (for confirmation modal)
  const openHighIssues = allIssues.filter((i) => i.severity === 'high' && i.status === 'open')

  // Highlights generator
  const highlightSegments = buildHighlightSegments(review.content_text, allIssues)

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* ── TOP HEADER BAR ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 shadow-sm">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900 truncate">{review.title}</h1>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                review.status === 'approved'
                  ? 'bg-green-100 text-green-800 border border-green-300'
                  : review.status === 'in_review'
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : review.status === 'changes_requested'
                  ? 'bg-orange-100 text-orange-800 border border-orange-300'
                  : review.status === 'checking'
                  ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                  : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
              }`}
            >
              {review.status?.replace('_', ' ')}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
            <span>Format: {review.source_type?.toUpperCase() || 'TEXT'}</span>
            <span>·</span>
            <span>Version {review.content_version}</span>
            <span>·</span>
            <span>Last checked: {review.checked_version ? `v${review.checked_version}` : 'Never'}</span>
            {review.original_filename && (
              <>
                <span>·</span>
                <span className="truncate max-w-xs">File: {review.original_filename}</span>
              </>
            )}
          </div>
        </div>

        {/* Top actions */}
        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          {/* History Button */}
          <button
            onClick={() => setShowHistory((p) => !p)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            title="View approval and review history"
          >
            <History size={14} />
            History
          </button>

          {/* Re-check Button */}
          {!isLocked && (
            <button
              onClick={handleRecheck}
              disabled={isChecking || recheckLoading}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw size={14} className={isChecking || recheckLoading ? 'animate-spin' : ''} />
              Re-check
            </button>
          )}

          {/* Submit for Approval Button */}
          {!isLocked && (
            <button
              onClick={() => handleSubmitForApproval(false)}
              disabled={isChecking || submitLoading}
              className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg bg-nimbus-blue hover:bg-blue-700 text-white shadow-sm transition-colors disabled:opacity-50"
            >
              {submitLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
              {isChangesRequested ? 'Resubmit for Approval' : 'Send for Approval'}
            </button>
          )}

          {/* Waiting for review indicator */}
          {review.status === 'in_review' && (
            <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
              <Clock size={14} />
              Waiting for Reviewer Approval
            </div>
          )}

          {/* Approved Actions */}
          {isApproved && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyText}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Copy size={13} />
                {copySuccess ? 'Copied!' : 'Copy Text'}
              </button>
              <button
                onClick={() => handleExport('txt')}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700"
              >
                <Download size={13} />
                Download .txt
              </button>
              <button
                onClick={() => handleExport('docx')}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700"
              >
                <Download size={13} />
                Download .docx
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── BANNERS ── */}

      {/* Outcome State: Changes Requested */}
      {isChangesRequested && (
        <div className="bg-orange-50 border-b border-orange-200 px-6 py-3 flex items-start gap-3">
          <AlertCircle className="text-orange-600 shrink-0 mt-0.5" size={18} />
          <div className="flex-1">
            <h4 className="text-xs font-bold text-orange-950 uppercase tracking-wide">
              Changes Requested by Reviewer
            </h4>
            <p className="text-xs text-orange-900 mt-0.5 font-medium">
              &ldquo;{review.latest_reviewer_comment || 'Please address open issues and resubmit for approval.'}&rdquo;
            </p>
          </div>
        </div>
      )}

      {/* Outcome State: Approved */}
      {isApproved && (
        <div className="bg-green-50 border-b border-green-200 px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="text-green-600 shrink-0" size={18} />
            <p className="text-xs font-bold text-green-950">
              Content Approved! Your submission meets all brand guidelines and compliance standards.
            </p>
          </div>
          <span className="text-[11px] text-green-800">Ready for distribution</span>
        </div>
      )}

      {/* Stale Banner: content modified since last check */}
      {isStale && !isChecking && !isLocked && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-amber-600 shrink-0" size={16} />
            <span className="text-xs font-semibold text-amber-900">
              Report is out of date: content was modified (v{review.content_version}) since last check (v{review.checked_version || 0}).
            </span>
          </div>
          <button
            onClick={handleRecheck}
            disabled={recheckLoading}
            className="text-xs font-bold px-3 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white transition-colors"
          >
            One-Click Re-Check
          </button>
        </div>
      )}

      {/* Missing Guidelines Banner */}
      {review.no_guidelines && (
        <div className="bg-blue-50 border-b border-blue-200 px-6 py-2.5 flex items-center gap-2 text-xs text-blue-900">
          <AlertCircle size={16} className="text-blue-600 shrink-0" />
          <span>
            No brand guidelines exist yet. Content checks cannot be evaluated until a Reviewer adds guidelines.
          </span>
        </div>
      )}

      {/* ── SUMMARY & FILTER BAR ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-2.5 flex items-center justify-between gap-4 flex-wrap shrink-0">
        {/* Status filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mr-1">Status:</span>
          {['open', 'accepted', 'dismissed', 'all'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-colors capitalize ${
                statusFilter === st
                  ? 'bg-nimbus-navy text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Severity / Category Filter Chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mr-1">Severity:</span>
          {['high', 'medium', 'low'].map((sev) => {
            const count = allIssues.filter((i) => i.severity === sev && i.status === 'open').length
            const isSelected = activeSeverityFilter === sev
            return (
              <button
                key={sev}
                onClick={() => setActiveSeverityFilter(isSelected ? null : sev)}
                className={`text-xs px-2.5 py-0.5 rounded-full font-bold border transition-colors capitalize ${
                  sev === 'high'
                    ? isSelected
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                    : sev === 'medium'
                    ? isSelected
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                    : isSelected
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                }`}
              >
                {count} {sev}
              </button>
            )
          })}

          {(activeSeverityFilter || activeCategoryFilter) && (
            <button
              onClick={() => {
                setActiveSeverityFilter(null)
                setActiveCategoryFilter(null)
              }}
              className="text-xs text-gray-500 hover:text-gray-800 underline ml-2"
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      {/* ── WORKSPACE TWO-COLUMN / STACKED CONTENT ── */}
      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        {/* LEFT COLUMN: DOCUMENT CONTENT */}
        <div className="md:w-3/5 flex flex-col border-b md:border-b-0 md:border-r border-gray-200 bg-white overflow-hidden">
          {/* Content Pane Header */}
          <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between gap-3 shrink-0 bg-gray-50/50">
            <div className="flex items-center gap-2">
              <FileCheck size={16} className="text-gray-500" />
              <h2 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                Document Content
              </h2>
            </div>

            {!isLocked && (
              <div>
                {!isEditMode ? (
                  <button
                    onClick={() => setIsEditMode(true)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-nimbus-blue hover:text-blue-700 hover:underline"
                  >
                    <Edit3 size={13} />
                    Edit text
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSaveTextContent}
                      disabled={saveLoading}
                      className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded bg-nimbus-blue hover:bg-blue-700 text-white transition-colors"
                    >
                      {saveLoading ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                      Save & Re-check
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      disabled={saveLoading}
                      className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Content Body */}
          <div className="p-6 overflow-y-auto flex-1 font-sans text-sm leading-relaxed">
            {isEditMode ? (
              <div className="h-full flex flex-col space-y-2">
                <textarea
                  value={editTextContent}
                  onChange={(e) => setEditTextContent(e.target.value)}
                  className="w-full h-full min-h-[400px] border border-gray-300 rounded-lg p-4 font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-nimbus-blue resize-y"
                  placeholder="Edit content text…"
                />
                <p className="text-xs text-gray-400">
                  Saving will increment content version and automatically re-run checks.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="whitespace-pre-wrap text-gray-800 leading-relaxed text-sm">
                  {highlightSegments.map((seg, idx) => {
                    if (!seg.issueId) {
                      return <span key={idx}>{seg.text}</span>
                    }

                    const isActive = seg.issueId === activeIssueId
                    const sev = (seg.severity || 'low').toLowerCase()

                    return (
                      <mark
                        key={idx}
                        data-issue-id={seg.issueId}
                        onClick={() => handleSpanClick(seg.issueId)}
                        className={`rounded px-1 py-0.5 inline-block ${
                          SEVERITY_HIGHLIGHT[sev] || SEVERITY_HIGHLIGHT.low
                        } ${
                          isActive ? SEVERITY_ACTIVE_RING[sev] || SEVERITY_ACTIVE_RING.low : ''
                        }`}
                        title={`Click to view issue (${sev.toUpperCase()})`}
                      >
                        {seg.text}
                        {/* Non-colour-only accessible badge */}
                        <span className="inline-block text-[9px] font-bold uppercase tracking-wider px-1 mx-1 rounded bg-white/90 border border-current align-baseline select-none">
                          {sev}
                        </span>
                      </mark>
                    )
                  })}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: ISSUES & PROGRESS */}
        <div className="md:w-2/5 flex flex-col bg-gray-50 overflow-hidden">
          {/* Issues Header */}
          <div className="px-6 py-3 border-b border-gray-200 bg-white/70 flex items-center justify-between gap-3 shrink-0">
            <h2 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              AI Issues Report ({filteredIssues.length} of {allIssues.length})
            </h2>
            {activeIssueId && (
              <button
                onClick={() => setActiveIssueId(null)}
                className="text-xs text-nimbus-blue hover:underline"
              >
                Clear active selection
              </button>
            )}
          </div>

          <div className="p-4 overflow-y-auto flex-1">
            {/* Background Checking Progress Banner */}
            {isChecking && (
              <ProgressPanel
                progress={review.progress}
                elapsedSeconds={checkingElapsed}
                onRetry={handleRecheck}
              />
            )}

            {/* Empty Issues State */}
            {allIssues.length === 0 && !isChecking ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center my-6">
                <CheckCircle size={36} className="text-emerald-500 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-gray-800">No Brand Issues Detected!</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Your content complies with all active brand guidelines, approved facts, and terminology rules.
                </p>
              </div>
            ) : filteredIssues.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center my-6">
                <p className="text-xs text-gray-500">No issues match the selected filter criteria.</p>
                <button
                  onClick={() => {
                    setStatusFilter('all')
                    setActiveSeverityFilter(null)
                    setActiveCategoryFilter(null)
                  }}
                  className="mt-2 text-xs font-semibold text-nimbus-blue hover:underline"
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              filteredIssues.map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  content={review.content_text}
                  onAccept={handleAcceptIssue}
                  onDismiss={handleDismissIssue}
                  onReopen={handleReopenIssue}
                  isActive={activeIssueId === issue.id}
                  onClick={() => handleCardClick(issue.id)}
                  registerRef={(el) => {
                    cardRefs.current[issue.id] = el
                  }}
                  isLocked={isLocked}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── HIGH ISSUES CONFIRMATION MODAL ── */}
      {highConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-red-200 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle size={24} />
              <h3 className="text-base font-bold text-gray-900">
                Confirm High-Severity Submission
              </h3>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              You are about to submit content for approval while{' '}
              <strong className="text-red-700">{openHighIssues.length} HIGH-severity issue(s)</strong> remain open:
            </p>
            <div className="max-h-48 overflow-y-auto space-y-2 bg-red-50/60 p-3 rounded-lg border border-red-200">
              {openHighIssues.map((iss) => (
                <div key={iss.id} className="text-xs text-gray-800">
                  <span className="font-semibold text-red-700 uppercase mr-1">[{iss.category}]</span>
                  {iss.message}
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              Submitting with high severity issues may cause brand review rejection. Are you sure you wish to continue?
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setHighConfirmOpen(false)}
                className="text-xs font-medium text-gray-600 hover:text-gray-800 px-3 py-2"
              >
                Cancel & Fix
              </button>
              <button
                onClick={() => handleSubmitForApproval(true)}
                disabled={submitLoading}
                className="text-xs font-bold px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-sm flex items-center gap-1"
              >
                {submitLoading && <Loader2 size={12} className="animate-spin" />}
                Yes, Confirm & Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── HISTORY TIMELINE SLIDEOVER / MODAL ── */}
      {showHistory && (
        <div className="fixed inset-0 z-50 bg-black/30 flex justify-end">
          <div className="bg-white w-full max-w-sm h-full p-6 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <History size={18} className="text-nimbus-blue" />
                <h3 className="text-sm font-bold text-gray-800">Review & Approval History</h3>
              </div>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              {(!review.approval_history || review.approval_history.length === 0) ? (
                <p className="text-xs text-gray-400 italic">No approval actions recorded yet.</p>
              ) : (
                review.approval_history.map((item, idx) => (
                  <div key={idx} className="border-l-2 border-nimbus-blue pl-3 py-1 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-gray-800 capitalize">
                        {item.action?.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(item.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    {item.comment && (
                      <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                        &ldquo;{item.comment}&rdquo;
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
