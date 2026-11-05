import { useState, useEffect } from 'react'
import { api, getErrorMessage } from '../api/client'
import ServerWakeup from '../components/ServerWakeup'
import { ShieldAlert, Loader2, RefreshCw } from 'lucide-react'

export default function AuditPage() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isWakingUp, setIsWakingUp] = useState(false)

  const fetchLogs = async () => {
    setLoading(true)
    setError(null)
    const timer = setTimeout(() => setIsWakingUp(true), 3000)
    try {
      const res = await api.get('/audit?page=1&page_size=50')
      setLogs(res.data)
      setIsWakingUp(false)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load audit logs'))
    } finally {
      clearTimeout(timer)
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [])

  const actionColors = {
    create: 'bg-green-100 text-green-800 border-green-200',
    submit: 'bg-blue-100 text-blue-800 border-blue-200',
    approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    changes_requested: 'bg-amber-100 text-amber-800 border-amber-200',
    update_issue_status: 'bg-purple-100 text-purple-800 border-purple-200',
  }

  return (
    <div className="space-y-6">
      {isWakingUp && <ServerWakeup />}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldAlert className="w-7 h-7 text-nimbus-navy" />
            System Audit Log
          </h1>
          <p className="text-gray-500 mt-1">
            Immutable trail of content submissions, check runs, issue state modifications, and reviewer actions.
          </p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Log
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-nimbus-blue" />
            Loading audit records...
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-600 bg-red-50 text-sm">{error}</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            No audit log entries recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-semibold border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3">Timestamp</th>
                  <th className="px-6 py-3">Action</th>
                  <th className="px-6 py-3">Resource</th>
                  <th className="px-6 py-3">Actor / ID</th>
                  <th className="px-6 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-mono text-xs">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-3.5 text-gray-500 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-3.5">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full border text-[11px] font-sans font-medium uppercase tracking-wider ${
                          actionColors[log.action] || 'bg-gray-100 text-gray-700 border-gray-200'
                        }`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-gray-700 font-sans font-medium">
                      {log.resource_type}
                    </td>
                    <td className="px-6 py-3.5 text-gray-600 truncate max-w-[140px]" title={log.actor_id || 'System'}>
                      {log.actor_id ? log.actor_id.substring(0, 8) + '...' : 'System'}
                    </td>
                    <td className="px-6 py-3.5 text-gray-600 font-sans max-w-md truncate" title={log.detail || '-'}>
                      {log.detail || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
