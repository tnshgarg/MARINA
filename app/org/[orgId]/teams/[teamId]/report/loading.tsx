export default function TeamReportLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 bg-[var(--m-border)] rounded w-1/3" />
      <div className="h-12 bg-[var(--m-bg-soft)] rounded-xl" />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 bg-[var(--m-bg-soft)] rounded-xl" />
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 h-96 bg-[var(--m-bg-soft)] rounded-xl" />
        <div className="space-y-4">
          <div className="h-40 bg-[var(--m-bg-soft)] rounded-xl" />
          <div className="h-40 bg-[var(--m-bg-soft)] rounded-xl" />
        </div>
      </div>
    </div>
  )
}
