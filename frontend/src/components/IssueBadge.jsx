const SEVERITY_CONFIG = {
  high: { label: 'High', bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
  medium: { label: 'Medium', bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  low: { label: 'Low', bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
}

export default function IssueBadge({ severity, size = 'sm' }) {
  const config = SEVERITY_CONFIG[severity?.toLowerCase()] || SEVERITY_CONFIG.low
  const sizeClass = size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'
  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full border ${config.bg} ${config.text} ${config.border} ${sizeClass}`}
    >
      {config.label}
    </span>
  )
}
