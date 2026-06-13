import { and, gt, isNull, or, lte, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

/**
 * Server-rendered banner that shows the most recent founder-authored
 * announcement to every signed-in user. Lives at the top of the org and
 * dashboard shells.
 *
 * Visibility rules:
 *   - `startsAt <= now` and (`endsAt IS NULL` OR `endsAt > now`)
 *   - `audience='all'` always shows. Owners/Managers audience filtering is
 *     done at the caller (we pass the viewer's role).
 */
export async function AnnouncementBanner({ viewerRole }: { viewerRole?: 'admin' | 'manager' | 'lead' | 'member' }) {
  const now = new Date()
  const rows = await db
    .select()
    .from(schema.announcements)
    .where(
      and(
        lte(schema.announcements.startsAt, now),
        or(isNull(schema.announcements.endsAt), gt(schema.announcements.endsAt, now)),
      ),
    )
    .orderBy(sql`${schema.announcements.startsAt} DESC`)
    .limit(1)
    .catch(() => [])

  const a = rows[0]
  if (!a) return null

  // Audience filter
  if (a.audience === 'admins' && viewerRole !== 'admin') return null
  if (a.audience === 'managers' && viewerRole !== 'admin' && viewerRole !== 'manager' && viewerRole !== 'lead') return null

  const palette =
    a.severity === 'critical'
      ? { bg: 'bg-rose-50 border-rose-200', dot: 'bg-rose-500', ink: 'text-rose-900' }
      : a.severity === 'warn'
        ? { bg: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500', ink: 'text-amber-900' }
        : { bg: 'bg-[var(--m-accent-soft)] border-[var(--m-accent)]/30', dot: 'bg-[var(--m-accent)]', ink: 'text-[var(--m-accent-2)]' }

  return (
    <div className={`flex items-start gap-2.5 px-4 py-2.5 border-b ${palette.bg}`}>
      <span className={`mt-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0 ${palette.dot}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-[12.5px] font-medium ${palette.ink}`}>{a.title}</p>
        <p className={`text-[11.5px] mt-0.5 ${palette.ink} opacity-90 truncate`}>{a.body}</p>
      </div>
      {a.href && (
        <a
          href={a.href}
          className={`shrink-0 text-[11.5px] font-medium underline ${palette.ink}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn more →
        </a>
      )}
    </div>
  )
}
