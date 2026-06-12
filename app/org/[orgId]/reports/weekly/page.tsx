import { notFound, redirect } from 'next/navigation'
import { HttpError, requireCapability } from '@/lib/auth/guards'
import { buildWeeklyReport } from '@/lib/reports/weekly'
import WeeklyReportClient from './client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Weekly performance report. Gated on `view_all_data` — this is an HR
 * surface, not something every manager should see for the whole org.
 * A manager with reports-only access can still review their own reports
 * via the per-employee PDF; this is the org-wide ranking.
 */
export default async function WeeklyReportPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  try {
    await requireCapability(orgId, 'view_all_data')
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    if (err instanceof HttpError && err.status === 403) redirect(`/org/${orgId}`)
    throw err
  }

  const report = await buildWeeklyReport(orgId)
  if (!report) notFound()

  return <WeeklyReportClient report={report} orgId={orgId} />
}
