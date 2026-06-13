import { NextResponse } from 'next/server'
import { desc } from 'drizzle-orm'
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { isAdminSession } from '@/lib/auth/admin'

export const runtime = 'nodejs'

const VALID_SEVERITY = new Set(['info', 'warn', 'critical'])
const VALID_AUDIENCE = new Set(['all', 'owners', 'managers'])

/** List every announcement (admin-only). */
export async function GET() {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const rows = await db.select().from(schema.announcements).orderBy(desc(schema.announcements.createdAt))
  return NextResponse.json({ announcements: rows })
}

/** Create a new announcement. */
export async function POST(req: Request) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const session = await auth()
  let body: {
    title?: string
    body?: string
    severity?: string
    audience?: string
    href?: string | null
    endsAt?: string | null
  }
  try {
    body = (await req.json()) ?? {}
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const title = (body.title ?? '').trim().slice(0, 200)
  const text = (body.body ?? '').trim().slice(0, 2000)
  if (title.length < 3 || text.length < 3) {
    return NextResponse.json({ error: 'title and body required' }, { status: 400 })
  }
  const severity = VALID_SEVERITY.has(body.severity ?? '') ? body.severity! : 'info'
  const audience = VALID_AUDIENCE.has(body.audience ?? '') ? body.audience! : 'all'
  const href = body.href && body.href.trim().length > 0 ? body.href.trim().slice(0, 500) : null
  const endsAt = body.endsAt ? new Date(body.endsAt) : null
  if (endsAt && Number.isNaN(endsAt.getTime())) {
    return NextResponse.json({ error: 'invalid endsAt' }, { status: 400 })
  }

  const [created] = await db
    .insert(schema.announcements)
    .values({
      title,
      body: text,
      severity,
      audience,
      href,
      endsAt,
      createdByUserId: session?.appUserId ?? null,
    })
    .returning()
  return NextResponse.json({ ok: true, announcement: created })
}
