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
export async function GET() {
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

  const aiKeys = {
    openai: !!process.env.OPENAI_API_KEY,
    groq: !!process.env.GROQ_API_KEY,
  }
  const aiStatus = aiKeys.openai || aiKeys.groq ? 'configured' : 'missing'

  const ok = dbStatus === 'ok'
  const body = {
    ok,
    db: dbStatus,
    dbError,
    ai: aiStatus,
    aiKeys,
    env: process.env.NODE_ENV ?? 'unknown',
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
    durationMs: Date.now() - started,
  }
  return NextResponse.json(body, { status: ok ? 200 : 503 })
}
