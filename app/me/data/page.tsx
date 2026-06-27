import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * The "what MARINA knows about you" transparency page moved in-shell to
 * /dashboard/data so it inherits the employee sidebar + layout. This stub keeps
 * external/bookmarked links working. Auth + content live on the destination.
 */
export default function MyDataRedirect() {
  redirect('/dashboard/data')
}
