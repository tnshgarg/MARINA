import { notFound, redirect } from 'next/navigation'
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireScope } from '@/lib/auth/guards'
import { SCREENSHOTS_ENABLED } from '@/lib/flags'
import ShiftsClient, { type RangeKey, type ShiftDTO, RANGES } from './client'

export const dynamic = 'force-dynamic'

function parseRange(raw: string | undefined): RangeKey {
  if (raw === '7d' || raw === '30d' || raw === 'all') return raw
  return 'today'
}

function sinceFor(range: RangeKey): Date | null {
  if (range === 'today') {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }
  const cfg = RANGES.find((r) => r.key === range)!
  if (cfg.days == null) return null
  return new Date(Date.now() - cfg.days * 24 * 60 * 60 * 1000)
}

export default async function ShiftsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>
  searchParams: Promise<{ range?: string }>
}) {
  const { orgId: raw } = await params
  const sp = await searchParams
  const range = parseRange(sp.range)
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
    .where(and(eq(schema.memberships.orgId, orgId), sql`${schema.memberships.endedAt} IS NULL`))
  const userIds = memberRows
    .map((m) => m.userId)
    .filter((id) => scope.isAdminScope || scope.userIds.has(id))

  const since = sinceFor(range)

  const baseWhere = userIds.length
    ? since
      ? and(inArray(schema.shifts.userId, userIds), gte(schema.shifts.punchedInAt, since))
      : inArray(schema.shifts.userId, userIds)
    : undefined

  const rows = userIds.length
    ? await db
        .select({ s: schema.shifts, u: schema.users })
        .from(schema.shifts)
        .innerJoin(schema.users, eq(schema.shifts.userId, schema.users.id))
        .where(baseWhere)
        .orderBy(desc(schema.shifts.punchedInAt))
        .limit(500)
    : []

  // Serialize to plain, JSON-safe DTOs (dates → ISO strings) so the client
  // component can do the grouping + stat math without touching the DB.
  const shifts: ShiftDTO[] = rows.map(({ s, u }) => ({
    id: s.id,
    userId: u.id,
    userName: u.name,
    userLogin: u.login,
    characterKey: u.characterKey,
    punchedInAt: s.punchedInAt.toISOString(),
    punchedOutAt: s.punchedOutAt ? s.punchedOutAt.toISOString() : null,
    workSummary: s.workSummary,
    verificationStatus: s.verificationStatus,
    verificationScore: s.verificationScore,
    verificationNotes: s.verificationNotes,
    punchedInVia: s.punchedInVia,
  }))

  // GATEKEPT: the AI verification column (score / verified / suspect) depends on
  // screen evidence, so it's hidden while the screenshot feature is off — the
  // page still shows the shift times + summaries, just no AI judgment.
  return <ShiftsClient orgId={orgId} range={range} shifts={shifts} showVerification={SCREENSHOTS_ENABLED} />
}
