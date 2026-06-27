import { redirect } from 'next/navigation'
import { and, eq, isNotNull } from 'drizzle-orm'
import { auth } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { listMembershipsForCurrentUser } from '@/lib/auth/guards'
import { upcomingMeetingsForUser, pastMeetingsForUser, type MeetingCard } from '@/lib/meetings/upcoming'
import { NewMeeting } from '@/components/new-meeting'

export const dynamic = 'force-dynamic'

/** Employee meetings — upcoming + recent, with a quick composer. */
export default async function MeetingsPage() {
  const session = await auth()
  if (!session?.appUserId || !session.login) redirect('/')
  const memberships = await listMembershipsForCurrentUser()
  if (!memberships[0]) redirect('/dashboard')
  const meId = session.appUserId

  const [upcoming, past, myGoogle] = await Promise.all([
    upcomingMeetingsForUser(meId),
    pastMeetingsForUser(meId),
    db.query.accounts.findFirst({
      where: and(eq(schema.accounts.userId, meId), eq(schema.accounts.provider, 'google'), isNotNull(schema.accounts.access_token)),
    }),
  ])

  return (
    <div className="px-4 pt-4 pb-10 sm:px-8 sm:pt-7 max-w-[900px] mx-auto fade-in">
      <div className="mb-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="app-h1 text-[22px] sm:text-[26px]">Meetings</h1>
          <p className="mt-1 text-[13px] text-[var(--m-ink-2)]">Your upcoming and recent meetings.</p>
        </div>
        <NewMeeting calendarConnected={!!myGoogle} />
      </div>

      {!myGoogle && (
        <div className="mb-4 rounded-xl border border-[var(--m-border)] bg-[var(--m-bg-soft)] px-4 py-3 text-[12.5px] text-[var(--m-ink-2)]">
          Connect Google Calendar on the{' '}
          <a href="/dashboard/connections" className="underline hover:text-[var(--m-ink)]">Connections</a> page to create
          meetings with Meet links and see your calendar here.
        </div>
      )}

      <Section title="Upcoming" empty="No upcoming meetings." meetings={upcoming} />
      <div className="mt-6">
        <Section title="Recent" empty="No recent meetings." meetings={past} muted />
      </div>
    </div>
  )
}

function Section({ title, meetings, empty, muted }: { title: string; meetings: MeetingCard[]; empty: string; muted?: boolean }) {
  return (
    <section>
      <h2 className="app-eyebrow mb-2">{title}</h2>
      {meetings.length === 0 ? (
        <p className="text-[13px] text-[var(--m-ink-3)] rounded-xl border border-[var(--m-border)] bg-white px-4 py-5 text-center">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {meetings.map((m) => (
            <li key={m.id}>
              <MeetingRow m={m} muted={muted} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function MeetingRow({ m, muted }: { m: MeetingCard; muted?: boolean }) {
  const start = new Date(m.startAt)
  const when = `${start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  return (
    <div className={`rounded-xl border border-[var(--m-border)] px-4 py-3 flex items-center gap-3 ${muted ? 'bg-[var(--m-bg-soft)]/40' : 'bg-white'}`}>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-[var(--m-ink)] truncate">{m.title}</p>
        <p className="text-[12px] text-[var(--m-ink-3)]">
          {when}
          {m.role === 'organiser' && <span className="ml-2 text-[11px] text-[var(--m-ink-4)]">· you organised</span>}
        </p>
      </div>
      {m.conferenceUrl && !muted && (
        <a
          href={m.conferenceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-[var(--m-border)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--m-ink-2)] hover:border-[var(--m-accent)] hover:text-[var(--m-accent-2)] transition-colors"
        >
          Join
        </a>
      )}
    </div>
  )
}
