import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import PersonalPageHeader from '@/components/personal-page-header'
import {
  HttpError,
  listMembershipsForCurrentUser,
  requireSession,
} from '@/lib/auth/guards'
import { computeSignalsForUser } from '@/lib/people/risk'

export const dynamic = 'force-dynamic'

/**
 * Employee-facing transparency page. For a workplace-monitoring product, the
 * single most trust-building thing we can do is tell each person, in plain
 * English, exactly what we collect, show them their own wellbeing read, and
 * give them a one-click export. Everything here is self-facing and read-only.
 */
export default async function MyDataPage() {
  // Mirror the /me + /settings auth pattern: resolve the session, and bounce to
  // the marketing root on a 401 rather than rendering a half-empty page.
  let session
  try {
    session = await requireSession()
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) redirect('/')
    throw err
  }
  const userId = session.appUserId

  // Detect what's actually connected so Section A can be honest about which
  // sources are live for *this* person rather than describing the product in
  // the abstract.
  const [devices, githubAccount, googleAccount, settings, shotConsent] =
    await Promise.all([
      db
        .select({ id: schema.agentTokens.id, revokedAt: schema.agentTokens.revokedAt })
        .from(schema.agentTokens)
        .where(eq(schema.agentTokens.userId, userId))
        .orderBy(desc(schema.agentTokens.pairedAt)),
      db.query.accounts.findFirst({
        where: and(eq(schema.accounts.userId, userId), eq(schema.accounts.provider, 'github')),
      }),
      db.query.accounts.findFirst({
        where: and(eq(schema.accounts.userId, userId), eq(schema.accounts.provider, 'google')),
      }),
      db.query.userSettings.findFirst({ where: eq(schema.userSettings.userId, userId) }),
      db.query.shotConsents.findFirst({
        where: eq(schema.shotConsents.userId, userId),
        orderBy: desc(schema.shotConsents.consentedAt),
      }),
    ])

  const agentPaired = devices.some((d) => !d.revokedAt)
  // A GitHub login is how everyone signs in, but treat a linked OAuth account as
  // the signal that activity sync is wired up. Fall back to the user's githubId.
  const githubConnected = !!githubAccount
  const calendarConnected = !!googleAccount
  const screenshotsActive = agentPaired && !!shotConsent
  const trackingPaused = !!settings?.trackingPausedAt

  // Resolve a primary org so we can compute wellbeing signals. If the person
  // isn't a member of any org yet, we skip Section B gracefully.
  const memberships = await listMembershipsForCurrentUser()
  const primaryOrgId = memberships[0]?.orgId ?? null

  const signals =
    primaryOrgId != null ? await computeSignalsForUser(primaryOrgId, userId) : null

  // ── Section A copy ────────────────────────────────────────────────────────
  type Track = {
    title: string
    why: string
    status: 'always' | 'on' | 'off'
    statusLabel: string
  }
  const tracked: Track[] = [
    {
      title: 'Punch in / out times & hours',
      why: 'So your hours are counted automatically — no timesheets to fill in by hand.',
      status: 'always',
      statusLabel: 'Always on',
    },
    {
      title: 'Breaks you log',
      why: 'So a long day shows the breaks you actually took, and nobody assumes you never stepped away.',
      status: 'always',
      statusLabel: 'When you log them',
    },
    {
      title: 'Leave requests',
      why: 'So time off is approved and recorded in one place, and your balance stays accurate.',
      status: 'always',
      statusLabel: 'When you request',
    },
    {
      title: 'Deliverables you log',
      why: 'So your manager sees your shipped work without having to ping you for updates.',
      status: 'always',
      statusLabel: 'When you log them',
    },
    {
      title: 'GitHub activity',
      why: 'So commits and PRs roll up into your progress automatically — only public metadata, never your code.',
      status: githubConnected ? 'on' : 'off',
      statusLabel: githubConnected ? 'Connected' : 'Not connected',
    },
    {
      title: 'Calendar meetings',
      why: 'So time spent in meetings is reflected in your day instead of looking like idle time.',
      status: calendarConnected ? 'on' : 'off',
      statusLabel: calendarConnected ? 'Connected' : 'Not connected',
    },
    {
      title: 'Desktop-agent activity — active app & idle time',
      why: 'So focused work and away-from-keyboard time are estimated without you reporting them. The agent samples which app is in front, not what you type.',
      status: trackingPaused ? 'off' : agentPaired ? 'on' : 'off',
      statusLabel: trackingPaused
        ? 'Paused by you'
        : agentPaired
          ? 'Active'
          : 'No device paired',
    },
    {
      title: 'Screenshots',
      why: 'Captured only when a desktop agent is paired and you have given explicit consent. Your manager sees derived labels, never the raw image — and pixels auto-purge after 48 hours.',
      status: screenshotsActive ? 'on' : 'off',
      statusLabel: screenshotsActive
        ? 'Paired & consented'
        : agentPaired
          ? 'Not consented'
          : 'Off — no consent',
    },
  ]

  const STATUS_PILL: Record<Track['status'], string> = {
    always: 'pill-info',
    on: 'pill-good',
    off: 'pill-slate',
  }

  // ── Section B copy (gentle, self-facing) ──────────────────────────────────
  const wellbeingNotes: string[] = []
  if (signals) {
    if (signals.weekHours >= 50) {
      wellbeingNotes.push(
        `You've logged ${signals.weekHours}h this week — consider wrapping up earlier where you can.`,
      )
    } else if (signals.weekHours >= 45) {
      wellbeingNotes.push(
        `${signals.weekHours}h logged this week is on the higher side — a lighter day soon might be worth it.`,
      )
    }
    if (signals.daysSinceLeave != null && signals.daysSinceLeave >= 90) {
      wellbeingNotes.push(
        `It's been ${signals.daysSinceLeave} days since your last leave — you've more than earned a break.`,
      )
    } else if (signals.daysSinceLeave == null) {
      wellbeingNotes.push("You don't have any leave on record yet — rest counts too.")
    }
    if (signals.weekHours >= 45 && signals.breakDays <= 1) {
      wellbeingNotes.push('You worked long hours with very few breaks — small pauses add up.')
    }
    if (signals.blockedNowMin >= 120) {
      wellbeingNotes.push(
        `You've been blocked for ${Math.floor(signals.blockedNowMin / 60)}h+ — it's okay to ask for a hand.`,
      )
    }
  }

  return (
    <main className="min-h-screen bg-[var(--m-bg)]">
      <PersonalPageHeader
        eyebrow="Your data & transparency"
        title="Exactly what MARINA knows about you"
        current="data"
      />

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        <div className="app-card app-card-lg">
          <p className="text-[13px] text-slate-700 leading-relaxed">
            MARINA is here to surface your work fairly, not to watch over your shoulder. This page
            lists every kind of data we collect about you, why it exists, and what's switched on for
            your account right now. No surprises — and you can export or delete it any time.
          </p>
        </div>

        {/* ── Section A ── */}
        <section>
          <h2 className="app-h3">What MARINA tracks about you</h2>
          <ul className="mt-4 app-card divide-y divide-slate-100">
            {tracked.map((t) => (
              <li
                key={t.title}
                className="px-5 py-4 flex items-start justify-between gap-4 flex-wrap"
              >
                <div className="min-w-0 flex-1 max-w-[480px]">
                  <p className="text-[14px] font-medium text-slate-900">{t.title}</p>
                  <p className="mt-1 text-[12.5px] text-slate-500 leading-relaxed">{t.why}</p>
                </div>
                <span className={`pill ${STATUS_PILL[t.status]} shrink-0`}>{t.statusLabel}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-slate-500 leading-relaxed">
            We never read your keystrokes, message contents, or private files. Activity is sampled as
            high-level signals — which app is in front, whether you're idle — not a recording of your
            screen.
          </p>
        </section>

        {/* ── Section B ── */}
        {signals ? (
          <section>
            <h2 className="app-h3">Your wellbeing this week</h2>
            <p className="mt-1 text-[12.5px] text-slate-500">
              A read on your last seven days, just for you. This is a nudge, never a judgement.
            </p>
            <div className="mt-4 grid sm:grid-cols-3 gap-3">
              <StatCard
                label="Hours this week"
                value={`${signals.weekHours}h`}
                hint={signals.weekHours >= 45 ? 'On the higher side' : 'Looking balanced'}
              />
              <StatCard
                label="Since last leave"
                value={signals.daysSinceLeave == null ? '—' : `${signals.daysSinceLeave}d`}
                hint={
                  signals.daysSinceLeave == null
                    ? 'No leave on record'
                    : signals.daysSinceLeave >= 90
                      ? 'A break is overdue'
                      : 'Recently rested'
                }
              />
              <StatCard
                label="Output logged"
                value={`${signals.outputCount}`}
                hint="Deliverables + GitHub, 7 days"
              />
            </div>

            {wellbeingNotes.length > 0 ? (
              <div className="mt-4 rounded-xl border border-[var(--m-accent)]/20 bg-[var(--m-accent-soft)]/60 p-4">
                <p className="text-[12.5px] font-semibold text-[var(--m-accent-2)]">A gentle note</p>
                <ul className="mt-2 space-y-1.5">
                  {wellbeingNotes.map((note, i) => (
                    <li key={i} className="text-[13px] text-slate-700 leading-relaxed">
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-4 text-[13px] text-emerald-700">
                Nothing's flagged this week — your hours, breaks, and output look healthy. Keep it up.
              </p>
            )}
          </section>
        ) : (
          <section>
            <h2 className="app-h3">Your wellbeing this week</h2>
            <p className="mt-2 text-[13px] text-slate-500 leading-relaxed">
              You're not part of a workspace yet, so there's nothing to summarise here. Once you join
              an org, you'll see a private read on your hours, breaks, and output.
            </p>
          </section>
        )}

        {/* ── Section C ── */}
        <section>
          <h2 className="app-h3">Your rights</h2>
          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            <div className="app-card app-card-lg">
              <h3 className="text-[13.5px] font-semibold text-slate-900">Export everything</h3>
              <p className="mt-1 text-[12.5px] text-slate-500 leading-relaxed">
                Download a complete JSON copy of every row tied to your account — profile, shifts,
                breaks, leaves, deliverables, GitHub activity, and agent samples.
              </p>
              <a
                href="/api/me/export"
                download
                className="mt-3 inline-flex px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-700 text-white text-[12.5px] font-medium transition"
              >
                Download my data (JSON)
              </a>
            </div>
            <div className="app-card app-card-lg">
              <h3 className="text-[13.5px] font-semibold text-slate-900">Request deletion</h3>
              <p className="mt-1 text-[12.5px] text-slate-500 leading-relaxed">
                You can permanently erase your account and all associated data from the danger zone in
                Settings. This can't be undone.
              </p>
              <Link
                href="/settings"
                className="mt-3 inline-flex px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[12.5px] font-medium transition"
              >
                Go to Settings →
              </Link>
            </div>
          </div>
          <p className="mt-4 text-[12px] text-slate-500">
            Read the full{' '}
            <Link href="/privacy" className="underline hover:text-[var(--m-accent)]">
              privacy policy
            </Link>{' '}
            for how long we keep each kind of data and who can see it.
          </p>
        </section>
      </div>
    </main>
  )
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="app-card app-card-lg">
      <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-[24px] font-semibold text-[var(--m-ink)] tabular-nums leading-none">
        {value}
      </p>
      <p className="mt-2 text-[11.5px] text-slate-500">{hint}</p>
    </div>
  )
}
