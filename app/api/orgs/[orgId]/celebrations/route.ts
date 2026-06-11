import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'

export const runtime = 'nodejs'

/**
 * Upcoming celebrations across the org: birthdays + work anniversaries.
 * Window: next 30 days from today (configurable via ?days=). Designed to
 * be cheap — pulls every active member's two date columns and computes
 * the next occurrence in JavaScript.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ orgId: string }> },
) {
  const { orgId: raw } = await ctx.params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) {
    return NextResponse.json({ error: 'invalid orgId' }, { status: 400 })
  }
  const url = new URL(req.url)
  const windowDays = Math.max(7, Math.min(60, Number(url.searchParams.get('days') ?? 30)))

  try {
    await requireMembership(orgId, 'manager')

    const team = await db
      .select({
        userId: schema.users.id,
        name: schema.users.name,
        login: schema.users.login,
        characterKey: schema.users.characterKey,
        birthdayMmDd: schema.users.birthdayMmDd,
        joinedOn: schema.users.joinedOn,
      })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
      .where(
        and(
          eq(schema.memberships.orgId, orgId),
          isNull(schema.memberships.endedAt),
        ),
      )

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const horizon = new Date(today.getTime() + windowDays * 24 * 60 * 60 * 1000)

    type Item = {
      userId: number
      name: string
      login: string
      characterKey: string | null
      kind: 'birthday' | 'anniversary'
      whenIso: string
      yearsAtCompany?: number
    }
    const items: Item[] = []
    for (const m of team) {
      if (m.birthdayMmDd && /^\d{2}-\d{2}$/.test(m.birthdayMmDd)) {
        const next = nextOccurrence(today, m.birthdayMmDd)
        if (next <= horizon) {
          items.push({
            userId: m.userId,
            name: m.name ?? `@${m.login}`,
            login: m.login,
            characterKey: m.characterKey,
            kind: 'birthday',
            whenIso: isoDate(next),
          })
        }
      }
      if (m.joinedOn && /^\d{4}-\d{2}-\d{2}$/.test(m.joinedOn)) {
        const [yr, mm, dd] = m.joinedOn.split('-')
        const next = nextOccurrence(today, `${mm}-${dd}`)
        if (next <= horizon) {
          const years = next.getFullYear() - Number(yr)
          if (years >= 1) {
            items.push({
              userId: m.userId,
              name: m.name ?? `@${m.login}`,
              login: m.login,
              characterKey: m.characterKey,
              kind: 'anniversary',
              whenIso: isoDate(next),
              yearsAtCompany: years,
            })
          }
        }
      }
    }
    items.sort((a, b) => (a.whenIso < b.whenIso ? -1 : 1))

    return NextResponse.json({ items, windowDays })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('celebrations failed', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

/** Next calendar occurrence of MM-DD, today or later. */
function nextOccurrence(today: Date, mmDd: string): Date {
  const [mm, dd] = mmDd.split('-').map(Number)
  const thisYear = new Date(today.getFullYear(), mm - 1, dd)
  if (thisYear >= today) return thisYear
  return new Date(today.getFullYear() + 1, mm - 1, dd)
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
