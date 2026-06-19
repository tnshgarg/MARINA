/**
 * Read-only feed of org announcements (server component). Used on the member
 * dashboard and the manager Announcements page. Renders nothing when empty.
 */
export type AnnouncementItem = {
  id: number
  title: string | null
  body: string
  createdAt: string
  authorName: string | null
  authorLogin: string
}

export function AnnouncementsFeed({ items, title = 'Announcements' }: { items: AnnouncementItem[]; title?: string }) {
  if (!items.length) return null
  return (
    <div className="rounded-xl border border-[var(--m-border)] bg-white p-4">
      <p className="text-[13px] font-semibold text-[var(--m-ink)] mb-2.5">{title}</p>
      <div className="space-y-3">
        {items.map((a) => (
          <div key={a.id} className="border-l-2 border-[var(--m-accent-soft)] pl-3">
            {a.title && <p className="text-[12.5px] font-semibold text-[var(--m-ink)]">{a.title}</p>}
            <p className="text-[12.5px] text-[var(--m-ink-2)] whitespace-pre-line leading-snug">{a.body}</p>
            <p className="text-[10.5px] text-[var(--m-ink-4)] mt-0.5">
              {a.authorName ?? `@${a.authorLogin}`} ·{' '}
              {new Date(a.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
