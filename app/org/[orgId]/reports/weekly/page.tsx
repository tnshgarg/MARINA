import { notFound, redirect } from 'next/navigation'
import { HttpError, requireCapability } from '@/lib/auth/guards'
import { buildWeeklyReport } from '@/lib/reports/weekly'
import { NoAccess } from '@/components/no-access'
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
    if (err instanceof HttpError && err.status === 403) {
      return (
        <NoAccess
          title="Org-wide reports are for HR & owners"
          message="The weekly performance report ranks everyone in the workspace, so it's limited to people with full-data access. You can still see your own team on the dashboard, Workload and Activity."
          backHref={`/org/${orgId}`}
          backLabel="Back to dashboard"
        />
      )
    }
    throw err
  }

  const report = await buildWeeklyReport(orgId)
  if (!report) notFound()

  return <WeeklyReportClient report={report} orgId={orgId} />
}
