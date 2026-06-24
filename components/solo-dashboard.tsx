import Link from 'next/link'
import { and, desc, eq, gte, isNull, like, lt, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { PunchControl } from './punch-control'
import { PinTabHint } from './pin-tab-hint'
import { TrackedRepos } from './tracked-repos'
import { PunchGate } from './punch-gate'
import { Contacts, type Contact } from './contacts'
import { DayReport } from './day-report'
import { LogDeliverable } from './log-deliverable'
import { ConnectWork } from './connect-work'
import { BookingLink } from './booking-link'
import { MyChat } from './my-chat'

/**
 * The no-org employee dashboard — "prove your day". A focused, full-width
 * personal console for someone using Marina for THEMSELVES. The point of the
 * product: your workday is captured automatically (GitHub + meetings) and your
 * status report is always already written. No employer/manager surfaces.
 */

type EventRow = { type: string; repo: string; title: string; url: string; occurredAt: string }

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  commit: { label: 'commit', cls: 'bg-[var(--m-good-soft)] text-[var(--m-good)]' },
  pr_opened: { label: 'PR', cls: 'bg-[var(--m-clay-soft)] text-[var(--m-clay-deep)]' },
  pr_reviewed: { label: 'review', cls: 'bg-[var(--m-accent-soft)] text-[var(--m-accent-2)]' },
  issue_closed: { label: 'issue', cls: 'bg-[var(--m-bg-soft)] text-[var(--m-ink-3)]' },
}

function greetingFor(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// Generic personal-email domains — never treated as a "company".
const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com',
  'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'aol.com', 'fastmail.com',
])

