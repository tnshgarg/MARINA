import { notFound } from 'next/navigation'
import { desc, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { CharacterAvatar } from '@/components/character-avatar'

export const dynamic = 'force-dynamic'

const TYPE_LABEL: Record<string, string> = {
  commit: 'commit',
  pr_opened: 'PR opened',
  pr_reviewed: 'review',
  issue_closed: 'issue closed',
}
const TYPE_PILL: Record<string, string> = {
  commit: 'pill-info',
  pr_opened: 'pill-violet',
  pr_reviewed: 'pill-good',
  issue_closed: 'pill-pink',
}

// Manager+ guard from parent layout.
export default async function ActivityPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  const memberRows = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(eq(schema.memberships.orgId, orgId))
  const userIds = memberRows.map((m) => m.userId)

  const events = userIds.length
    ? await db
        .select({ e: schema.githubEvents, u: schema.users })
        .from(schema.githubEvents)
        .innerJoin(schema.users, eq(schema.githubEvents.userId, schema.users.id))
        .where(inArray(schema.githubEvents.userId, userIds))
        .orderBy(desc(schema.githubEvents.occurredAt))
        .limit(100)
    : []

  return (
    <>
      <div className="mb-6">
        <h1 className="app-h1">Activity Feed</h1>
        <p className="mt-1 app-sub">Recent GitHub activity across the team.</p>
      </div>

      <div className="app-card hover-lift">
        {events.length === 0 ? (
          <p className="p-10 text-center text-slate-500">
            No events synced yet. Team members can sync from their personal console.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {events.map(({ e, u }) => (
              <li key={e.id} className="px-5 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors">
                <CharacterAvatar characterKey={u.characterKey} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`pill ${TYPE_PILL[e.type] ?? 'pill-slate'}`}>
                      {TYPE_LABEL[e.type] ?? e.type}
                    </span>
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[14px] text-slate-900 hover:text-indigo-600 truncate"
                    >
                      {e.title}
                    </a>
                  </div>
                  <p className="text-[12px] text-slate-500 mt-0.5">
                    {u.name ?? `@${u.login}`} · {e.repo} · {timeAgo(e.occurredAt.toISOString())}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}
