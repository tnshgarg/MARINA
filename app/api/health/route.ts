import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Cheap, public health probe. Returns:
 *   { ok, db, ai, version, uptimeSec, env }
 *
 * - `db`: ping the database with `SELECT 1` and a 2-second timeout
 * - `ai`: returns 'configured' if at least one provider key is set
 *
 * Plug this into an uptime monitor (UptimeRobot, BetterStack, Cronitor)
 * with a 1-minute check. Page on 2 consecutive failures.
 */
export async function GET(req: Request) {
  const started = Date.now()
  let dbStatus: 'ok' | 'fail' = 'fail'
  let dbError: string | null = null
  try {
    const ping = db.execute(sql`SELECT 1 as ok`)
    await Promise.race([
      ping,
      new Promise((_, reject) => setTimeout(() => reject(new Error('db timeout')), 2000)),
    ])
    dbStatus = 'ok'
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err)
  }

  const aiStatus =
    process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY ? 'configured' : 'missing'

  // Log the real DB error server-side (where ops can see it) but NEVER return
  // it to the caller — Neon/pg error strings routinely embed the connection
  // string, host, role, and DB name. The public probe is intentionally terse.
  if (dbError) console.error('[health] db ping failed:', dbError)

  const ok = dbStatus === 'ok'

  // Detailed diagnostics are gated behind a shared secret so an uptime monitor
  // can still see them, but anonymous callers only get { ok, db, ai }.
  const url = new URL(req.url)
  const probeSecret = process.env.HEALTH_PROBE_SECRET
  const authorized =
    !!probeSecret &&
    (url.searchParams.get('token') === probeSecret ||
      req.headers.get('authorization') === `Bearer ${probeSecret}`)

  const body: Record<string, unknown> = { ok, db: dbStatus, ai: aiStatus }
  if (authorized) {
    body.env = process.env.NODE_ENV ?? 'unknown'
    body.version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev'
    body.durationMs = Date.now() - started
    body.dbError = dbError
  }
  return NextResponse.json(body, { status: ok ? 200 : 503 })
}
