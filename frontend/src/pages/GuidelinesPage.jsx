import { useEffect, useState, useRef } from 'react'
import { api } from '../api/client'
import { BookOpen, Plus, Upload, Edit2, Trash2, ChevronDown, ChevronUp, Loader2, AlertTriangle, CheckCircle2, X } from 'lucide-react'

const DOC_TYPES = [
  { value: 'voice', label: 'Brand Voice', description: 'Tone, style, and language guidelines' },
  { value: 'terminology', label: 'Terminology', description: 'Preferred terms, banned words, naming rules' },
  { value: 'facts', label: 'Approved Facts', description: 'Verified statistics, claims, and official facts' },
]

const TYPE_COLORS = {
  voice: 'bg-purple-100 text-purple-800 border-purple-200',
  terminology: 'bg-blue-100 text-blue-800 border-blue-200',
  facts: 'bg-green-100 text-green-800 border-green-200',
  visual: 'bg-amber-100 text-amber-800 border-amber-200',
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function DocTypeBadge({ type }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${TYPE_COLORS[type] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
      {DOC_TYPES.find(d => d.value === type)?.label || type}
    </span>
  )
}

function AddDocModal({ onClose, onSave }) {
  const [mode, setMode] = useState('text') // 'text' | 'file'
  const [title, setTitle] = useState('')
  const [docType, setDocType] = useState('voice')
  const [content, setContent] = useState('')
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required.'); return }
    if (mode === 'text' && !content.trim()) { setError('Content cannot be empty.'); return }
    if (mode === 'file' && !file) { setError('Please select a file.'); return }

    setLoading(true)
    setError('')
    try {
      if (mode === 'file') {
        const form = new FormData()
        form.append('file', file)
        form.append('doc_type', docType)
        form.append('title', title.trim())
        await api.post('/guidelines/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      } else {
        await api.post('/guidelines', { title: title.trim(), doc_type: docType, content_text: content })
      }
      onSave()
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not save guideline.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Add Guideline Document</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('text')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${mode === 'text' ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white text-gray-600 border-gray-300 hover:border-brand-blue'}`}
            >
              Paste Text
            </button>
            <button
              type="button"
              onClick={() => setMode('file')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${mode === 'file' ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white text-gray-600 border-gray-300 hover:border-brand-blue'}`}
            >
              Upload File
            </button>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g., Q4 2026 Brand Voice Guidelines"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Type</label>
            <select
              value={docType}
              onChange={e => setDocType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            >
              {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label} — {t.description}</option>)}
            </select>
          </div>

          {mode === 'text' ? (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Content</label>
              <textarea
                rows={6}
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Paste your guideline content here…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-blue resize-y"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">File (PDF, DOCX, TXT — max 10 MB)</label>
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-brand-blue transition-colors"
              >
                {file ? (
                  <div className="text-sm text-gray-700 font-medium">
                    <Upload size={16} className="inline mr-2 text-brand-blue" />
                    {file.name} ({(file.size / 1024).toFixed(0)} KB)
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">
                    <Upload size={20} className="mx-auto mb-2 text-gray-300" />
                    Click to browse a PDF, DOCX, or TXT file
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.txt,.md"
                className="hidden"
                onChange={e => setFile(e.target.files?.[0] || null)}
              />
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 text-sm font-semibold rounded-lg bg-brand-blue text-white hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {loading ? 'Saving…' : 'Save Guideline'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditDocModal({ doc, onClose, onSave }) {
  const [title, setTitle] = useState(doc.title || '')
  const [docType, setDocType] = useState(doc.doc_type || 'voice')
  const [content, setContent] = useState(doc.content_text || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required.'); return }
    if (!content.trim()) { setError('Content cannot be empty.'); return }
    setLoading(true)
    setError('')
    try {
      await api.put(`/guidelines/${doc.id}`, { title: title.trim(), doc_type: docType, content_text: content })
      onSave()
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not update guideline.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Edit Guideline</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Type</label>
            <select
              value={docType}
              onChange={e => setDocType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            >
              {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Content</label>
            <textarea
              rows={8}
              value={content}
              onChange={e => setContent(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-blue resize-y"
            />
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-2 text-sm font-semibold rounded-lg bg-brand-blue text-white hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 size={14} className="animate-spin" />}
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DocCard({ doc, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDelete(doc.id)
    } finally {
      setDeleting(false)
      setDeleteConfirm(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-semibold text-gray-900 text-sm truncate">{doc.title}</span>
              <DocTypeBadge type={doc.doc_type} />
            </div>
            <div className="text-xs text-gray-400">{doc.chunks_count} chunks · Added {formatDate(doc.created_at)}</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setExpanded(v => !v)}
              className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 transition-colors"
              title="Preview content"
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <button
              onClick={() => onEdit(doc)}
              className="p-1.5 text-gray-400 hover:text-brand-blue rounded hover:bg-blue-50 transition-colors"
              title="Edit"
            >
              <Edit2 size={16} />
            </button>
            <button
              onClick={() => setDeleteConfirm(true)}
              className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
              title="Delete"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-3 bg-gray-50 rounded-lg p-3 text-xs font-mono text-gray-700 max-h-40 overflow-y-auto border border-gray-200 whitespace-pre-wrap">
            {doc.content_text || '(empty)'}
          </div>
        )}

        {deleteConfirm && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center justify-between gap-3">
            <p className="text-sm text-red-700 font-medium">Delete "{doc.title}"? This cannot be undone.</p>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setDeleteConfirm(false)} className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 rounded border border-gray-300 bg-white">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="text-xs text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded flex items-center gap-1 disabled:opacity-50">
                {deleting && <Loader2 size={10} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function GuidelinesPage() {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editDoc, setEditDoc] = useState(null)
  const [flashMsg, setFlashMsg] = useState('')

  const fetchDocs = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/guidelines')
      setDocs(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      setError('Could not load guidelines.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchDocs() }, [])

  const handleDelete = async (id) => {
    await api.delete(`/guidelines/${id}`)
    setFlashMsg('Guideline deleted.')
    setTimeout(() => setFlashMsg(''), 3000)
    await fetchDocs()
  }

  const grouped = {
    voice: docs.filter(d => d.doc_type === 'voice'),
    terminology: docs.filter(d => d.doc_type === 'terminology'),
    facts: docs.filter(d => d.doc_type === 'facts'),
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BookOpen size={28} className="text-brand-blue" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Brand Guidelines</h1>
            <p className="text-sm text-gray-500">Manage the guidelines used to check submitted content.</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-brand-blue text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} /> Add Guideline
        </button>
      </div>

      {flashMsg && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-2 flex items-center gap-2">
          <CheckCircle2 size={16} /> {flashMsg}
        </div>
      )}

      {loading ? (
        <div className="py-16 flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-blue" />
          <p className="text-sm text-gray-500">Loading guidelines…</p>
        </div>
      ) : error ? (
        <div className="py-12 text-center">
          <AlertTriangle size={36} className="mx-auto text-amber-400 mb-3" />
          <p className="text-gray-600 font-medium">{error}</p>
          <button onClick={fetchDocs} className="mt-3 text-sm text-brand-blue hover:underline">Retry</button>
        </div>
      ) : docs.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <BookOpen size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-600 font-semibold">No brand guidelines yet.</p>
          <p className="text-gray-400 text-sm mt-1 max-w-sm mx-auto">
            Add your brand voice, terminology, and approved facts so submitted content can be checked.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-5 inline-flex items-center gap-2 bg-brand-blue text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-blue-700"
          >
            <Plus size={16} /> Add First Guideline
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {DOC_TYPES.map(({ value, label, description }) => (
            <div key={value}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-base font-bold text-gray-700">{label}</h2>
                <span className="text-xs text-gray-400">— {description}</span>
              </div>
              {grouped[value].length === 0 ? (
                <div className="border border-dashed border-gray-200 rounded-xl p-5 text-center text-sm text-gray-400">
                  No {label.toLowerCase()} guidelines added yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {grouped[value].map(doc => (
                    <DocCard
                      key={doc.id}
                      doc={doc}
                      onEdit={setEditDoc}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <AddDocModal
          onClose={() => setShowAddModal(false)}
          onSave={() => {
            fetchDocs()
            setFlashMsg('Guideline saved successfully.')
            setTimeout(() => setFlashMsg(''), 3000)
          }}
        />
      )}
      {editDoc && (
        <EditDocModal
          doc={editDoc}
          onClose={() => setEditDoc(null)}
          onSave={() => {
            fetchDocs()
            setEditDoc(null)
            setFlashMsg('Guideline updated.')
            setTimeout(() => setFlashMsg(''), 3000)
          }}
        />
      )}
    </div>
  )
}
