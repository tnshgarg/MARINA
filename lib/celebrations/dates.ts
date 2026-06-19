import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

/**
 * Birthday / work-anniversary date helpers. The same `nextOccurrence` logic the
 * celebrations API uses, plus `todaysCelebrations` for the cron that fires the
 * notify() broadcasts. Kept here so both surfaces share one implementation.
 */
export type Celebration = {
  userId: number
  name: string
  login: string
  kind: 'birthday' | 'anniversary'
  years?: number
}

/** Next calendar occurrence of MM-DD, today or later. */
export function nextOccurrence(today: Date, mmDd: string): Date {
  const [mm, dd] = mmDd.split('-').map(Number)
  const thisYear = new Date(today.getFullYear(), mm - 1, dd)
  if (thisYear >= today) return thisYear
  return new Date(today.getFullYear() + 1, mm - 1, dd)
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** Birthdays + work anniversaries falling on TODAY for an org's active members. */
export async function todaysCelebrations(orgId: number): Promise<Celebration[]> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const team = await db
    .select({
      userId: schema.users.id,
      name: schema.users.name,
      login: schema.users.login,
      birthdayMmDd: schema.users.birthdayMmDd,
      joinedOn: schema.users.joinedOn,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt)))

  const out: Celebration[] = []
  for (const m of team) {
    const name = m.name ?? `@${m.login}`
    if (m.birthdayMmDd && /^\d{2}-\d{2}$/.test(m.birthdayMmDd)) {
      if (isSameDay(nextOccurrence(today, m.birthdayMmDd), today)) {
        out.push({ userId: m.userId, name, login: m.login, kind: 'birthday' })
      }
    }
    if (m.joinedOn && /^\d{4}-\d{2}-\d{2}$/.test(m.joinedOn)) {
      const [yr, mm, dd] = m.joinedOn.split('-')
      const next = nextOccurrence(today, `${mm}-${dd}`)
      if (isSameDay(next, today)) {
        const years = next.getFullYear() - Number(yr)
        if (years >= 1) out.push({ userId: m.userId, name, login: m.login, kind: 'anniversary', years })
      }
    }
  }
  return out
}
