import { notFound, redirect } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireMembership } from '@/lib/auth/guards'
import { AnnouncementsFeed } from '@/components/announcements-feed'
import ComposeAnnouncement from './compose'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Manager composer + feed for org-wide team announcements. Members read these
 *  via their dashboard, their inbox, and #all-marina. */
export default async function AnnouncementsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: raw } = await params
  const orgId = Number(raw)
  if (!Number.isInteger(orgId)) notFound()

  try {
    await requireMembership(orgId, 'manager')
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    if (err instanceof HttpError && err.status === 403) redirect(`/org/${orgId}`)
    throw err
  }

  const rows = await db
    .select({
      id: schema.orgAnnouncements.id,
      title: schema.orgAnnouncements.title,
      body: schema.orgAnnouncements.body,
      createdAt: schema.orgAnnouncements.createdAt,
      authorName: schema.users.name,
      authorLogin: schema.users.login,
    })
    .from(schema.orgAnnouncements)
    .innerJoin(schema.users, eq(schema.orgAnnouncements.authorUserId, schema.users.id))
    .where(eq(schema.orgAnnouncements.orgId, orgId))
    .orderBy(desc(schema.orgAnnouncements.createdAt))
    .limit(50)
  const items = rows.map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    createdAt: a.createdAt.toISOString(),
    authorName: a.authorName,
    authorLogin: a.authorLogin,
  }))

  return (
    <>
      <div className="mb-5">
        <h1 className="app-h1">Announcements</h1>
        <p className="mt-1.5 text-[13px] text-[var(--m-ink-2)]">
          Post an update to the whole team. Marina shares it in #all-marina and everyone&apos;s inbox.
        </p>
      </div>
      <div className="max-w-2xl space-y-4">
        <ComposeAnnouncement orgId={orgId} />
        {items.length === 0 ? (
          <p className="text-[13px] text-[var(--m-ink-3)]">No announcements yet.</p>
        ) : (
          <AnnouncementsFeed items={items} title="Posted" />
        )}
      </div>
    </>
  )
}
