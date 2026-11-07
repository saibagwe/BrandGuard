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
  AlertTriangle,
  Send,
  Eye,
  EyeOff,
} from 'lucide-react'

// ─── Colour tokens ────────────────────────────────────────────────────────────

const SEVERITY_HIGHLIGHT = {
  high:   'bg-red-200 text-red-950 border-b-2 border-red-500 cursor-pointer underline underline-offset-2 decoration-red-500 font-medium',
  medium: 'bg-yellow-200 text-yellow-950 border-b-2 border-yellow-500 cursor-pointer underline underline-offset-2 decoration-yellow-500 font-medium',
  low:    'bg-blue-100 text-blue-950 border-b-2 border-blue-400 cursor-pointer underline underline-offset-2 decoration-blue-400 font-medium',
}

const SEVERITY_ACTIVE_RING = {
  high:   'ring-2 ring-offset-1 ring-red-600 bg-red-300',
  medium: 'ring-2 ring-offset-1 ring-yellow-600 bg-yellow-300',
  low:    'ring-2 ring-offset-1 ring-blue-600 bg-blue-200',
}

const CATEGORY_COLORS = {
  tone:          'bg-purple-100 text-purple-700',
  fact:          'bg-red-100    text-red-700',
  claim:         'bg-orange-100 text-orange-700',
  visual:        'bg-pink-100   text-pink-700',
  accessibility: 'bg-teal-100   text-teal-700',
}

// ─── Highlight engine ─────────────────────────────────────────────────────────

/**
 * Build highlighted content from character-offset issues.
 * Handles overlaps safely by giving priority to higher-severity issues.
 * Null-location issues appear in the sidebar list only.
 */
function buildHighlightedContent(content, issues, activeIssueId, onSpanClick) {
  if (!content) return null

  // Keep only active/open issues with valid start/end (dismissed issues hide from highlights)
  const located = issues.filter(
    (iss) =>
      iss.location &&
      iss.location.start != null &&
      iss.location.end != null &&
      iss.location.start < iss.location.end &&
      iss.location.start >= 0 &&
      iss.location.end <= content.length &&
      iss.status !== 'dismissed'
  )

  if (located.length === 0) {
    return (
      <p className="whitespace-pre-wrap text-gray-800 text-sm leading-relaxed">
        {content}
      </p>
    )
  }

  // Severity ordering for overlap resolution
  const sevOrder = { high: 3, medium: 2, low: 1 }

  // Build a char -> issue map (higher severity wins on overlap)
  const charMap = new Map() // charIndex -> { issueId, severity }
  for (const iss of located) {
    const { start, end } = iss.location
    for (let c = start; c < end; c++) {
      const existing = charMap.get(c)
      if (!existing || (sevOrder[iss.severity] || 0) > (sevOrder[existing.severity] || 0)) {
        charMap.set(c, { issueId: iss.id, severity: iss.severity })
      }
    }
  }

  // Build run-length encoded segments
  const segments = []
  let i = 0
  while (i < content.length) {
    const cell = charMap.get(i)
    if (!cell) {
      let j = i + 1
      while (j < content.length && !charMap.get(j)) j++
      segments.push({ text: content.slice(i, j), issueId: null, severity: null })
      i = j
    } else {
      let j = i + 1
      while (j < content.length) {
        const next = charMap.get(j)
        if (!next || next.issueId !== cell.issueId) break
        j++
      }
      segments.push({ text: content.slice(i, j), issueId: cell.issueId, severity: cell.severity })
      i = j
    }
  }

  const issueById = Object.fromEntries(issues.map((iss) => [iss.id, iss]))

  return (
    <p className="whitespace-pre-wrap text-gray-800 text-sm leading-relaxed">
      {segments.map((seg, idx) => {
        if (!seg.issueId) return <span key={idx}>{seg.text}</span>
        const isActive = seg.issueId === activeIssueId
        const sev = seg.severity?.toLowerCase() || 'low'
        return (
          <mark
            key={idx}
            data-issue-id={seg.issueId}
            onClick={() => onSpanClick(seg.issueId)}
            className={`rounded px-1 py-0.5 inline-block ${SEVERITY_HIGHLIGHT[sev] || SEVERITY_HIGHLIGHT.low} ${
              isActive ? SEVERITY_ACTIVE_RING[sev] || SEVERITY_ACTIVE_RING.low : ''
            }`}
            title={`${sev.toUpperCase()}: ${issueById[seg.issueId]?.message || ''}`}
          >
            {seg.text}
            {/* Accessible non-colour-only label */}
            <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-1 py-0.2 mx-1 rounded bg-white/80 border border-current align-baseline select-none">
              {sev}
            </span>
          </mark>
        )
      })}
    </p>
  )
}

