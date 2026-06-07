import { notFound } from 'next/navigation'
import { and, desc, eq, gte, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { dayBoundsUtc } from '@/lib/engine/state'

export const dynamic = 'force-dynamic'

// Manager+ guard from parent layout.
export default async function InsightsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  const memberRows = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(eq(schema.memberships.orgId, orgId))
  const userIds = memberRows.map((m) => m.userId)

  const since = new Date()
  since.setDate(since.getDate() - 6)
  const { iso: sevenAgo } = dayBoundsUtc(since)

  const states = userIds.length
    ? await db
        .select()
        .from(schema.dailyStates)
        .where(
          and(
            inArray(schema.dailyStates.userId, userIds),
            gte(schema.dailyStates.day, sevenAgo)
          )
        )
        .orderBy(desc(schema.dailyStates.day))
    : []

  const events = userIds.length
    ? await db
        .select()
        .from(schema.githubEvents)
        .where(
          and(
            inArray(schema.githubEvents.userId, userIds),
            gte(schema.githubEvents.occurredAt, since)
          )
        )
    : []

  const byType = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] ?? 0) + 1
    return acc
  }, {})

  const stateCount = states.reduce<Record<string, number>>((acc, s) => {
    acc[s.state] = (acc[s.state] ?? 0) + 1
    return acc
  }, {})

  const maxOutput = Math.max(...Object.values(byType), 1)
  const maxState = Math.max(states.length, 1)

  return (
    <>
      <div className="mb-6">
        <h1 className="app-h1">Insights</h1>
        <p className="mt-1 app-sub">A 7-day view across the team.</p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-12 md:col-span-6 app-card app-card-lg hover-lift">
          <h2 className="app-h2">Output mix</h2>
          <p className="app-sub mt-1 mb-4">Last 7 days, all sources combined.</p>
          <div className="space-y-3">
            <Bar label="Commits" value={byType.commit ?? 0} color="#6366f1" max={maxOutput} />
            <Bar label="PRs opened" value={byType.pr_opened ?? 0} color="#a855f7" max={maxOutput} />
            <Bar label="Reviews" value={byType.pr_reviewed ?? 0} color="#10b981" max={maxOutput} />
            <Bar label="Issues closed" value={byType.issue_closed ?? 0} color="#ec4899" max={maxOutput} />
          </div>
        </section>

        <section className="col-span-12 md:col-span-6 app-card app-card-lg hover-lift">
          <h2 className="app-h2">State distribution</h2>
          <p className="app-sub mt-1 mb-4">How daily states landed across the team.</p>
          <div className="space-y-3">
            <Bar
              label="Productive"
              value={(stateCount.High ?? 0) + (stateCount.Steady ?? 0)}
              color="#10b981"
              max={maxState}
            />
            <Bar label="Blocked" value={stateCount.Blocked ?? 0} color="#f59e0b" max={maxState} />
            <Bar label="Disengaged" value={stateCount.Disengaged ?? 0} color="#ef4444" max={maxState} />
            <Bar
              label="Decoy detected"
              value={stateCount.PossiblyDummying ?? 0}
              color="#ec4899"
              max={maxState}
            />
          </div>
        </section>
      </div>
    </>
  )
}

function Bar({
  label,
  value,
  color,
  max,
}: {
  label: string
  value: number
  color: string
  max: number
}) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100)
  return (
    <div>
      <div className="flex items-center justify-between text-[12px] text-slate-600 mb-1">
        <span>{label}</span>
        <span className="font-medium text-slate-900 tabular">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  )
}
