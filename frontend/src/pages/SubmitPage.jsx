import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, getErrorMessage } from '../api/client'
import {
  Loader2,
  Sparkles,
  Upload,
  X,
  FileText,
  File,
  AlertCircle,
  CheckCircle2,
  Lock,
} from 'lucide-react'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

const FILE_ICONS = {
  pdf: <FileText size={20} className="text-red-500" />,
  docx: <File size={20} className="text-blue-500" />,
  txt: <FileText size={20} className="text-gray-500" />,
}

function getFileIcon(name = '') {
  const ext = name.split('.').pop()?.toLowerCase()
  return FILE_ICONS[ext] || <File size={20} className="text-gray-400" />
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export default function SubmitPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [selectedFile, setSelectedFile] = useState(null) // { file: File, error: string | null }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // "One text or one file" rule:
  const isFileActive = !!selectedFile?.file
  const isTextActive = text.trim().length > 0

  const handleFileSelect = (file) => {
    if (!file) return
    setError('')

    // Client-side size validation
    if (file.size > MAX_FILE_SIZE) {
      setSelectedFile({
        file,
        error: `File is too large (${formatBytes(file.size)}). Maximum permitted size is 10 MB.`,
      })
      return
    }

    // Client-side type validation
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['pdf', 'docx', 'txt', 'md', 'text'].includes(ext)) {
      setSelectedFile({
        file,
        error: `Unsupported file format (.${ext}). Only PDF, Word (.docx), and Text (.txt) files are supported.`,
      })
      return
    }

    setSelectedFile({ file, error: null })
    // If title is empty, default title from filename
    if (!title.trim()) {
      setTitle(file.name.replace(/\.[^.]+$/, ''))
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    if (isTextActive) return
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileSelect(file)
  }

  const clearFile = () => {
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const clearText = () => {
    setText('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const cleanTitle = title.trim()
    if (!cleanTitle) {
      setError('Please provide a title for this review.')
      return
    }

    if (!isFileActive && !isTextActive) {
      setError('Please either paste your text or select a file to submit.')
      return
    }

    if (isFileActive && selectedFile.error) {
      setError(selectedFile.error)
      return
    }

    setLoading(true)
    try {
      let res
      if (isFileActive) {
        // Multipart file submission
        const formData = new FormData()
        formData.append('title', cleanTitle)
        formData.append('file', selectedFile.file)

        res = await api.post('/reviews', formData)
      } else {
        // JSON text submission
        res = await api.post('/reviews', {
          title: cleanTitle,
          text: text.trim(),
        })
      }

      navigate(`/review/${res.data.id}`)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create review. Please check your submission and try again.'))
    } finally {
      setLoading(false)
    }
  }

  const isSubmitDisabled =
    loading ||
    !title.trim() ||
    (!isFileActive && !isTextActive) ||
    (isFileActive && !!selectedFile?.error)

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">New Brand Review</h1>
        <p className="text-sm text-gray-500 mt-1">
          Submit your content to run automated brand alignment, tone, fact, and claim checks.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title Field */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Review Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q4 Summer Savings Email Campaign"
              disabled={loading}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nimbus-blue disabled:bg-gray-50"
            />
          </div>

          {/* Submission Mode Guidance */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-900 flex items-center justify-between">
            <span className="font-semibold">Rule: One Text OR One File per review</span>
            <span className="text-blue-700">
              {isFileActive
                ? 'File mode active (text box disabled)'
                : isTextActive
                ? 'Text mode active (file upload disabled)'
                : 'Choose one of the two options below'}
            </span>
          </div>

          {/* Option A: Paste Text Box */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                Option A: Paste Text Content
                {isTextActive && <CheckCircle2 size={15} className="text-emerald-600" />}
              </label>
              {isTextActive && (
                <button
                  type="button"
                  onClick={clearText}
                  disabled={loading}
                  className="text-xs text-gray-400 hover:text-red-600 font-medium"
                >
                  Clear text
                </button>
              )}
            </div>

            <div className="relative">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  isFileActive
                    ? 'Text box is disabled because a file is selected. Clear the file below if you wish to paste text instead.'
                    : 'Paste marketing copy, social media draft, or customer communication text here…'
                }
                disabled={loading || isFileActive}
                rows={10}
                className={`w-full border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-nimbus-blue resize-y transition-colors ${
                  isFileActive
                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                    : 'border-gray-300 bg-white'
                }`}
              />
              {isFileActive && (
                <div className="absolute inset-0 bg-gray-50/60 flex items-center justify-center rounded-lg pointer-events-none">
                  <span className="bg-white px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-600 shadow-sm flex items-center gap-1.5">
                    <Lock size={13} /> Text disabled — file attached below
                  </span>
                </div>
              )}
            </div>
            {!isFileActive && (
              <p className="text-xs text-gray-400">{text.length} characters</p>
            )}
          </div>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-gray-200"></div>
            <span className="flex-shrink mx-4 text-xs font-bold text-gray-400 uppercase tracking-widest">
              OR
            </span>
            <div className="flex-grow border-t border-gray-200"></div>
          </div>

          {/* Option B: File Picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                Option B: Upload Document File
                {isFileActive && !selectedFile.error && (
                  <CheckCircle2 size={15} className="text-emerald-600" />
                )}
              </label>
              {isTextActive && (
                <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-medium">
                  Clear text above to enable file upload
                </span>
              )}
            </div>

            {/* Hidden Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md,.text"
              disabled={loading || isTextActive}
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
            />

            {!selectedFile?.file ? (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => {
                  if (!isTextActive && !loading) fileInputRef.current?.click()
                }}
                className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 transition-colors ${
                  isTextActive
                    ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
                    : 'border-gray-300 hover:border-nimbus-blue hover:bg-blue-50/50 cursor-pointer bg-white'
                }`}
              >
                <Upload size={28} className={isTextActive ? 'text-gray-300' : 'text-gray-400'} />
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700">
                    {isTextActive ? 'File upload disabled' : 'Click to select or drop a file'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Accepts PDF, DOCX, or TXT — maximum 10 MB
                  </p>
                </div>
              </div>
            ) : (
              <div
                className={`border rounded-xl p-4 flex items-center gap-3 ${
                  selectedFile.error
                    ? 'border-red-300 bg-red-50'
                    : 'border-emerald-300 bg-emerald-50/50'
                }`}
              >
                {getFileIcon(selectedFile.file.name)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">
                    {selectedFile.file.name}
                  </p>
                  <p className="text-xs text-gray-500">{formatBytes(selectedFile.file.size)}</p>
                  {selectedFile.error && (
                    <p className="text-xs text-red-600 mt-1 flex items-center gap-1 font-medium">
                      <AlertCircle size={13} /> {selectedFile.error}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={clearFile}
                  disabled={loading}
                  className="text-gray-400 hover:text-red-600 p-1 rounded-lg transition-colors"
                  title="Remove file"
                >
                  <X size={18} />
                </button>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit Action */}
          <div className="flex items-center gap-4 pt-3 border-t border-gray-100">
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className="flex items-center gap-2 bg-nimbus-blue hover:bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Creating review…
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Create Review & Start Checks
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              disabled={loading}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
