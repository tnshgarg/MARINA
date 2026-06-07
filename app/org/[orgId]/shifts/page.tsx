import { notFound } from 'next/navigation'
import { and, desc, eq, gte, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { CharacterAvatar } from '@/components/character-avatar'

export const dynamic = 'force-dynamic'

// Manager+ guard via layout.
export default async function ShiftsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  const memberRows = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(eq(schema.memberships.orgId, orgId))
  const userIds = memberRows.map((m) => m.userId)

  // Past 14 days of shifts.
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  const rows = userIds.length
    ? await db
        .select({ s: schema.shifts, u: schema.users })
        .from(schema.shifts)
        .innerJoin(schema.users, eq(schema.shifts.userId, schema.users.id))
        .where(
          and(
            inArray(schema.shifts.userId, userIds),
            gte(schema.shifts.punchedInAt, since)
          )
        )
        .orderBy(desc(schema.shifts.punchedInAt))
        .limit(200)
    : []

  const open = rows.filter((r) => !r.s.punchedOutAt)
  const closed = rows.filter((r) => r.s.punchedOutAt)

  return (
    <>
      <div className="mb-6">
        <h1 className="app-h1">Shifts</h1>
        <p className="mt-1 app-sub">Punch-in/out history with AI-verified work summaries.</p>
      </div>

      <section className="app-card app-card-lg hover-lift mb-6">
        <div className="section-title-row">
          <h2 className="app-h2">Punched in now</h2>
          <span className="pill pill-good">{open.length} available</span>
        </div>
        {open.length === 0 ? (
          <p className="mt-3 app-sub">Nobody&apos;s on the clock right now.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {open.map(({ s, u }) => (
              <li key={s.id} className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                <CharacterAvatar characterKey={u.characterKey} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-slate-900">{u.name ?? `@${u.login}`}</p>
                  <p className="text-[11px] text-slate-600">
                    Punched in {timeAgo(s.punchedInAt.toISOString())} · via {s.punchedInVia}
                  </p>
                </div>
                <span className="pill pill-good">Available</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="app-card hover-lift">
        <div className="px-5 py-4 border-b border-slate-100 section-title-row">
          <h2 className="app-h2">Recent punch-outs</h2>
          <span className="text-[12px] text-slate-500">Last 14 days · {closed.length}</span>
        </div>
        {closed.length === 0 ? (
          <p className="p-10 text-center text-slate-500">No completed shifts yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {closed.map(({ s, u }) => (
              <ShiftRow key={s.id} shift={s} user={u} />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function ShiftRow({
  shift: s,
  user: u,
}: {
  shift: typeof schema.shifts.$inferSelect
  user: typeof schema.users.$inferSelect
}) {
  const start = s.punchedInAt
  const end = s.punchedOutAt!
  const mins = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const pill =
    s.verificationStatus === 'verified'
      ? 'pill-good'
      : s.verificationStatus === 'suspect'
        ? 'pill-bad'
        : s.verificationStatus === 'skipped'
          ? 'pill-slate'
          : 'pill-warn'
  return (
    <li className="px-5 py-4">
      <div className="flex items-start gap-3">
        <CharacterAvatar characterKey={u.characterKey} size={36} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="text-[14px] font-medium text-slate-900">{u.name ?? `@${u.login}`}</p>
            <span className="text-[12px] text-slate-500">
              {start.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
              {' → '}
              {end.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' })}
              {' · '}
              {h}h {m}m
            </span>
            <span className={`pill ${pill}`}>
              {s.verificationStatus}
              {s.verificationScore !== null ? ` · ${s.verificationScore}/100` : ''}
            </span>
          </div>
          {s.workSummary && (
            <p className="mt-2 text-[13px] text-slate-700 leading-snug whitespace-pre-line">
              <span className="font-medium text-slate-900">Summary:</span> {s.workSummary}
            </p>
          )}
          {s.verificationNotes && (
            <p className="mt-2 text-[12px] text-slate-500 leading-snug">
              <span className="font-medium">AI note:</span> {s.verificationNotes}
            </p>
          )}
        </div>
      </div>
    </li>
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
