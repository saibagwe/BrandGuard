import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, getErrorMessage } from '../api/client'
import { Loader2, Sparkles, Upload, X, FileText, File } from 'lucide-react'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

const FILE_ICONS = {
  pdf:  <FileText size={18} className="text-red-500" />,
  docx: <File size={18} className="text-blue-500" />,
  txt:  <FileText size={18} className="text-gray-500" />,
}

function getFileIcon(name = '') {
  const ext = name.split('.').pop()?.toLowerCase()
  return FILE_ICONS[ext] || <File size={18} className="text-gray-400" />
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export default function SubmitPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [mode, setMode] = useState('text') // 'text' | 'file'
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [selectedFile, setSelectedFile] = useState(null) // { file: File, error: string|null }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState('') // 'creating' | 'analyzing' | ''

  const handleFileSelect = (file) => {
    if (!file) return
    if (file.size > MAX_FILE_SIZE) {
      setSelectedFile({ file, error: `File is too large (${formatBytes(file.size)}). Maximum size is 10 MB.` })
      return
    }
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['pdf', 'docx', 'txt', 'md', 'text'].includes(ext)) {
      setSelectedFile({ file, error: `Unsupported file type .${ext}. Supported: PDF, DOCX, TXT.` })
      return
    }
    setSelectedFile({ file, error: null })
    // Auto-fill title from filename if empty
    if (!title.trim()) {
      setTitle(file.name.replace(/\.[^.]+$/, ''))
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileSelect(file)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (mode === 'file') {
      if (!selectedFile?.file) return setError('Please select a file to upload.')
      if (selectedFile.error) return setError(selectedFile.error)
      if (!title.trim()) return setError('Title is required.')

      setLoading(true)
      setStep('creating')
      try {
        const formData = new FormData()
        formData.append('file', selectedFile.file)
        // Title is a query param for the upload endpoint
        const res = await api.post(
          `/reviews/upload?title=${encodeURIComponent(title.trim())}`,
          formData
          // Don't set Content-Type manually — axios sets it with the correct boundary for FormData
        )
        navigate(`/review/${res.data.id}`)
      } catch (err) {
        setError(getErrorMessage(err, 'Upload failed. Please try again.'))
      } finally {
        setLoading(false)
        setStep('')
      }
      return
    }

    // Text mode
    if (!title.trim() || !content.trim()) {
      return setError('Title and content are required.')
    }
    setLoading(true)
    setStep('creating')

    try {
      const createRes = await api.post('/reviews', {
        title: title.trim(),
        content_text: content.trim(),
        content: content.trim(),
      })
      const reviewId = createRes.data.id

      setStep('analyzing')
      await api.post(`/reviews/${reviewId}/submit`)

      navigate(`/review/${reviewId}`)
    } catch (err) {
      setError(getErrorMessage(err, 'Submission failed. Please try again.'))
    } finally {
      setLoading(false)
      setStep('')
    }
  }

  const isSubmitDisabled = loading || (
    mode === 'text'
      ? !title.trim() || !content.trim()
      : !title.trim() || !selectedFile?.file || !!selectedFile?.error
  )

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Submit Content for Review</h1>
        <p className="text-sm text-gray-500 mt-1">
          Our AI will check your content against Nimbus Bank brand guidelines.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-xl border border-gray-200 overflow-hidden mb-6 bg-white">
        <button
          type="button"
          onClick={() => setMode('text')}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            mode === 'text'
              ? 'bg-nimbus-blue text-white'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          Paste Text
        </button>
        <button
          type="button"
          onClick={() => setMode('file')}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            mode === 'file'
              ? 'bg-nimbus-blue text-white'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          Upload File
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Title */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Content Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q4 Mortgage Campaign Email"
              disabled={loading}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nimbus-blue disabled:bg-gray-50"
            />
          </div>

          {/* Text area OR file picker */}
          {mode === 'text' ? (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Content <span className="text-red-500">*</span>
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste your marketing copy, email content, social post, or other brand content here…"
                disabled={loading}
                rows={16}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-nimbus-blue disabled:bg-gray-50 resize-y"
                style={{ minHeight: '400px' }}
              />
              <p className="text-xs text-gray-400 mt-1">{content.length} characters</p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                File <span className="text-red-500">*</span>
              </label>

              {/* Always-present hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md,.text"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
              />

              {/* Drop zone */}
              {!selectedFile?.file ? (
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-nimbus-blue hover:bg-blue-50 transition-colors"
                >
                  <Upload size={28} className="text-gray-400" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-600">Drop a file here or click to browse</p>
                    <p className="text-xs text-gray-400 mt-1">PDF, DOCX, or TXT — max 10 MB</p>
                  </div>
                </div>
              ) : (
                <div className={`border rounded-xl p-4 flex items-center gap-3 ${
                  selectedFile.error
                    ? 'border-red-300 bg-red-50'
                    : 'border-green-200 bg-green-50'
                }`}>
                  {getFileIcon(selectedFile.file.name)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{selectedFile.file.name}</p>
                    <p className="text-xs text-gray-500">{formatBytes(selectedFile.file.size)}</p>
                    {selectedFile.error && (
                      <p className="text-xs text-red-600 mt-0.5">{selectedFile.error}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                    className="text-gray-400 hover:text-gray-600 shrink-0"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Change file link */}
              {selectedFile?.file && (
                <button
                  type="button"
                  onClick={() => { setSelectedFile(null); if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click() } }}
                  className="text-xs text-nimbus-blue hover:underline mt-2 block"
                >
                  Choose a different file
                </button>
              )}

            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Progress */}
          {loading && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
              <Loader2 className="animate-spin text-nimbus-blue mt-0.5 shrink-0" size={20} />
              <div>
                <p className="font-semibold text-nimbus-navy text-sm">
                  {mode === 'file' && step === 'creating'
                    ? '📂 Uploading and extracting text…'
                    : step === 'creating'
                    ? 'Creating review…'
                    : '🤖 AI is analyzing your content…'}
                </p>
                <p className="text-xs text-blue-600 mt-0.5">
                  {step === 'analyzing' || (mode === 'file' && step === 'creating')
                    ? 'Checking tone, claims, accessibility, and brand alignment. This may take 20–60 seconds.'
                    : 'Setting up your submission…'}
                </p>
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className="flex items-center gap-2 bg-nimbus-blue text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /> {mode === 'file' ? 'Uploading…' : 'Analyzing…'}</>
              ) : (
                <><Sparkles size={16} /> Submit for AI Review</>
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              disabled={loading}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      {/* Tips */}
      <div className="mt-5 bg-amber-50 border border-amber-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-amber-800 mb-2">💡 What gets checked</h3>
        <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
          <li>Brand tone and voice alignment with Nimbus Bank guidelines</li>
          <li>Factual accuracy and unsubstantiated claims</li>
          <li>Regulatory and compliance language</li>
          <li>Accessibility and inclusive language</li>
          {mode === 'file' && (
            <li>Supported formats: PDF (selectable text only), DOCX, TXT — max 10 MB</li>
          )}
        </ul>
      </div>
    </div>
  )
}
