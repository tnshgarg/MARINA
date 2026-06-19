import { and, eq, isNull, ne } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth, signIn } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { afterResponse } from '@/lib/after'
import { welcomeNewMember } from '@/lib/onboarding/welcome'
import AcceptInviteClient from './client'
import InviteAuthOptions from './auth-options'

export const dynamic = 'force-dynamic'

// Cookie config shared between the sign-in server actions below. The cookie
// survives the OAuth detour so the root path can redirect the signed-in user
// straight back into accepting this invite.
const PENDING_INVITE_COOKIE = 'marina_pending_invite'
function pendingInviteCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 30 * 60, // 30 minutes
  }
}

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ auth_error?: string }>
}) {
  const { token } = await params
  const sp = await searchParams
  const authError = sp.auth_error ?? null

  const row = await db
    .select({ invite: schema.invites, org: schema.orgs })
    .from(schema.invites)
    .innerJoin(schema.orgs, eq(schema.invites.orgId, schema.orgs.id))
    .where(eq(schema.invites.token, token))
    .limit(1)
    .then((rows) => rows[0])

  const invite = row?.invite ?? null
  const org = row?.org ?? null

  let state: 'invalid' | 'expired' | 'used' | 'ready' = 'invalid'
  if (invite && org) {
    if (invite.acceptedAt) state = 'used'
    else if (invite.expiresAt.getTime() < Date.now()) state = 'expired'
    else state = 'ready'
  }

  const session = await auth()
  const signedIn = !!session?.appUserId

  // Load the signed-in user's email so we can verify it matches the invite.
  // An invite is addressed to a specific person — it must NOT be redeemable by
  // whoever happens to hold the link on a different account.
  const me = signedIn && session?.appUserId
    ? await db.query.users.findFirst({ where: eq(schema.users.id, session.appUserId) })
    : null
  const emailMatches =
    !!me?.email &&
    !!invite?.email &&
    me.email.trim().toLowerCase() === invite.email.trim().toLowerCase()
  const emailMismatch = signedIn && state === 'ready' && !emailMatches

  // Seamless re-entry: if the invite was already accepted AND the viewer is
  // signed in AND already has a membership for that org, just take them in.
  // This handles the common case where someone reopens an old invite link.
  if (state === 'used' && signedIn && invite && org && session?.appUserId) {
    const m = await db.query.memberships.findFirst({
      where: and(
        eq(schema.memberships.orgId, invite.orgId),
        eq(schema.memberships.userId, session.appUserId),
      ),
    })
    if (m) {
      const { roleAtLeast } = await import('@/lib/auth/guards')
      redirect(roleAtLeast(m.role, 'manager') ? `/org/${org.id}` : '/dashboard')
    }
  }

  // Auto-accept: if the viewer is signed in AND the invite is ready, just
  // create the membership server-side and redirect into the org. Avoids the
  // extra "Accept and join" click after a fresh OAuth/magic-link sign-in.
  //
  // EXCEPTION: when we have NO GitHub identity for the user yet (no githubId AND
  // no saved github username — e.g. they signed in via Google or a magic link),
  // we DON'T auto-accept. Instead we fall through to the form so they can type
  // their GitHub username, which lets the org's GitHub App attribute their
  // commits/PRs without a per-employee OAuth link. Users who already have a
  // githubId (OAuth) or a saved githubLogin keep their zero-click accept.
  const knowsGithubIdentity = me?.githubId != null || !!me?.githubLogin
  if (signedIn && state === 'ready' && emailMatches && invite && org && session?.appUserId && knowsGithubIdentity) {
    try {
      const { seatCapError } = await import('@/lib/billing/seats')
      const capError = await seatCapError(invite.orgId)
      if (capError) throw new Error(capError)

      const inviteDiscipline = (invite as { discipline?: string }).discipline ?? 'other'
      const inviteJobTitle = (invite as { jobTitle?: string | null }).jobTitle ?? null
      // One account = one workspace: if they're already active in a different
      // org, don't auto-accept (the manual Accept button hits the API, which
      // enforces the same rule and shows a clear message).
      const otherActive = await db.query.memberships.findFirst({
        where: and(
          eq(schema.memberships.userId, session.appUserId),
          isNull(schema.memberships.endedAt),
          ne(schema.memberships.orgId, invite.orgId),
        ),
      })
      if (otherActive) {
        throw new Error('account already in another workspace')
      }
      const existing = await db.query.memberships.findFirst({
        where: and(
          eq(schema.memberships.orgId, invite.orgId),
          eq(schema.memberships.userId, session.appUserId),
        ),
      })
      const joined = !existing || !!existing.endedAt
      if (!existing) {
        await db.insert(schema.memberships).values({
          orgId: invite.orgId,
          userId: session.appUserId,
          role: invite.role,
          discipline: inviteDiscipline as never,
          jobTitle: inviteJobTitle,
        })
      } else if (existing.endedAt) {
        // Re-invited ex-member: reactivate rather than leaving them removed.
        await db
          .update(schema.memberships)
          .set({ endedAt: null, role: invite.role })
          .where(eq(schema.memberships.id, existing.id))
      }
      await db
        .update(schema.invites)
        .set({ acceptedAt: new Date() })
        .where(and(eq(schema.invites.id, invite.id), isNull(schema.invites.acceptedAt)))
      if (joined) {
        const newUserId = session.appUserId!
        afterResponse(() => welcomeNewMember(invite.orgId, newUserId), 'welcome new member (auto)')
      }
      // The pending-invite cookie has a 30 min TTL — we can't delete it from
      // a server component in Next 16, but it'll expire on its own and the
      // root path checks for an active membership before honouring it.
      redirect(`/org/${org.id}`)
    } catch (err) {
      // NEXT_REDIRECT must bubble
      if (
        err && typeof err === 'object' && 'digest' in err &&
        typeof (err as { digest?: unknown }).digest === 'string' &&
        ((err as { digest: string }).digest).includes('NEXT_REDIRECT')
      ) throw err
      console.error('[invite] auto-accept failed', err)
      // Fall through to manual Accept button
    }
  }

  async function ghSignIn() {
    'use server'
    // Server actions CAN write cookies — set the pending-invite cookie
    // here so it survives the OAuth detour. The root path reads it after
    // auth and redirects back to /invite/[token].
    const jar = await cookies()
    jar.set(PENDING_INVITE_COOKIE, token, pendingInviteCookieOptions())
    await signIn('github', { redirectTo: `/invite/${token}` })
  }
  async function gSignIn() {
    'use server'
    const jar = await cookies()
    jar.set(PENDING_INVITE_COOKIE, token, pendingInviteCookieOptions())
    await signIn('google', { redirectTo: `/invite/${token}` })
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[var(--m-bg-soft)] via-white to-[var(--m-accent-soft)] flex items-start justify-center pt-20 px-6">
      <div className="w-full max-w-md">
        <p className="text-[11px] uppercase tracking-widest text-[var(--m-accent)] font-semibold">
          You&apos;re invited
        </p>
        <h1 className="text-[32px] font-semibold tracking-tight text-[var(--m-ink)] mt-2">Join your squad</h1>

        {authError === 'invalid_or_expired_link' && state === 'ready' && (
          <Message tone="error" title="That sign-in link expired">
            The magic link in your email is good for 60 minutes after we send it.
            Pick an option below to get a fresh one — your invite is still valid.
          </Message>
        )}

        {emailMismatch && (
          <Message tone="error" title="This invite is for a different email">
            You&apos;re signed in as <strong>{me?.email}</strong>, but this invite was sent to{' '}
            <strong>{invite?.email}</strong>. Sign out and sign back in with{' '}
            <strong>{invite?.email}</strong> to accept it, or ask the inviter to re-send it to your address.
          </Message>
        )}

        {state === 'invalid' && (
          <Message tone="error" title="Invite not found">
            The link is incorrect or has been revoked. Ask the inviter to send a new one.
          </Message>
        )}
        {state === 'expired' && (
          <Message tone="error" title="Invite expired">
            This invite to <strong>{org?.name}</strong> has expired. Ask the inviter for a fresh link.
          </Message>
        )}
        {state === 'used' && (
          <div className="mt-6 bg-white rounded-2xl border border-[var(--m-border)] shadow-sm p-6">
            <p className="text-[11px] uppercase tracking-widest text-[var(--m-ink-3)] font-semibold">
              Welcome back
            </p>
            <p className="mt-1 text-[15px] text-[var(--m-ink-2)]">
              This invite to <strong className="text-[var(--m-ink)]">{org?.name}</strong> has already
              been used. Sign in to jump straight into the workspace.
            </p>
            <div className="mt-5">
              {signedIn ? (
                <Message tone="info" title="You're signed in, but not a member yet">
                  Ask an admin of <strong>{org?.name}</strong> to send you a fresh invite — the
                  original link has been consumed.
                </Message>
              ) : (
                <InviteAuthOptions
                  token={token}
                  email={invite?.email ?? ''}
                  githubSignIn={ghSignIn}
                  googleSignIn={process.env.GOOGLE_SSO_CLIENT_ID ? gSignIn : undefined}
                />
              )}
            </div>
          </div>
        )}

        {state === 'ready' && invite && org && (
          <div className="mt-6 bg-white rounded-2xl border border-[var(--m-border)] shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--m-accent)] to-[var(--m-clay)] text-white font-semibold inline-flex items-center justify-center">
                {org.name.charAt(0).toUpperCase()}
              </span>
              <div>
                <p className="text-[14px] text-[var(--m-ink-2)]">
                  Join <strong className="text-[var(--m-ink)]">{org.name}</strong>
                </p>
                <p className="text-[12px] text-[var(--m-ink-3)]">
                  Role · <span className="text-[var(--m-ink-2)] font-medium">{invite.role}</span>
                </p>
              </div>
            </div>

            {signedIn ? (
              <div>
                <p className="text-[12px] text-[var(--m-ink-3)] mb-3">
                  Signed in as @{session?.login}
                </p>
                <AcceptInviteClient
                  token={token}
                  orgId={org.id}
                  showGithubField={me?.githubId == null && !me?.githubLogin}
                  prefillGithub={me?.githubLogin ?? ''}
                />
              </div>
            ) : (
              <InviteAuthOptions
                token={token}
                email={invite.email}
                githubSignIn={ghSignIn}
                googleSignIn={process.env.GOOGLE_SSO_CLIENT_ID ? gSignIn : undefined}
              />
            )}
          </div>
        )}

        <p className="mt-6 text-center text-[11px] text-[var(--m-ink-4)]">
          By accepting, you agree to MARINA's{' '}
          <a href="/terms" className="underline hover:text-[var(--m-ink-2)]">Terms</a>{' '}·{' '}
          <a href="/privacy" className="underline hover:text-[var(--m-ink-2)]">Privacy</a>
        </p>
      </div>
    </main>
  )
}

function Message({
  tone,
  title,
  children,
}: {
  tone: 'error' | 'info'
  title: string
  children: React.ReactNode
}) {
  const bg = tone === 'error' ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-white border-[var(--m-border)] text-[var(--m-ink)]'
  return (
    <div className={`mt-6 rounded-2xl border p-4 ${bg}`}>
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-[13px] opacity-80">{children}</p>
    </div>
  )
}
