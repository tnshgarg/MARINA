import { notFound } from 'next/navigation'
import { and, desc, eq, gte, inArray, isNull, or } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { CharacterAvatar } from '@/components/character-avatar'

export const dynamic = 'force-dynamic'

// Manager+ guard from parent layout.
export default async function BreaksPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  const memberRows = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(eq(schema.memberships.orgId, orgId))
  const userIds = memberRows.map((m) => m.userId)

  const breaks = userIds.length
    ? await db
        .select({ b: schema.breaks, u: schema.users })
        .from(schema.breaks)
        .innerJoin(schema.users, eq(schema.breaks.userId, schema.users.id))
        .where(
          and(
            inArray(schema.breaks.userId, userIds),
            or(
              isNull(schema.breaks.endedAt),
              gte(schema.breaks.startedAt, new Date(Date.now() - 72 * 60 * 60 * 1000))
            )!
          )
        )
        .orderBy(desc(schema.breaks.startedAt))
        .limit(200)
    : []

  const ongoing = breaks.filter((b) => !b.b.endedAt)
  const recent = breaks.filter((b) => b.b.endedAt)

  return (
    <>
      <div className="mb-6">
        <h1 className="app-h1">Breaks & Updates</h1>
        <p className="mt-1 app-sub">
          Real-time visibility into ongoing breaks and recent updates from your team.
        </p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-12 lg:col-span-7 app-card app-card-lg hover-lift">
          <div className="section-title-row">
            <h2 className="app-h2">On break now</h2>
            <span className="pill pill-slate">{ongoing.length}</span>
          </div>
          {ongoing.length === 0 ? (
            <p className="mt-3 app-sub">Nobody on break right now.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {ongoing.map(({ b, u }) => (
                <li
                  key={b.id}
                  className="rise-in rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-start gap-3"
                >
                  <CharacterAvatar characterKey={u.characterKey} size={40} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-slate-900 truncate">
                      {u.name ?? `@${u.login}`}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Started {timeAgo(b.startedAt.toISOString())}
                    </p>
                    <p className="mt-1 text-[13px] text-slate-700 leading-snug">{b.reason}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="col-span-12 lg:col-span-5 app-card app-card-lg hover-lift">
          <div className="section-title-row">
            <h2 className="app-h2">Recent breaks</h2>
            <span className="text-[12px] text-slate-500">Last 72 hours</span>
          </div>
          {recent.length === 0 ? (
            <p className="mt-3 app-sub">No recent breaks logged.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {recent.slice(0, 12).map(({ b, u }) => (
                <li key={b.id} className="flex items-start gap-3">
                  <CharacterAvatar characterKey={u.characterKey} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-slate-900 truncate">
                      {u.name ?? `@${u.login}`}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {fmtDuration(b)} · {timeAgo(b.startedAt.toISOString())}
                    </p>
                    <p className="mt-1 text-[12px] text-slate-600 leading-snug">{b.reason}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}

function fmtDuration(b: typeof schema.breaks.$inferSelect): string {
  if (!b.endedAt) return 'ongoing'
  const ms = b.endedAt.getTime() - b.startedAt.getTime()
  const m = Math.max(1, Math.round(ms / 60000))
  if (m < 60) return `${m}m break`
  return `${Math.floor(m / 60)}h ${m % 60}m break`
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