// ─── Summary bar ─────────────────────────────────────────────────────────────

function SummaryBar({ issues, activeFilters, onFilterToggle }) {
  const open = issues.filter((i) => i.status === 'open')
  const counts = {
    high:   open.filter((i) => i.severity === 'high').length,
    medium: open.filter((i) => i.severity === 'medium').length,
    low:    open.filter((i) => i.severity === 'low').length,
  }
  const catCounts = {}
  for (const iss of open) {
    catCounts[iss.category] = (catCounts[iss.category] || 0) + 1
  }

  const chips = [
    { key: 'high',   label: `${counts.high} High`,   cls: 'bg-red-100 text-red-700 border-red-300'    },
    { key: 'medium', label: `${counts.medium} Med`,  cls: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
    { key: 'low',    label: `${counts.low} Low`,     cls: 'bg-blue-100 text-blue-700 border-blue-300'   },
    ...Object.entries(catCounts).map(([cat, n]) => ({
      key: `cat:${cat}`,
      label: `${n} ${cat}`,
      cls: 'bg-gray-100 text-gray-700 border-gray-300',
    })),
  ]

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {chips.map((c) => (
        <button
          key={c.key}
          onClick={() => onFilterToggle(c.key)}
          className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-all ${c.cls} ${
            activeFilters.includes(c.key)
              ? 'ring-2 ring-offset-1 ring-nimbus-blue opacity-100 font-bold'
              : 'opacity-70 hover:opacity-100'
          }`}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}

// ─── Issue card ───────────────────────────────────────────────────────────────

function IssueCard({ issue, onAction, isActive, onClick, registerRef }) {
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editText, setEditText] = useState(issue.suggestion || '')
  const [actionLoading, setActionLoading] = useState(null)
  const [localStatus, setLocalStatus] = useState(issue.status || 'open')
  const cardRef = useRef(null)

  // Register card DOM node with parent for scroll targeting
  useEffect(() => {
    if (registerRef) registerRef(cardRef.current)
    return () => { if (registerRef) registerRef(null) }
  }, [registerRef])

  useEffect(() => {
    setLocalStatus(issue.status || 'open')
  }, [issue.status])

  useEffect(() => {
    if (isActive && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isActive])

  const handleAction = async (action, customSuggestion) => {
    setActionLoading(action)
    try {
      const payload = { status: action }
      if (action === 'edited' && customSuggestion != null) {
        payload.edited_suggestion = customSuggestion
      }
      await onAction(issue.id, action, payload)
      setLocalStatus(action)
      setEditMode(false)
    } catch (err) {
      alert(getErrorMessage(err, 'Action failed.'))
    } finally {
      setActionLoading(null)
    }
  }

  const isDone = localStatus !== 'open'
  const ev = issue.evidence

  return (
    <div
      ref={cardRef}
      tabIndex={0}
      onClick={onClick}
      className={`rounded-xl border p-4 mb-3 cursor-pointer transition-all outline-none ${
        isActive
          ? 'border-nimbus-blue shadow-lg bg-blue-50/80 ring-2 ring-nimbus-blue'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
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
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 capitalize">
              {localStatus}
            </span>
          )}
          {!issue.location && (
            <span className="text-xs text-gray-400 italic bg-gray-100 px-2 py-0.5 rounded">
              list-only (no location)
            </span>
          )}
        </div>
      </div>

      {/* Message */}
      <p className="text-sm text-gray-800 mb-3 leading-relaxed">{issue.message}</p>

      {/* Suggestion */}
      {issue.suggestion && !editMode && (
        <div className="mb-3 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <p className="text-xs font-semibold text-green-700 mb-0.5">💡 Suggested Fix</p>
          <p className="text-xs text-green-800 leading-relaxed">{issue.suggestion}</p>
        </div>
      )}

      {/* Edit box */}
      {editMode && (
        <div className="mb-3" onClick={(e) => e.stopPropagation()}>
          <label className="text-xs font-semibold text-blue-700 mb-1 block">Edit Replacement Text</label>
          <textarea
            className="w-full text-xs border border-blue-300 rounded-lg px-2.5 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-nimbus-blue bg-white"
            rows={3}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => handleAction('edited', editText)}
              disabled={!!actionLoading}
              className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {actionLoading === 'edited' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Apply Edit & Replace
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

      {/* Evidence collapsible */}
      {ev && (
        <div className="mb-3">
          <button
            onClick={(e) => { e.stopPropagation(); setEvidenceOpen((p) => !p) }}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 font-medium"
          >
            {evidenceOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {evidenceOpen ? 'Hide' : 'Show'} evidence
          </button>
          {evidenceOpen && (
            <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600 space-y-1">
              {ev.source_doc && (
                <p className="font-semibold text-gray-700">📄 {ev.source_doc}</p>
              )}
              {ev.quote && <p className="italic bg-white p-2 rounded border border-gray-100">&ldquo;{ev.quote}&rdquo;</p>}
              {ev.rule_id && <p className="text-gray-400 font-mono text-[11px]">Rule: {ev.rule_id}</p>}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {!isDone && !editMode && (
        <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => handleAction('accepted')}
            disabled={!!actionLoading}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors disabled:opacity-50"
            title="Accept suggestion and replace text"
          >
            {actionLoading === 'accepted' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            Accept
          </button>
          {issue.suggestion && (
            <button
              onClick={() => { setEditText(issue.suggestion || ''); setEditMode(true) }}
              disabled={!!actionLoading}
              className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors disabled:opacity-50"
              title="Edit suggestion before applying"
            >
              <Edit3 size={12} />
              Edit
            </button>
          )}
          <button
            onClick={() => handleAction('dismissed')}
            disabled={!!actionLoading}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors disabled:opacity-50"
            title="Dismiss issue"
          >
            {actionLoading === 'dismissed' ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main ReviewPage ──────────────────────────────────────────────────────────

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
  const [activeFilters, setActiveFilters] = useState([])
  const [submitConfirm, setSubmitConfirm] = useState(false)
  const [submitWarningConfirm, setSubmitWarningConfirm] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [showDismissed, setShowDismissed] = useState(false)

  // Map issueId -> card DOM node for scrolling from span -> card
  const cardRefs = useRef({})

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

  const handleIssueAction = async (issueId, action, payload) => {
    const reviewId = id === 'sample' ? (review?.id || 'sample') : id
    await api.patch(`/reviews/${reviewId}/issues/${issueId}`, payload)

    // Apply text replacement and shift later issues' offsets locally
    setReview((prev) => {
      if (!prev) return prev

      const target = prev.issues.find((iss) => iss.id === issueId)
      const replacement = action === 'edited' ? (payload.edited_suggestion ?? target?.suggestion) : target?.suggestion

      let newContentText = prev.content_text
      let updatedIssues = prev.issues

      if ((action === 'accepted' || action === 'edited') && target?.location && target.location.start != null && target.location.end != null && replacement != null) {
        const { start, end } = target.location
        newContentText = prev.content_text.slice(0, start) + replacement + prev.content_text.slice(end)
        const delta = replacement.length - (end - start)

        updatedIssues = prev.issues.map((iss) => {
          if (iss.id === issueId) {
            return {
              ...iss,
              status: action,
              suggestion: replacement,
              location: { ...iss.location, start, end: start + replacement.length },
            }
          }
          if (!iss.location || iss.location.start == null || iss.location.end == null) {
            return iss
          }
          if (iss.location.start >= end) {
            return {
              ...iss,
              location: {
                ...iss.location,
                start: iss.location.start + delta,
                end: iss.location.end + delta,
              },
            }
          }
          return iss
        })
      } else {
        updatedIssues = prev.issues.map((iss) =>
          iss.id === issueId
            ? {
                ...iss,
                status: action,
                suggestion: payload.edited_suggestion ?? iss.suggestion,
              }
            : iss
        )
      }

      return {
        ...prev,
        content_text: newContentText,
        issues: updatedIssues,
      }
    })
  }

  // Clicking a span in content scrolls to & highlights its card
  const handleSpanClick = (issueId) => {
    setActiveIssueId(issueId === activeIssueId ? null : issueId)
    const cardEl = cardRefs.current[issueId]
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      cardEl.focus()
    }
  }

  // Clicking an issue card highlights and scrolls to its text span
  const handleCardClick = (issueId) => {
    const newActive = issueId === activeIssueId ? null : issueId
    setActiveIssueId(newActive)
    if (newActive) {
      const spanEl = document.querySelector(`mark[data-issue-id="${newActive}"]`)
      if (spanEl) {
        spanEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }

  const handleDecision = async (decision) => {
    setDecisionLoading(decision)
    try {
      await api.post(`/reviews/${id}/approve`, { action: decision, comment: `Reviewer selected ${decision}` })
      setDecisionDone(decision)
      await fetchReview()
    } catch (err) {
      alert(getErrorMessage(err, 'Action failed.'))
    } finally {
      setDecisionLoading(null)
    }
  }

  const handleSubmitForApproval = async () => {
    setSubmitLoading(true)
    try {
      await api.post(`/reviews/${id}/approve`, {
        action: 'approved',
        comment: 'Submitted for approval from review screen.',
      })
      setDecisionDone('approved')
      await fetchReview()
    } catch (err) {
      alert(getErrorMessage(err, 'Could not submit for approval.'))
    } finally {
      setSubmitLoading(false)
      setSubmitConfirm(false)
      setSubmitWarningConfirm(false)
    }
  }

  const toggleFilter = (key) => {
    setActiveFilters((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  // ── Loading / error states ──
  if (loading || wakeup) {
    return (
      <div className="p-6">
        {wakeup ? (
          <ServerWakeup />
        ) : (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="animate-spin text-nimbus-blue" size={36} />
            <p className="text-gray-500 text-sm font-medium">Loading review…</p>
          </div>
        )}
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center max-w-lg mx-auto">
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

  const allIssues = review.issues || []
  const canDecide = user?.role === 'reviewer' && review.status === 'in_review'

  // Apply filters and dismissed toggle
  const visibleIssues = allIssues.filter((iss) => {
    if (iss.status === 'dismissed' && !showDismissed) return false
    if (activeFilters.length === 0) return true
    const sevMatch = activeFilters.includes(iss.severity)
    const catMatch = activeFilters.some((f) => f === `cat:${iss.category}`)
    const hasSev = activeFilters.some((f) => ['high', 'medium', 'low'].includes(f))
    const hasCat = activeFilters.some((f) => f.startsWith('cat:'))
    if (hasSev && hasCat) return sevMatch || catMatch
    if (hasSev) return sevMatch
    if (hasCat) return catMatch
    return true
  })

  const dismissedCount = allIssues.filter((i) => i.status === 'dismissed').length
  const openHighCount = allIssues.filter((i) => i.severity === 'high' && i.status === 'open').length

  return (
    <div className="flex flex-col h-full">
      {/* ── Top bar ── */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between gap-4 shrink-0 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-gray-800 truncate max-w-lg">{review.title}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-gray-500 capitalize">
              {review.status?.replace(/_/g, ' ')} ·{' '}
              {review.created_at ? new Date(review.created_at).toLocaleDateString() : ''}
            </span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 uppercase">
              {review.content_type}
            </span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {allIssues.length} issue{allIssues.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="flex gap-2 shrink-0 flex-wrap items-center">
          {canDecide && !decisionDone && (
            <>
              <button
                onClick={() => handleDecision('approved')}
                disabled={!!decisionLoading}
                className="flex items-center gap-1.5 bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {decisionLoading === 'approved' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Approve
              </button>
              <button
                onClick={() => handleDecision('changes_requested')}
                disabled={!!decisionLoading}
                className="flex items-center gap-1.5 bg-orange-500 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                {decisionLoading === 'changes_requested' ? <Loader2 size={14} className="animate-spin" /> : <AlertCircle size={14} />}
                Request Changes
              </button>
            </>
          )}

          {!canDecide && review.status === 'in_review' && !decisionDone && (
            openHighCount === 0 ? (
              !submitConfirm ? (
                <button
                  onClick={() => setSubmitConfirm(true)}
                  className="flex items-center gap-1.5 bg-nimbus-blue text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Send size={14} />
                  Submit for Approval
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                  <span className="text-xs text-green-700 font-medium">Ready to submit?</span>
                  <button
                    onClick={handleSubmitForApproval}
                    disabled={submitLoading}
                    className="text-xs font-semibold text-white bg-green-600 hover:bg-green-700 px-3 py-1 rounded-lg disabled:opacity-50"
                  >
                    {submitLoading ? <Loader2 size={12} className="animate-spin inline" /> : 'Yes, submit'}
                  </button>
                  <button onClick={() => setSubmitConfirm(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                </div>
              )
            ) : (
              !submitWarningConfirm ? (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                  <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                  <span className="text-xs text-amber-800 font-medium">
                    {openHighCount} HIGH issue{openHighCount !== 1 ? 's' : ''} open
                  </span>
                  <button
                    onClick={() => setSubmitWarningConfirm(true)}
                    className="text-xs text-amber-700 font-semibold underline hover:text-amber-900 ml-1"
                  >
                    Submit anyway…
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                  <span className="text-xs text-red-700 font-medium">
                    Confirm submit with {openHighCount} HIGH issue{openHighCount !== 1 ? 's' : ''}?
                  </span>
                  <button
                    onClick={handleSubmitForApproval}
                    disabled={submitLoading}
                    className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-3 py-1 rounded-lg disabled:opacity-50"
                  >
                    {submitLoading ? <Loader2 size={12} className="animate-spin inline" /> : 'Confirm submit'}
                  </button>
                  <button onClick={() => setSubmitWarningConfirm(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                </div>
              )
            )
          )}

          {decisionDone && (
            <div className="flex items-center gap-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 px-4 py-2 rounded-lg">
              <CheckCircle size={16} />
              {decisionDone === 'approved' ? 'Approved!' : 'Changes Requested'}
            </div>
          )}
        </div>
      </div>

      {/* ── Summary bar ── */}
      {allIssues.length > 0 && (
        <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 shrink-0 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Filters:</span>
            <SummaryBar issues={allIssues} activeFilters={activeFilters} onFilterToggle={toggleFilter} />
            {activeFilters.length > 0 && (
              <button onClick={() => setActiveFilters([])} className="text-xs text-gray-500 hover:text-gray-800 underline">
                Clear filters
              </button>
            )}
          </div>

          {dismissedCount > 0 && (
            <button
              onClick={() => setShowDismissed((p) => !p)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 font-medium"
            >
              {showDismissed ? <EyeOff size={13} /> : <Eye size={13} />}
              {showDismissed ? 'Hide' : 'Show'} {dismissedCount} dismissed
            </button>
          )}
        </div>
      )}

      {/* ── Two-panel layout: stacked on mobile, side-by-side on desktop ── */}
      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">

        {/* LEFT: Content */}
        <div className="md:w-3/5 overflow-y-auto border-b md:border-b-0 md:border-r border-gray-200 p-4 sm:p-6 bg-white">
          <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Document Content</h2>
              <span className="text-xs text-gray-400">Click highlighted text to view issue</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-600">
              <span className="flex items-center gap-1 font-medium">
                <span className="w-3 h-3 rounded bg-red-200 border border-red-500 inline-block"></span> High
              </span>
              <span className="flex items-center gap-1 font-medium">
                <span className="w-3 h-3 rounded bg-yellow-200 border border-yellow-500 inline-block"></span> Med
              </span>
              <span className="flex items-center gap-1 font-medium">
                <span className="w-3 h-3 rounded bg-blue-100 border border-blue-400 inline-block"></span> Low
              </span>
            </div>
          </div>
          <div className="prose prose-sm max-w-none">
            {buildHighlightedContent(review.content_text, allIssues, activeIssueId, handleSpanClick)}
          </div>
        </div>

        {/* RIGHT: Issues */}
        <div className="md:w-2/5 overflow-y-auto p-4 bg-gray-50 flex flex-col">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">
              Issues ({visibleIssues.length}{visibleIssues.length !== allIssues.length ? ` of ${allIssues.length}` : ''})
            </h2>
            {activeIssueId && (
              <button
                onClick={() => setActiveIssueId(null)}
                className="text-xs text-nimbus-blue hover:underline"
              >
                Clear active
              </button>
            )}
          </div>

          {allIssues.some((i) => !i.location && i.status !== 'dismissed') && (
            <p className="text-xs text-gray-400 px-1 mb-3 italic">
              ℹ Issues without text coordinates appear in this list only.
            </p>
          )}

          <div className="flex-1">
            {visibleIssues.length === 0 && allIssues.length === 0 ? (
              <div className="text-center py-16">
                <CheckCircle size={40} className="mx-auto text-green-500 mb-3" />
                <p className="text-gray-700 text-base font-semibold">No issues found!</p>
                <p className="text-gray-400 text-xs mt-1">This content complies with all Nimbus Bank brand guidelines.</p>
              </div>
            ) : visibleIssues.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                No issues match the current filters.
              </div>
            ) : (
              visibleIssues.map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  onAction={handleIssueAction}
                  isActive={activeIssueId === issue.id}
                  onClick={() => handleCardClick(issue.id)}
                  registerRef={(el) => { cardRefs.current[issue.id] = el }}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
