export default function AdminLoading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-9 bg-white/5 rounded w-1/3" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 bg-white/5 rounded-xl" />
        ))}
      </div>
      <div className="h-64 bg-white/5 rounded-xl" />
    </div>
  )
}
