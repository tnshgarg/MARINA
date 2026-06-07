import { eq } from 'drizzle-orm'
import { auth, signIn } from '@/auth'
import { db, schema } from '@/lib/db/client'
import AcceptInviteClient from './client'

export const dynamic = 'force-dynamic'

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

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

  return (
    <main className="min-h-screen bg-[var(--m-bg)] flex items-start justify-center pt-20 px-6">
      <div className="w-full max-w-md">
        <p className="app-eyebrow">You&apos;re invited</p>
        <h1 className="app-h1 mt-2 text-[28px]">Join your squad</h1>

        {state === 'invalid' && (
          <Message tone="error" title="Invite not found">
            The link is incorrect or has been revoked. Ask the inviter to send a new one.
          </Message>
        )}
        {state === 'expired' && (
          <Message tone="error" title="Invite expired">
            This invite to <strong>{org?.name}</strong> has expired. Ask for a fresh link.
          </Message>
        )}
        {state === 'used' && (
          <Message tone="info" title="Already accepted">
            This invite to <strong>{org?.name}</strong> has already been used.
          </Message>
        )}

        {state === 'ready' && invite && org && (
          <div className="app-card app-card-lg mt-6">
            <p className="text-[14px] text-slate-700">
              You&apos;ve been invited to join <strong className="text-slate-900">{org.name}</strong>{' '}
              as <strong>{invite.role}</strong>.
            </p>
            {signedIn ? (
              <div className="mt-4">
                <p className="text-[12px] text-slate-500 mb-3">Signed in as @{session?.login}</p>
                <AcceptInviteClient token={token} orgId={org.id} />
              </div>
            ) : (
              <form
                action={async () => {
                  'use server'
                  await signIn('github', { redirectTo: `/invite/${token}` })
                }}
                className="mt-4"
              >
                <button type="submit" className="btn-primary">Sign in with GitHub →</button>
              </form>
            )}
          </div>
        )}
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
