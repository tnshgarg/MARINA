import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * Attendance regularization moved in-shell to /dashboard/attendance so it
 * inherits the employee sidebar + layout. This stub keeps any external/bookmarked
 * links working. Solo-user and 401 handling lives on the destination page.
 */
export default function MyRegularizationsRedirect() {
  redirect('/dashboard/attendance')
}
