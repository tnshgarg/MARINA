/**
 * Profile-page skeleton — rendered immediately during navigation so the
 * user sees structured "something is happening" instead of a blank frame
 * for the 2–3 seconds the server route spends fetching the heavy detail
 * payload.
 */
export default function ProfileLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex gap-4 items-start">
        <div className="w-14 h-14 rounded-full bg-[var(--m-border)] shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-7 bg-[var(--m-border)] rounded w-1/3" />
          <div className="h-4 bg-[var(--m-bg-soft)] rounded w-1/2" />
        </div>
        <div className="flex gap-2 shrink-0">
          <div className="h-9 w-28 bg-[var(--m-bg-soft)] rounded-md" />
          <div className="h-9 w-28 bg-[var(--m-bg-soft)] rounded-md" />
          <div className="h-9 w-36 bg-[var(--m-bg-soft)] rounded-md" />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="h-20 bg-[var(--m-bg-soft)] rounded-xl" />
        <div className="h-20 bg-[var(--m-bg-soft)] rounded-xl" />
        <div className="h-20 bg-[var(--m-bg-soft)] rounded-xl" />
        <div className="h-20 bg-[var(--m-bg-soft)] rounded-xl" />
      </div>
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <div className="h-48 bg-[var(--m-bg-soft)] rounded-xl" />
          <div className="h-64 bg-[var(--m-bg-soft)] rounded-xl" />
          <div className="h-48 bg-[var(--m-bg-soft)] rounded-xl" />
        </div>
        <div className="space-y-4">
          <div className="h-40 bg-[var(--m-bg-soft)] rounded-xl" />
          <div className="h-40 bg-[var(--m-bg-soft)] rounded-xl" />
          <div className="h-40 bg-[var(--m-bg-soft)] rounded-xl" />
        </div>
      </div>
    </div>
  )
}
