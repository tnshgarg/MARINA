import { redirect } from 'next/navigation'
import { HttpError, requireSession } from '@/lib/auth/guards'
import { EmployeeDataView } from '@/components/employee-data-view'

export const dynamic = 'force-dynamic'

/**
 * In-shell "My data" — same transparency content as /me/data, rendered inside
 * the dashboard layout (sidebar + main) so it feels part of the employee UI.
 * The old /me/data redirects here for org members.
 */
export default async function DashboardDataPage() {
  let session
  try {
    session = await requireSession()
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    throw err
  }

  return (
    <div className="px-4 pt-4 pb-10 sm:px-8 sm:pt-7 max-w-[760px] mx-auto fade-in">
      <div className="mb-5">
        <p className="app-eyebrow">Your data &amp; transparency</p>
        <h1 className="app-h1 text-[22px] sm:text-[26px] mt-0.5">Exactly what MARINA knows about you</h1>
      </div>
      <EmployeeDataView userId={session.appUserId} />
    </div>
  )
}