export async function SoloDashboard({
  userId,
  login,
  name,
  email,
  events,
  githubLinked,
  hasEvents,
  signOutAction,
}: {
  userId: number
  login: string
  name: string
  email: string | null
  events: EventRow[]
  githubLinked: boolean
  hasEvents: boolean
  signOutAction: () => Promise<void> | void
}) {
  const domain = email?.split('@')[1]?.toLowerCase().trim() ?? ''
  const isCompanyDomain = !!domain && !PERSONAL_DOMAINS.has(domain)
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000)

  const ninetyDaysAgo = new Date(startOfToday.getTime() - 90 * 24 * 60 * 60 * 1000)
  const [todaysMeetings, todaysDeliverables, recentMeetings, pendingBookings] = await Promise.all([
    db
      .select({ title: schema.meetings.title, startAt: schema.meetings.startAt, endAt: schema.meetings.endAt, conferenceUrl: schema.meetings.conferenceUrl })
      .from(schema.meetings)
      .where(and(eq(schema.meetings.userId, userId), gte(schema.meetings.startAt, startOfToday), lt(schema.meetings.startAt, startOfTomorrow)))
      .orderBy(schema.meetings.startAt),
    db
      .select({ title: schema.deliverables.title })
      .from(schema.deliverables)
      .where(and(eq(schema.deliverables.userId, userId), gte(schema.deliverables.completedAt, startOfToday)))
      .orderBy(desc(schema.deliverables.completedAt)),
    db
      .select({ attendees: schema.meetings.attendees })
      .from(schema.meetings)
      .where(and(eq(schema.meetings.userId, userId), gte(schema.meetings.startAt, ninetyDaysAgo))),
    db
      .select({ id: schema.bookingRequests.id, requesterName: schema.bookingRequests.requesterName, requesterEmail: schema.bookingRequests.requesterEmail, proposedAt: schema.bookingRequests.proposedAt, note: schema.bookingRequests.note })
      .from(schema.bookingRequests)
      .where(and(eq(schema.bookingRequests.hostUserId, userId), eq(schema.bookingRequests.status, 'pending')))
      .orderBy(schema.bookingRequests.proposedAt)
      .limit(10),
  ])
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://marina.team'
  const bookingUrl = `${appUrl}/book/${login}`

  // Web punch state (no agent needed).
  const activeShiftRows = await db
    .select({ punchedInAt: schema.shifts.punchedInAt })
    .from(schema.shifts)
    .where(and(eq(schema.shifts.userId, userId), isNull(schema.shifts.punchedOutAt)))
    .orderBy(desc(schema.shifts.punchedInAt))
    .limit(1)
  const activeSince = activeShiftRows[0]?.punchedInAt.toISOString() ?? null

  // Company colleagues — if they signed up with a work email, surface same-domain
  // teammates as ready-made contacts.
  const colleagues = isCompanyDomain
    ? await db
        .select({ name: schema.users.name, login: schema.users.login, cemail: schema.users.email })
        .from(schema.users)
        .where(and(like(schema.users.email, `%@${domain}`), ne(schema.users.id, userId)))
        .limit(8)
    : []

  // Contacts — accumulate the people you meet with (from attendee emails). A
  // compounding asset: the more you use Marina, the richer your network record.
  const contactCount = new Map<string, number>()
  for (const m of recentMeetings) {
    for (const a of m.attendees ?? []) {
      const email = String(a).toLowerCase().trim()
      if (email) contactCount.set(email, (contactCount.get(email) ?? 0) + 1)
    }
  }
  const contacts = [...contactCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([email, count]) => ({ email, count, name: email.split('@')[0].replace(/[._-]+/g, ' ') }))

  const contactItems: Contact[] = [
    ...contacts.map((c) => ({ name: c.name, email: c.email, count: c.count })),
    ...colleagues.map((c) => ({ name: c.name ?? c.login, email: c.cemail ?? '', secondary: true })),
  ].filter((c) => !!c.email)

  const commits = events.filter((e) => e.type === 'commit').length
  const prs = events.filter((e) => e.type === 'pr_opened').length
  const reviews = events.filter((e) => e.type === 'pr_reviewed').length
  const todaysActivity = events.filter((e) => new Date(e.occurredAt) >= startOfToday).slice(0, 8)
  const calendarConnected = todaysMeetings.length > 0 // best-effort signal for the nudge

  return (
    <main className="min-h-screen bg-[var(--m-bg)]">
      <PunchGate active={!!activeSince} name={name} />

      {/* ── Employee navbar — clean, personal, no org chrome ── */}
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-[var(--m-border)]">
        <div className="w-full px-5 sm:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" width={26} height={26} alt="" aria-hidden className="block object-contain" />
            <span className="font-display text-[18px] tracking-tight text-[var(--m-ink)]">MARINA</span>
            <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full bg-[var(--m-accent-soft)] text-[var(--m-accent-2)] font-medium hidden sm:inline">for you</span>
          </div>
          <nav className="flex items-center gap-1 sm:gap-2 text-[13px]">
            <PunchControl activeSince={activeSince} />
            <span className="w-px h-5 bg-[var(--m-border)] mx-1 hidden sm:inline-block" />
            <Link href="/me/data" className="px-2.5 py-1.5 rounded-md text-[var(--m-ink-2)] hover:text-[var(--m-ink)] hover:bg-[var(--m-bg-soft)] transition-colors hidden sm:inline">My data</Link>
            <Link href="/help" className="px-2.5 py-1.5 rounded-md text-[var(--m-ink-2)] hover:text-[var(--m-ink)] hover:bg-[var(--m-bg-soft)] transition-colors hidden sm:inline">Help</Link>
            <Link href="/settings" className="px-2.5 py-1.5 rounded-md text-[var(--m-ink-2)] hover:text-[var(--m-ink)] hover:bg-[var(--m-bg-soft)] transition-colors">Settings</Link>
            <form action={signOutAction}>
              <button type="submit" className="px-2.5 py-1.5 rounded-md text-[var(--m-ink-3)] hover:text-[var(--m-bad)] hover:bg-[var(--m-bad-soft)]/50 transition-colors">Sign out</button>
            </form>
          </nav>
        </div>
      </header>

      <div className="w-full px-5 sm:px-8 py-6">
        <PinTabHint />

        {/* ── Greeting + quick stats ── */}
        <div className="flex items-start justify-between flex-wrap gap-x-8 gap-y-4 mb-6">
          <div className="min-w-0">
            <p className="app-eyebrow">Your workday, captured</p>
            <h1 className="font-display text-[26px] sm:text-[30px] tracking-tight text-[var(--m-ink)] mt-0.5">
              {greetingFor()}, {name.split(' ')[0]}
            </h1>
            <p className="text-[13.5px] text-[var(--m-ink-3)] leading-relaxed max-w-2xl mt-1.5">
              Everything you do is recorded automatically — so whenever someone asks what you&rsquo;ve been up to, your
              report&rsquo;s already written.
            </p>
          </div>
          <div className="flex items-center gap-6 sm:gap-8 shrink-0">
            <Stat value={String(todaysMeetings.length)} label="meetings today" />
            <Stat value={String(commits)} label="commits / wk" />
            <Stat value={String(prs)} label="PRs / wk" />
            <Stat value={String(reviews)} label="reviews / wk" />
          </div>
        </div>

        {/* ── Setup nudges (no desktop-agent step — solo employees do everything
            from the web) ── */}
        {(!githubLinked || !hasEvents || !calendarConnected) && (
          <div className="grid gap-4 md:grid-cols-2 mb-5">
            {(!githubLinked || !hasEvents) && <ConnectWork linked={githubLinked} hasEvents={hasEvents} />}
            {!calendarConnected && <ConnectNudge title="Connect your calendar" body="Sync Google Calendar so your meetings land in your day record and reports automatically." href="/settings" cta="Connect calendar" />}
          </div>
        )}

        {/* ── Main grid — report (hero) + today + log ── */}
        <div className="grid gap-5 lg:grid-cols-12 items-start">
          <div className="lg:col-span-7 grid gap-5">
            <DayReport />
            <BookingLink
              url={bookingUrl}
              pending={pendingBookings.map((p) => ({
                id: p.id,
                requesterName: p.requesterName,
                requesterEmail: p.requesterEmail,
                proposedAt: p.proposedAt.toISOString(),
                note: p.note,
              }))}
            />
            <TrackedRepos />
          </div>

          <div className="lg:col-span-5 grid gap-5">
            {/* Ask Marina — the personal AI, grounded in the user's own work */}
            <MyChat />

            {/* Today's meetings */}
            <section className="app-card app-card-lg">
              <p className="app-eyebrow">Today</p>
              <h2 className="app-h2 mt-0.5 mb-3">Your meetings</h2>
              {todaysMeetings.length === 0 ? (
                <p className="text-[13px] text-[var(--m-ink-3)]">No meetings synced for today.</p>
              ) : (
                <ul className="space-y-2">
                  {todaysMeetings.map((m, i) => {
                    const mins = Math.max(0, Math.round((m.endAt.getTime() - m.startAt.getTime()) / 60000))
                    return (
                      <li key={i} className="flex items-center gap-3 text-[13px]">
                        <span className="shrink-0 text-[12px] tabular-nums text-[var(--m-ink-3)] w-16">
                          {m.startAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                        </span>
                        {m.conferenceUrl ? (
                          <a href={m.conferenceUrl} target="_blank" rel="noreferrer" className="text-[var(--m-ink)] flex-1 truncate hover:text-[var(--m-accent)] transition-colors">{m.title}</a>
                        ) : (
                          <span className="text-[var(--m-ink)] flex-1 truncate">{m.title}</span>
                        )}
                        <span className="text-[11px] text-[var(--m-ink-4)] shrink-0">{mins}m</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {/* End-of-day log */}
            <LogDeliverable initial={todaysDeliverables.map((d) => ({ title: d.title }))} />

            {/* Today's activity */}
            <section className="app-card app-card-lg">
              <p className="app-eyebrow">Today</p>
              <h2 className="app-h2 mt-0.5 mb-3">What you shipped</h2>
              {todaysActivity.length === 0 ? (
                <p className="text-[13px] text-[var(--m-ink-3)]">No GitHub activity recorded today yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {todaysActivity.map((e, i) => {
                    const b = TYPE_BADGE[e.type] ?? TYPE_BADGE.commit
                    return (
                      <li key={i} className="flex items-center gap-2 text-[13px]">
                        <span className={`shrink-0 text-[9.5px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full ${b.cls}`}>{b.label}</span>
                        <a href={e.url} target="_blank" rel="noreferrer" className="text-[var(--m-ink)] flex-1 truncate hover:text-[var(--m-accent)] transition-colors">{e.title}</a>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {/* Contacts — bookable in two clicks (meeting attendees + same-domain colleagues) */}
            {contactItems.length > 0 && <Contacts items={contactItems} domain={domain} />}
          </div>
        </div>
      </div>
    </main>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-right sm:text-left">
      <p className="font-display text-[26px] sm:text-[30px] leading-none text-[var(--m-ink)] tabular-nums">{value}</p>
      <p className="text-[11px] text-[var(--m-ink-3)] mt-1 whitespace-nowrap">{label}</p>
    </div>
  )
}

function ConnectNudge({ title, body, href, cta }: { title: string; body: string; href: string; cta: string }) {
  return (
    <section className="app-card app-card-lg">
      <h2 className="app-h2">{title}</h2>
      <p className="app-sub mt-1">{body}</p>
      <Link href={href} className="btn-sage text-[13px] mt-3 inline-flex">{cta}</Link>
    </section>
  )
}
