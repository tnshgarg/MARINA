import { desc } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { loadAllOrgKpis } from '@/lib/admin/analytics'
import { BroadcastClient } from './client'

export const dynamic = 'force-dynamic'

export default async function AdminBroadcastPage() {
  const [orgs, announcements] = await Promise.all([
    loadAllOrgKpis(),
    db
      .select()
      .from(schema.announcements)
      .orderBy(desc(schema.announcements.createdAt))
      .limit(30),
  ])
  return (
    <div>
      <header className="mb-7">
        <p className="text-[11px] tracking-widest uppercase text-amber-400/80 font-semibold">
          Founder console
        </p>
        <h1 className="font-display text-[32px] leading-tight mt-1 text-white">Broadcast</h1>
        <p className="text-[13.5px] text-slate-400 mt-1">
          Trigger digests on demand, post in-app announcements, and ping customers when something
          important changes.
        </p>
      </header>
      <BroadcastClient
        orgs={orgs.map((o) => ({ orgId: o.orgId, name: o.name, plan: o.plan }))}
        initialAnnouncements={announcements.map((a) => ({
          id: a.id,
          title: a.title,
          body: a.body,
          severity: a.severity,
          audience: a.audience,
          href: a.href,
          startsAt: a.startsAt.toISOString(),
          endsAt: a.endsAt?.toISOString() ?? null,
        }))}
      />
    </div>
  )
}
