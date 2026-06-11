import { and, eq, isNull } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth, signIn } from '@/auth'
import { db, schema } from '@/lib/db/client'
import AcceptInviteClient from './client'
import InviteAuthOptions from './auth-options'

export const dynamic = 'force-dynamic'

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  // Always save the invite token in an HttpOnly cookie so it survives the
  // sign-in detour (GitHub OAuth or magic link verify). Root path reads it
  // after auth and redirects back here to accept.
  const jar = await cookies()
  jar.set('marina_pending_invite', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 30 * 60, // 30 minutes
  })

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

  // Auto-accept: if the viewer is signed in AND the invite is ready, just
  // create the membership server-side and redirect into the org. Avoids the
  // extra "Accept and join" click after a fresh OAuth/magic-link sign-in.
  if (signedIn && state === 'ready' && invite && org && session?.appUserId) {
    try {
      const existing = await db.query.memberships.findFirst({
        where: and(
          eq(schema.memberships.orgId, invite.orgId),
          eq(schema.memberships.userId, session.appUserId),
        ),
      })
      if (!existing) {
        await db.insert(schema.memberships).values({
          orgId: invite.orgId,
          userId: session.appUserId,
          role: invite.role,
        })
      }
      await db
        .update(schema.invites)
        .set({ acceptedAt: new Date() })
        .where(and(eq(schema.invites.id, invite.id), isNull(schema.invites.acceptedAt)))
      jar.delete('marina_pending_invite')
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
    await signIn('github', { redirectTo: `/invite/${token}` })
  }
  async function gSignIn() {
    'use server'
    await signIn('google', { redirectTo: `/invite/${token}` })
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 flex items-start justify-center pt-20 px-6">
      <div className="w-full max-w-md">
        <p className="text-[11px] uppercase tracking-widest text-indigo-600 font-semibold">
          You&apos;re invited
        </p>
        <h1 className="text-[32px] font-semibold tracking-tight text-slate-900 mt-2">Join your squad</h1>

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
          <Message tone="info" title="Already accepted">
            This invite to <strong>{org?.name}</strong> has already been used. Sign in to access it.
          </Message>
        )}

        {state === 'ready' && invite && org && (
          <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white font-semibold inline-flex items-center justify-center">
                {org.name.charAt(0).toUpperCase()}
              </span>
              <div>
                <p className="text-[14px] text-slate-700">
                  Join <strong className="text-slate-900">{org.name}</strong>
                </p>
                <p className="text-[12px] text-slate-500">
                  Role · <span className="text-slate-700 font-medium">{invite.role}</span>
                </p>
              </div>
            </div>

            {signedIn ? (
              <div>
                <p className="text-[12px] text-slate-500 mb-3">
                  Signed in as @{session?.login}
                </p>
                <AcceptInviteClient token={token} orgId={org.id} />
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

        <p className="mt-6 text-center text-[11px] text-slate-400">
          By accepting, you agree to MARINA's{' '}
          <a href="/terms" className="underline hover:text-slate-600">Terms</a>{' '}·{' '}
          <a href="/privacy" className="underline hover:text-slate-600">Privacy</a>
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
  const bg = tone === 'error' ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-white border-slate-200 text-slate-900'
  return (
    <div className={`mt-6 rounded-2xl border p-4 ${bg}`}>
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-[13px] opacity-80">{children}</p>
    </div>
  )
}
