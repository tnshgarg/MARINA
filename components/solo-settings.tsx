import { TrackedRepos } from './tracked-repos'
import { AvailabilityEditor } from './availability-editor'
import { CalendarConnect } from './calendar-connect'
import { describeAvailability, type AvailabilityConfig } from '@/lib/booking/availability'

/**
 * Settings, built for the solo (no-org) employee. Unlike the org settings —
 * which is about agent devices, window-title tracking and workspace config —
 * this is the personal control panel: who you are, your connected sources
 * (GitHub + Calendar), your booking availability, and which repos count.
 *
 * Notably: there's NO manual "GitHub username" field. A solo employee connects
 * their own GitHub via OAuth, so we show the live connection status instead of
 * asking them to type a username.
 */
export function SoloSettings({
  name,
  login,
  email,
  githubConnected,
  googleConnected,
  bookingUrl,
  availability,
}: {
  name: string | null
  login: string
  email: string | null
  githubConnected: boolean
  googleConnected: boolean
  bookingUrl: string
  availability: AvailabilityConfig
}) {
  const bookingDisplay = bookingUrl.replace(/^https?:\/\//, '')
  return (
    <div className="max-w-3xl">
      <div className="mb-5">
        <p className="app-eyebrow">Settings</p>
        <h1 className="font-display text-[28px] tracking-tight text-[var(--m-ink)] mt-0.5">Your settings</h1>
        <p className="text-[13px] text-[var(--m-ink-3)] mt-1">Your account, connected sources, and how people book time with you.</p>
      </div>

      {/* Identity */}
      <SettingCard eyebrow="You" title="Identity">
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Name" value={name ?? '—'} />
          <Field label="Username" value={`@${login}`} mono />
          <Field label="Email" value={email ?? '—'} />
        </div>
      </SettingCard>

      {/* GitHub */}
      <SettingCard eyebrow="Source" title="GitHub">
        {githubConnected ? (
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="pill pill-good">Connected</span>
            <span className="text-[13px] text-[var(--m-ink-2)]">
              as <span className="font-mono text-[var(--m-ink)]">@{login}</span> — your commits, PRs and reviews flow into your journal &amp; reports.
            </span>
          </div>
        ) : (
          <div className="flex items-start gap-3 flex-wrap">
            <p className="text-[13px] text-[var(--m-ink-2)] flex-1 min-w-[220px]">
              Connect GitHub so Marina can build your work journal and review packet from your real activity. Identity only — we never ask for repo write access.
            </p>
            <a href="/api/auth/signin/github?callbackUrl=/settings" className="btn-sage text-[13px] inline-flex shrink-0">
              Connect GitHub
            </a>
          </div>
        )}
      </SettingCard>

      {/* Calendar */}
      <SettingCard eyebrow="Source" title="Google Calendar">
        <p className="text-[13px] text-[var(--m-ink-2)] mb-3">
          Sync your meetings into your day record and reports — and let Marina create Meet invites when you accept a booking.
        </p>
        <CalendarConnect connected={googleConnected} />
      </SettingCard>

      {/* Booking availability */}
      <SettingCard eyebrow="Booking" title="When can people meet you?">
        <p className="text-[13px] text-[var(--m-ink-2)] mb-2">
          Set the days and hours you take meetings. Your public link offers real open slots from this — Calendly-style.
        </p>
        <div className="mb-4 rounded-lg bg-[var(--m-bg-soft)] border border-[var(--m-border)] px-3 py-2 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-wide text-[var(--m-ink-4)] font-medium">Your link</span>
          <code className="text-[12.5px] text-[var(--m-ink-2)] truncate flex-1 min-w-0">{bookingDisplay}</code>
          <a href={bookingUrl} target="_blank" rel="noreferrer" className="text-[12px] text-[var(--m-accent)] hover:underline shrink-0">
            Open ↗
          </a>
        </div>
        <p className="text-[12px] text-[var(--m-ink-3)] mb-3">
          Currently: <span className="text-[var(--m-ink-2)] font-medium">{describeAvailability(availability)}</span>
        </p>
        <AvailabilityEditor
          initial={{
            workDays: availability.workDays,
            startMin: availability.startMin,
            endMin: availability.endMin,
            slotMin: availability.slotMin,
            timezone: availability.timezone,
          }}
        />
        <p className="text-[11.5px] text-[var(--m-ink-4)] mt-3">Incoming requests land on your dashboard to accept or decline.</p>
      </SettingCard>

      {/* Tracked repos */}
      <div className="mb-5">
        <TrackedRepos />
      </div>
    </div>
  )
}

function SettingCard({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 rounded-2xl border border-[var(--m-border)] bg-white p-5 shadow-[var(--m-shadow-sm)]">
      <p className="app-eyebrow">{eyebrow}</p>
      <h2 className="app-h2 mt-0.5 mb-3">{title}</h2>
      {children}
    </section>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-[var(--m-ink-4)] font-medium">{label}</p>
      <p className={`text-[13px] text-[var(--m-ink)] mt-0.5 truncate ${mono ? 'font-mono' : ''}`} title={value}>
        {value}
      </p>
    </div>
  )
}
