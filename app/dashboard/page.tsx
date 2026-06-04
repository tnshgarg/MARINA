import { redirect } from 'next/navigation'
import { and, desc, eq, gte } from 'drizzle-orm'
import { auth, signOut } from '@/auth'
import { db, schema } from '@/lib/db/client'
import DashboardClient from './client'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.appUserId || !session.login) redirect('/')

  const periodEnd = new Date()
  const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [events, latestNarrative] = await Promise.all([
    db
      .select()
      .from(schema.githubEvents)
      .where(
        and(
          eq(schema.githubEvents.userId, session.appUserId),
          gte(schema.githubEvents.occurredAt, periodStart)
        )
      )
      .orderBy(desc(schema.githubEvents.occurredAt))
      .limit(200),
    db
      .select()
      .from(schema.narratives)
      .where(eq(schema.narratives.userId, session.appUserId))
      .orderBy(desc(schema.narratives.createdAt))
      .limit(1)
      .then((rows) => rows[0]),
  ])

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-zinc-500">Project MARINA</p>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              @{session.login}
            </h1>
          </div>
          <form
            action={async () => {
              'use server'
              await signOut({ redirectTo: '/' })
            }}
          >
            <button
              type="submit"
              className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <DashboardClient
        initialEvents={events.map(serializeEvent)}
        initialNarrative={latestNarrative ? serializeNarrative(latestNarrative) : null}
        periodStart={periodStart.toISOString()}
        periodEnd={periodEnd.toISOString()}
      />
    </main>
  )
}

function serializeEvent(e: typeof schema.githubEvents.$inferSelect) {
  return {
    id: e.id,
    type: e.type,
    repo: e.repo,
    title: e.title,
    url: e.url,
    occurredAt: e.occurredAt.toISOString(),
  }
}

function serializeNarrative(n: typeof schema.narratives.$inferSelect) {
  return {
    id: n.id,
    body: n.body,
    signal: n.signal,
    blockers: n.blockers,
    provider: n.provider,
    model: n.model,
    periodStart: n.periodStart.toISOString(),
    periodEnd: n.periodEnd.toISOString(),
    createdAt: n.createdAt.toISOString(),
  }
}
