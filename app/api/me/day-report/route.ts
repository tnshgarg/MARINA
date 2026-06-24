import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { buildDayReport, resolveRange, type ReportFormat } from '@/lib/report/day-report'

export const runtime = 'nodejs'

const FORMATS: ReportFormat[] = ['standup', 'oneonone', 'status']

/**
 * "Prove your day" — generate the signed-in user's status report for a window.
 * User-scoped (works with or without an org); deterministic assembly of their
 * real GitHub + meetings + deliverables.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.appUserId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let range = 'today'
  let format: ReportFormat = 'standup'
  try {
    const body = (await req.json()) as { range?: string; format?: string }
    if (typeof body.range === 'string') range = body.range
    if (FORMATS.includes(body.format as ReportFormat)) format = body.format as ReportFormat
  } catch {
    /* defaults */
  }

  const { from, to, label } = resolveRange(range)
  try {
    const report = await buildDayReport(session.appUserId, from, to, format, label)
    return NextResponse.json({ ok: true, report })
  } catch (err) {
    console.error('day-report failed', err)
    return NextResponse.json({ error: 'report_failed' }, { status: 500 })
  }
}
