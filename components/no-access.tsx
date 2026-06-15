import Link from 'next/link'

/**
 * Graceful "you don't have permission" panel. Rendered in place of a page's
 * content when a viewer reaches a capability-gated surface they can't use
 * (usually by typing/sharing a URL — the nav itself hides what they can't
 * reach). Lives inside the org shell so the sidebar stays put and the person
 * isn't dumped on a blank screen or silently bounced.
 */
export function NoAccess({
  title = "You don't have access to this",
  message = 'This area is limited to people with the right permission. If you think you need it, ask a workspace owner or your HR admin to grant it.',
  backHref,
  backLabel = 'Back',
}: {
  title?: string
  message?: string
  backHref: string
  backLabel?: string
}) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="app-card app-card-lg max-w-md w-full text-center">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-[var(--m-bg-soft)] border border-[var(--m-border)] inline-flex items-center justify-center text-slate-500">
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
            <rect x={4} y={11} width={16} height={9} rx={2} />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="text-[18px] font-semibold text-[color:var(--m-ink)]">{title}</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-600">{message}</p>
        <Link
          href={backHref}
          prefetch
          className="mt-5 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-700 text-white text-[13px] font-medium transition"
        >
          {backLabel}
        </Link>
      </div>
    </div>
  )
}
