import { and, desc, eq, gte } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db, schema } from '@/lib/db/client'
import { requireSessionOrRedirect } from '@/lib/auth/guards'
import PersonalPageHeader from '@/components/personal-page-header'
import { SCREENSHOTS_ENABLED } from '@/lib/flags'

export const dynamic = 'force-dynamic'

const SIGNAL_PILL = {
  work: 'pill-good',
  non_work: 'pill-bad',
  ambiguous: 'pill-slate',
} as const

export default async function MyShotsPage() {
  const session = await requireSessionOrRedirect()
  // GATEKEPT: feature disabled — a direct visit shouldn't surface the
  // screenshots gallery, so send people to their data page instead.
  if (!SCREENSHOTS_ENABLED) redirect('/me/data')
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000)

  const rows = await db
    .select({ shot: schema.screenshots, analysis: schema.shotAnalyses })
    .from(schema.screenshots)
    .leftJoin(schema.shotAnalyses, eq(schema.shotAnalyses.screenshotId, schema.screenshots.id))
    .where(
      and(
        eq(schema.screenshots.userId, session.appUserId),
        gte(schema.screenshots.capturedAt, since)
      )
    )
    .orderBy(desc(schema.screenshots.capturedAt))

  return (
    <main className="min-h-screen bg-[var(--m-bg)]">
      <PersonalPageHeader
        eyebrow="My captures"
        title="Last 48 hours of screenshots"
        current="shots"
      />

      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="app-card app-card-lg">
          <p className="text-[13px] text-[var(--m-ink-2)]">
            Only <strong className="text-[var(--m-ink)]">derived labels</strong> are shown to your manager.
            The raw images live for 48 hours so you can review what was captured, then auto-purge.
            Nobody else can see the pixels.
          </p>
        </div>

        <ul className="mt-6 app-card divide-y divide-[var(--m-border-soft)]">
          {rows.length === 0 && (
            <li className="px-5 py-10 text-center text-[var(--m-ink-3)]">
              No captures in the last 48 hours.
            </li>
          )}
          {rows.map(({ shot, analysis }) => (
            <li key={shot.id} className="px-5 py-4 flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-[var(--m-ink)]">
                  {new Date(shot.capturedAt).toLocaleString()}
                </p>
                {analysis ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={`pill ${SIGNAL_PILL[analysis.workAppLabel as keyof typeof SIGNAL_PILL] ?? 'pill-slate'}`}>
                      {analysis.workAppLabel}
                    </span>
                    <span className="pill pill-violet">{analysis.appCategory}</span>
                    <span className="pill pill-sky">{analysis.visibleContentHint}</span>
                    <span className="text-[12px] text-[var(--m-ink-3)]">
                      {analysis.confidence}% conf · progress {analysis.progressScore}/100
                    </span>
                  </div>
                ) : (
                  <p className="mt-1 text-[12px] text-[var(--m-ink-3)]">No analysis yet.</p>
                )}
              </div>
              <p className="text-[11px] uppercase tracking-wider text-[var(--m-ink-3)] shrink-0">
                {shot.deletedAt
                  ? 'image purged'
                  : `auto-purges ${new Date(shot.expiresAt).toLocaleTimeString()}`}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
