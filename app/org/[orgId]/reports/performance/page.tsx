import { notFound, redirect } from 'next/navigation'
import { HttpError, requireCapability } from '@/lib/auth/guards'
import { buildPerformanceReport } from '@/lib/reports/performance'
import { NoAccess } from '@/components/no-access'
import PerformanceReportClient from './client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Printable performance review. Renders a clean A4-shaped page that the
 * manager downloads as PDF via the browser's print dialog (⌘P → Save as
 * PDF). No server-side PDF library — the print CSS does the work.
 *
 * Search params:
 *   - userId: required, the employee being reviewed
 *   - from / to: ISO date strings (yyyy-mm-dd). Defaults to last 30 days.
 *
 * Access is gated on `view_all_data` so plain managers without HR rights
 * can't review every teammate by URL-hacking.
 */
export default async function PerformanceReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>
  searchParams: Promise<{ userId?: string; from?: string; to?: string }>
}) {
  const { orgId: raw } = await params
  const sp = await searchParams
  const orgId = Number(raw)
  const userId = Number(sp.userId)
  if (!Number.isInteger(orgId) || !Number.isInteger(userId)) notFound()

  try {
    await requireCapability(orgId, 'view_all_data')
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    if (err instanceof HttpError && err.status === 403) {
      return (
        <NoAccess
          title="You can't open this report"
          message="Individual performance reports are limited to people with full-data access (HR & owners). If you manage this person and need their report, ask an owner to grant you access."
          backHref={`/org/${orgId}`}
          backLabel="Back to dashboard"
        />
      )
    }
    throw err
  }

  const today = new Date()
  const defaultStart = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
  const start = sp.from ? new Date(sp.from + 'T00:00:00Z') : defaultStart
  const end = sp.to ? new Date(sp.to + 'T23:59:59Z') : today
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
    notFound()
  }

  const report = await buildPerformanceReport({ orgId, userId, start, end })
  if (!report) notFound()

  return <PerformanceReportClient report={report} />
}
