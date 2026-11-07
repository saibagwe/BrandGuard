import { useState, useEffect } from 'react'
import { api, getErrorMessage } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import ServerWakeup from '../components/ServerWakeup'
import { BookOpen, Plus, Loader2, FileText, CheckCircle2, Edit2, Trash2, X, Check } from 'lucide-react'

export default function GuidelinesPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [guidelines, setGuidelines] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isWakingUp, setIsWakingUp] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  // Create form state
  const [title, setTitle] = useState('')
  const [docType, setDocType] = useState('voice')
  const [contentText, setContentText] = useState('')

  // Edit state
  const [editingDocId, setEditingDocId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDocType, setEditDocType] = useState('voice')
  const [editContentText, setEditContentText] = useState('')
  const [updating, setUpdating] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

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
      setSuccessMsg('Guideline added and indexed successfully!')
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to add guideline'))
    } finally {
      setSubmitting(false)
    }
  }

  const startEdit = (doc) => {
    setEditingDocId(doc.id)
    setEditTitle(doc.title)
    setEditDocType(doc.doc_type)
    setEditContentText(doc.content_text)
    setError(null)
  }

  const cancelEdit = () => {
    setEditingDocId(null)
    setEditTitle('')
    setEditDocType('voice')
    setEditContentText('')
  }

  const handleUpdate = async (e) => {
    e.preventDefault()
    if (!editTitle.trim() || !editContentText.trim()) return

    setUpdating(true)
    setError(null)
    try {
      const res = await api.put(`/guidelines/${editingDocId}`, {
        title: editTitle.trim(),
        doc_type: editDocType,
        content_text: editContentText.trim(),
      })
      setGuidelines((prev) =>
        prev.map((g) => (g.id === editingDocId ? res.data : g))
      )
      setSuccessMsg('Guideline updated successfully!')
      cancelEdit()
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update guideline'))
    } finally {
      setUpdating(false)
    }
  }

  const handleDelete = async (doc) => {
    if (!window.confirm(`Delete "${doc.title}"? This will remove related embedded chunks.`)) {
      return
    }

    setDeletingId(doc.id)
    setError(null)
    try {
      await api.delete(`/guidelines/${doc.id}`)
      setGuidelines((prev) => prev.filter((g) => g.id !== doc.id))
      setSuccessMsg(`Guideline "${doc.title}" deleted successfully.`)
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete guideline'))
    } finally {
      setDeletingId(null)
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
            <BookOpen className="w-7 h-7 text-brand-blue" />
            Brand Guidelines & Knowledge Base
          </h1>
          <p className="text-gray-500 mt-1">
            Manage approved tone, terminology rules, approved facts, and visual standards for your brand.
          </p>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
          {successMsg}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Admin Upload Section */}
      {isAdmin && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-1 flex items-center gap-2">
            <Plus className="w-5 h-5 text-brand-blue" />
            Add New Brand Guideline Document
          </h2>
          <p className="text-sm text-gray-500 mb-5">
            Content will be automatically chunked and embedded for AI compliance checking.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Document Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tone & Voice Guidelines 2026"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-brand-blue"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Document Type
                </label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-brand-blue bg-white"
                >
                  <option value="voice">Brand Voice (brand-voice)</option>
                  <option value="terminology">Terminology & Banned Words</option>
                  <option value="facts">Approved Facts & Rates (approved-facts)</option>
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-brand-blue text-sm font-mono"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 bg-brand-navy hover:bg-brand-blue text-white rounded-lg font-medium text-sm transition flex items-center gap-2 shadow disabled:opacity-50"
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
      )}

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
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-brand-blue" />
            Loading guidelines...
          </div>
        ) : guidelines.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <BookOpen className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-600 font-medium text-sm">No brand guidelines yet.</p>
            <p className="text-gray-400 text-xs mt-1">Upload your brand voice, terminology and approved facts to start reviewing content.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {guidelines.map((doc) => {
              const isEditing = editingDocId === doc.id
              const isDeleting = deletingId === doc.id

              return (
                <div key={doc.id} className="p-5 hover:bg-gray-50/60 transition">
                  {isEditing ? (
                    <form onSubmit={handleUpdate} className="space-y-4 bg-blue-50/40 p-4 rounded-lg border border-blue-100">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-brand-navy">Edit Guideline</span>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Document Title
                          </label>
                          <input
                            type="text"
                            required
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-brand-blue"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Document Type
                          </label>
                          <select
                            value={editDocType}
                            onChange={(e) => setEditDocType(e.target.value)}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-brand-blue bg-white"
                          >
                            <option value="voice">Brand Voice</option>
                            <option value="terminology">Terminology & Banned Words</option>
                            <option value="facts">Approved Facts & Rates</option>
                            <option value="visual">Visual & Palette Guidelines</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Guideline Content
                        </label>
                        <textarea
                          required
                          rows={4}
                          value={editContentText}
                          onChange={(e) => setEditContentText(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-brand-blue font-mono"
                        />
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={updating}
                          className="px-4 py-1.5 bg-brand-navy hover:bg-brand-blue text-white rounded-lg text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {updating ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              Save Changes
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div>
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

                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400">
                            {doc.chunks_count ?? 1} chunk(s) indexed
                          </span>

                          {isAdmin && (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => startEdit(doc)}
                                title="Edit Guideline"
                                className="p-1.5 text-gray-500 hover:text-brand-blue hover:bg-blue-50 rounded transition"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(doc)}
                                disabled={isDeleting}
                                title="Delete Guideline"
                                className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition disabled:opacity-50"
                              >
                                {isDeleting ? (
                                  <Loader2 className="w-4 h-4 animate-spin text-red-600" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <p className="text-sm text-gray-600 mt-2 bg-gray-50 p-3 rounded border border-gray-100 whitespace-pre-wrap">
                        {doc.content_text}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
