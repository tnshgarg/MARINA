import { notFound, redirect } from 'next/navigation'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { GiveRecognition } from '@/components/give-recognition'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Team recognition feed + a give-kudos form. Manager surface (members give/see
 *  kudos from their dashboard and Slack). */
export default async function RecognitionsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  let viewer
  try {
    viewer = await requireMembership(orgId, 'manager')
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    if (err instanceof HttpError && err.status === 403) redirect(`/org/${orgId}`)
    throw err
  }

  const fromU = alias(schema.users, 'from_u')
  const toU = alias(schema.users, 'to_u')
  const [rows, mates] = await Promise.all([
    db
      .select({
        id: schema.recognitions.id,
        message: schema.recognitions.message,
        createdAt: schema.recognitions.createdAt,
        fromName: fromU.name,
        fromLogin: fromU.login,
        toName: toU.name,
        toLogin: toU.login,
      })
      .from(schema.recognitions)
      .innerJoin(fromU, eq(schema.recognitions.fromUserId, fromU.id))
      .innerJoin(toU, eq(schema.recognitions.toUserId, toU.id))
      .where(eq(schema.recognitions.orgId, orgId))
      .orderBy(desc(schema.recognitions.createdAt))
      .limit(60),
    db
      .select({ userId: schema.memberships.userId, name: schema.users.name, login: schema.users.login })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
      .where(and(eq(schema.memberships.orgId, orgId), isNull(schema.memberships.endedAt))),
  ])
  const teammates = mates
    .filter((m) => m.userId !== viewer.session.appUserId)
    .map((m) => ({ userId: m.userId, name: m.name ?? `@${m.login}` }))

  return (
    <>
      <div className="mb-5">
        <h1 className="app-h1">Recognition</h1>
        <p className="mt-1.5 text-[13px] text-[var(--m-ink-2)]">
          Celebrate good work. Marina shares each kudos in #all-marina and the recipient&apos;s inbox.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr] items-start">
        <GiveRecognition orgId={orgId} teammates={teammates} />
        <div className="space-y-2.5">
          {rows.length === 0 ? (
            <p className="text-[13px] text-[var(--m-ink-3)]">No recognitions yet — be the first.</p>
          ) : (
            rows.map((r) => (
              <article key={r.id} className="rounded-xl border border-[var(--m-border)] bg-white p-4">
                <p className="text-[13px] text-[var(--m-ink)]">
                  <span className="font-semibold">{r.toName ?? `@${r.toLogin}`}</span>{' '}
                  <span className="text-[var(--m-ink-4)]">recognized by</span>{' '}
                  <span className="font-medium">{r.fromName ?? `@${r.fromLogin}`}</span>
                </p>
                <p className="mt-1 text-[13px] text-[var(--m-ink-2)] leading-snug">{r.message}</p>
                <p className="mt-1.5 text-[11px] text-[var(--m-ink-4)]">
                  {new Date(r.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </p>
              </article>
            ))
          )}
        </div>
      </div>
    </>
  )
}
