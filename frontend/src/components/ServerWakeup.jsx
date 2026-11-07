export default function ServerWakeup({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="relative mb-6">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-nimbus-blue" />
        <span className="absolute inset-0 flex items-center justify-center text-2xl">🌙</span>
      </div>
      <h3 className="text-lg font-semibold text-gray-700 mb-2">Server is waking up</h3>
      <p className="text-gray-500 max-w-sm text-sm leading-relaxed">
        {message ||
          'Render free tier sleeps after 15 min of inactivity. This usually takes 30–60 seconds. Hang tight!'}
      </p>
      <div className="mt-4 flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block w-2 h-2 rounded-full bg-nimbus-blue animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  )
}
