import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'

/**
 * Founder / platform-admin gate.
 *
 * We don't have a "super admin" role inside the org RBAC system because that
 * would leak into every org-scoped query. Instead, we check the signed-in
 * user's email against a comma-separated env list. Operationally cleaner:
 *
 *   - One place to grant or revoke admin (Vercel env)
 *   - No "ghost owner" sitting inside a customer's workspace
 *   - Audit-friendly: the admin email is a personal account, not a team account
 *
 * Set `MARINA_ADMIN_EMAILS=tanish@marina.team,co@marina.team` in env.
 * Defaults to `thetanishgarg@gmail.com` in development so a fresh checkout
 * lights up the /admin console without extra setup.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const raw = process.env.MARINA_ADMIN_EMAILS ?? 'thetanishgarg@gmail.com'
  const allow = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return allow.includes(email.toLowerCase())
}

/**
 * Server-side guard for /admin/* server components. Redirects:
 *   - `/` if the visitor isn't signed in
 *   - `/dashboard` if they're signed in but not an admin
 *
 * Returns the authenticated session on success.
 */
export async function requireAdminOrRedirect() {
  const session = await auth()
  if (!session?.appUserId) redirect('/')
  const me = await db.query.users.findFirst({
    where: eq(schema.users.id, session.appUserId),
  })
  if (!isAdminEmail(me?.email)) redirect('/dashboard')
  return { session, me: me! }
}

/**
 * Same gate, but returns null instead of redirecting — for use inside
 * route handlers that should return 403 JSON rather than HTML.
 */
export async function isAdminSession(): Promise<boolean> {
  const session = await auth()
  if (!session?.appUserId) return false
  const me = await db.query.users.findFirst({
    where: eq(schema.users.id, session.appUserId),
  })
  return isAdminEmail(me?.email)
}
