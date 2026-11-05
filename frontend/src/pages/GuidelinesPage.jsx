import { useState, useEffect } from 'react'
import { api, getErrorMessage } from '../api/client'
import ServerWakeup from '../components/ServerWakeup'
import { BookOpen, Plus, Loader2, FileText, CheckCircle2 } from 'lucide-react'

export default function GuidelinesPage() {
  const [guidelines, setGuidelines] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isWakingUp, setIsWakingUp] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  // Form state
  const [title, setTitle] = useState('')
  const [docType, setDocType] = useState('voice')
  const [contentText, setContentText] = useState('')

  const fetchGuidelines = async () => {
    setLoading(true)
    setError(null)
    const timer = setTimeout(() => setIsWakingUp(true), 3000)
    try {
      const res = await api.get('/guidelines')
      setGuidelines(res.data)
      setIsWakingUp(false)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load guidelines'))
    } finally {
      clearTimeout(timer)
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchGuidelines()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim() || !contentText.trim()) return

    setSubmitting(true)
    setError(null)
    setSuccessMsg('')
    try {
      const res = await api.post('/guidelines', {
        title: title.trim(),
        doc_type: docType,
        content_text: contentText.trim(),
      })
      setGuidelines((prev) => [res.data, ...prev])
      setTitle('')
      setContentText('')
      setSuccessMsg('Guideline added and chunked/embedded successfully!')
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to add guideline'))
    } finally {
      setSubmitting(false)
    }
  }

  const typeBadges = {
    voice: 'bg-purple-100 text-purple-800 border-purple-200',
    terminology: 'bg-blue-100 text-blue-800 border-blue-200',
    facts: 'bg-green-100 text-green-800 border-green-200',
    visual: 'bg-amber-100 text-amber-800 border-amber-200',
  }

  return (
    <div className="space-y-8">
      {isWakingUp && <ServerWakeup />}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-nimbus-blue" />
            Brand Guidelines & Knowledge Base
          </h1>
          <p className="text-gray-500 mt-1">
            Manage approved tone, terminology rules, approved facts, and visual standards for Nimbus Bank.
          </p>
        </div>
      </div>

      {/* Upload Form */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-nimbus-navy" />
          Add New Guideline Document
        </h2>

        {successMsg && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Document Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Q2 2024 Product Facts & Rates"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-nimbus-blue focus:border-nimbus-blue"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Document Type
              </label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-nimbus-blue focus:border-nimbus-blue bg-white"
              >
                <option value="voice">Brand Voice</option>
                <option value="terminology">Terminology & Banned Words</option>
                <option value="facts">Approved Facts & Rates</option>
                <option value="visual">Visual & Palette Guidelines</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Guideline Content
            </label>
            <textarea
              required
              rows={4}
              value={contentText}
              onChange={(e) => setContentText(e.target.value)}
              placeholder="Paste rule details, approved facts, forbidden terms, or design standards..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-nimbus-blue focus:border-nimbus-blue text-sm font-mono"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-nimbus-navy hover:bg-nimbus-blue text-white rounded-lg font-medium text-sm transition flex items-center gap-2 shadow disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Embedding & Storing...
                </>
              ) : (
                'Upload & Index Guideline'
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Guidelines List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Existing Guidelines</h2>
          <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium">
            {guidelines.length} Document{guidelines.length === 1 ? '' : 's'}
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-nimbus-blue" />
            Loading guidelines...
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-600 bg-red-50 text-sm">{error}</div>
        ) : guidelines.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            No guidelines loaded yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {guidelines.map((doc) => (
              <div key={doc.id} className="p-5 hover:bg-gray-50 transition">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-gray-400" />
                    <h3 className="font-semibold text-gray-900">{doc.title}</h3>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full border font-medium uppercase tracking-wider ${
                        typeBadges[doc.doc_type] || 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {doc.doc_type}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {doc.chunks_count ?? 1} chunk(s) indexed
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-2 bg-gray-50 p-3 rounded border border-gray-100 line-clamp-3">
                  {doc.content_text}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
