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
    <main className="min-h-screen bg-zinc-50 dark:bg-black flex items-start justify-center pt-20 px-6">
      <div className="w-full max-w-md">
        <p className="text-xs uppercase tracking-widest text-zinc-500">Project MARINA</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Team invite
        </h1>

        {state === 'invalid' && (
          <Message tone="error" title="Invite not found">
            The link is incorrect or has been revoked. Ask the inviter to send a new one.
          </Message>
        )}
        {state === 'expired' && (
          <Message tone="error" title="Invite expired">
            This invite to <strong>{org?.name}</strong> has expired. Ask the inviter to send a fresh one.
          </Message>
        )}
        {state === 'used' && (
          <Message tone="info" title="Already accepted">
            This invite to <strong>{org?.name}</strong> has already been used.
          </Message>
        )}

        {state === 'ready' && invite && org && (
          <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              You&apos;ve been invited to join <strong>{org.name}</strong> as <strong>{invite.role}</strong>.
            </p>

            {signedIn ? (
              <div className="mt-4">
                <p className="text-xs text-zinc-500 mb-2">Signed in as @{session?.login}</p>
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
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Sign in with GitHub to accept
                </button>
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
  const colour =
    tone === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200'
      : 'border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100'
  return (
    <div className={`mt-6 rounded-lg border p-4 ${colour}`}>
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm">{children}</p>
    </div>
  )
}
