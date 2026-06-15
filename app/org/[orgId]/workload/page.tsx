import { notFound, redirect } from 'next/navigation'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireScope } from '@/lib/auth/guards'
import { computeSignals } from '@/lib/people/risk'
import { CharacterAvatar } from '@/components/character-avatar'

export const dynamic = 'force-dynamic'

const LEVEL_PILL: Record<'ok' | 'watch' | 'high', string> = {
  high: 'pill-bad',
  watch: 'pill-warn',
  ok: 'pill-good',
}
const LEVEL_LABEL: Record<'ok' | 'watch' | 'high', string> = {
  high: 'High',
  watch: 'Watch',
  ok: 'OK',
}
// Bar fill colour mirrors the level so the row reads at a glance.
const BAR_COLOR: Record<'ok' | 'watch' | 'high', string> = {
  high: 'var(--m-bad)',
  watch: 'var(--m-warn)',
  ok: 'var(--m-good)',
}

// Manager+ guard is enforced by the parent layout; we still call requireScope
// here so direct navigation is safe and to obtain the visibility scope set.
export default async function WorkloadPage({ params }: { params: Promise<{ orgId: string }> }) {
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

  // Active members of this org, filtered to the viewer's scope.
  const memberRows = await db
    .select({ u: schema.users })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt)))

  const inScope = memberRows.filter((r) => scope.isAdminScope || scope.userIds.has(r.u.id))
  const userIds = inScope.map((r) => r.u.id)
  const userById = new Map(inScope.map((r) => [r.u.id, r.u]))

  const signals = userIds.length ? await computeSignals(orgId, userIds) : []

  // Sort highest weekHours first; the bar is relative to the busiest person.
  const rows = signals
    .map((s) => ({ ...s, user: userById.get(s.userId) }))
    .filter((r) => r.user)
    .sort((a, b) => b.weekHours - a.weekHours)

  const maxHours = rows.reduce((m, r) => Math.max(m, r.weekHours), 0)
  const avgHours = rows.length
    ? Math.round((rows.reduce((sum, r) => sum + r.weekHours, 0) / rows.length) * 10) / 10
    : 0

  return (
    <>
      <div className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="app-h1">Workload Balance</h1>
          <p className="mt-1.5 text-[13px] text-slate-600">
            Who&apos;s overloaded and who has capacity, from hours logged this week.
          </p>
        </div>
        {rows.length > 0 && (
          <div className="text-right">
            <div className="text-[20px] font-semibold leading-none text-[var(--m-ink)]">
              {avgHours}
              <span className="ml-0.5 text-[12px] font-normal text-slate-500">h</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">team avg / week</div>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="app-card app-card-lg">
          <div className="py-10 text-center">
            <h2 className="text-[15px] font-semibold text-[var(--m-ink)]">Nobody to show</h2>
            <p className="mt-1.5 text-[12.5px] text-slate-600">
              No teammates in your scope yet.
            </p>
          </div>
        </div>
      ) : (
        <section className="app-card overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => {
              const pct = maxHours > 0 ? Math.round((r.weekHours / maxHours) * 100) : 0
              const u = r.user!
              return (
                <li key={r.userId} className="px-5 py-3.5 flex items-center gap-3">
                  <CharacterAvatar
                    characterKey={u.characterKey}
                    imageUrl={u.avatarUrl}
                    name={u.name}
                    login={u.login}
                    size={32}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-[var(--m-ink)] truncate">
                        {u.name ?? `@${u.login}`}
                      </span>
                      <span className={`pill ${LEVEL_PILL[r.level]} shrink-0`}>
                        {LEVEL_LABEL[r.level]}
                      </span>
                    </div>
                    {/* Hours bar — width relative to the busiest teammate. */}
                    <div className="mt-1.5 flex items-center gap-2.5">
                      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: BAR_COLOR[r.level] }}
                        />
                      </div>
                      <span className="text-[11.5px] tabular-nums text-slate-600 shrink-0 w-12 text-right">
                        {r.weekHours}h
                      </span>
                    </div>
                    {r.flags.length > 0 && (
                      <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">
                        {r.flags.join(' · ')}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </>
  )
}
