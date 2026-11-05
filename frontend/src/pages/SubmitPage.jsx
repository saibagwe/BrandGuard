import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, getErrorMessage } from '../api/client'
import { Loader2, Sparkles } from 'lucide-react'

export default function SubmitPage() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState('') // 'creating' | 'analyzing' | ''

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) {
      return setError('Title and content are required.')
    }
    setError('')
    setLoading(true)
    setStep('creating')

    try {
      // 1. Create the review
      const createRes = await api.post('/reviews', {
        title: title.trim(),
        content_text: content.trim(),
        content: content.trim(),
      })
      const reviewId = createRes.data.id

      // 2. Submit for AI analysis
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

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Submit Content for Review</h1>
        <p className="text-sm text-gray-500 mt-1">
          Our AI will check your content against Nimbus Bank brand guidelines.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
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

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
              <Loader2 className="animate-spin text-nimbus-blue mt-0.5 shrink-0" size={20} />
              <div>
                <p className="font-semibold text-nimbus-navy text-sm">
                  {step === 'creating' ? 'Creating review…' : '🤖 AI is analyzing your content…'}
                </p>
                <p className="text-xs text-blue-600 mt-0.5">
                  {step === 'analyzing'
                    ? 'Checking tone, claims, accessibility, and brand alignment. This may take 20–60 seconds.'
                    : 'Setting up your submission…'}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              disabled={loading || !title.trim() || !content.trim()}
              className="flex items-center gap-2 bg-nimbus-blue text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /> Analyzing…</>
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
          <li>Visual description consistency (if applicable)</li>
        </ul>
      </div>
    </div>
  )
}
