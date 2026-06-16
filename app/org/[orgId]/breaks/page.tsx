import { notFound, redirect } from 'next/navigation'
import { and, desc, eq, gte, inArray, isNull, or } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireScope } from '@/lib/auth/guards'
import { CharacterAvatar } from '@/components/character-avatar'
import { CheckInButton } from './check-in-button'

export const dynamic = 'force-dynamic'

// Manager+ guard from parent layout.
export default async function BreaksPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  // Visibility scoping: admins see every active member; managers + leads see
  // only their reports-to chain + members of teams they manage.
  let scope
  try {
    ;({ scope } = await requireScope(orgId, 'manager'))
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    if (err instanceof HttpError && err.status === 403) redirect('/dashboard')
    throw err
  }

  const memberRows = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt)))
  const userIds = memberRows
    .map((m) => m.userId)
    .filter((id) => scope.isAdminScope || scope.userIds.has(id))

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
      <div className="mb-5">
        <h1 className="app-h1">Breaks</h1>
        <p className="mt-1.5 text-[13px] text-[var(--m-ink-2)]">
          Real-time view of who&apos;s paused right now, plus the last 72 hours of breaks.
        </p>
      </div>

      <div className="grid grid-cols-12 gap-5">
        <section className="col-span-12 lg:col-span-7 rounded-xl border border-[var(--m-border)] bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--m-border-soft)] flex items-baseline justify-between">
            <h2 className="text-[14px] font-semibold text-[var(--m-ink)]">Paused now</h2>
            <span className="text-[12px] text-[var(--m-ink-3)] tabular-nums">{ongoing.length}</span>
          </div>
          {ongoing.length === 0 ? (
            <p className="px-4 py-6 text-[12.5px] text-[var(--m-ink-3)]">Nobody&apos;s paused right now.</p>
          ) : (
            <ul className="divide-y divide-[var(--m-border-soft)]">
              {ongoing.map(({ b, u }) => (
                <li key={b.id} className="px-4 py-3 flex items-start gap-3">
                  <CharacterAvatar characterKey={u.characterKey} name={u.name} login={u.login} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[var(--m-ink)] truncate">
                      {u.name ?? `@${u.login}`}
                      <span className="ml-1.5 text-[10.5px] text-[var(--m-ink-3)] capitalize font-normal">
                        · {b.category ?? 'other'}
                      </span>
                    </p>
                    <p className="text-[11px] text-[var(--m-ink-3)]">
                      Started {timeAgo(b.startedAt.toISOString())}
                    </p>
                    <p className="mt-1 text-[12.5px] text-[var(--m-ink-2)] leading-snug">{b.reason}</p>
                  </div>
                  <CheckInButton
                    orgId={orgId}
                    breakId={b.id}
                    startedAt={b.startedAt.toISOString()}
                    category={b.category ?? 'other'}
                    userName={u.name ?? `@${u.login}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="col-span-12 lg:col-span-5 rounded-xl border border-[var(--m-border)] bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--m-border-soft)] flex items-baseline justify-between">
            <h2 className="text-[14px] font-semibold text-[var(--m-ink)]">Recent breaks</h2>
            <span className="text-[11.5px] text-[var(--m-ink-3)]">Last 72 hours</span>
          </div>
          {recent.length === 0 ? (
            <p className="px-4 py-6 text-[12.5px] text-[var(--m-ink-3)]">No recent breaks logged.</p>
          ) : (
            <ul className="divide-y divide-[var(--m-border-soft)]">
              {recent.slice(0, 12).map(({ b, u }) => (
                <li key={b.id} className="px-4 py-2.5 flex items-start gap-3">
                  <CharacterAvatar characterKey={u.characterKey} name={u.name} login={u.login} size={26} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-medium text-[var(--m-ink)] truncate">
                      {u.name ?? `@${u.login}`}
                    </p>
                    <p className="text-[11px] text-[var(--m-ink-3)]">
                      {fmtDuration(b)} · {timeAgo(b.startedAt.toISOString())}
                    </p>
                    <p className="text-[11.5px] text-[var(--m-ink-2)] leading-snug">{b.reason}</p>
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
