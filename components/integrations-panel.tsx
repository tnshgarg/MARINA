'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'
import { CalendarConnect } from '@/components/calendar-connect'

// Per-variant dismissal, persisted so the card stays gone once closed. After
// dismissing, the same connections live on the Settings page.
const dismissListeners = new Set<() => void>()
const dismissKey = (variant: string) => `marina:connections-dismissed:${variant}`
function readDismissed(variant: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(dismissKey(variant)) === '1'
  } catch {
    return false
  }
}
function subscribeDismissed(cb: () => void): () => void {
  dismissListeners.add(cb)
  return () => dismissListeners.delete(cb)
}
function setDismissed(variant: string): void {
  try {
    window.localStorage.setItem(dismissKey(variant), '1')
  } catch {
    /* ignore */
  }
  for (const cb of dismissListeners) cb()
}

/**
 * Inline "Connections" card — shown right on the employee + manager dashboards
 * so integrations are enabled where you work, not on a buried settings page.
 *
 *  - Employee: GitHub (their OAuth) + Google Calendar (their account). Slack is
 *    org-level, so it shows as read-only status.
 *  - Manager: GitHub App (org install) + Google Calendar (their account) +
 *    Slack (org install / disconnect).
 */

type State = { connected: boolean; detail?: string }

export function IntegrationsPanel({
  variant,
  orgId,
  github,
  calendar,
  slack,
  githubConnectAction,
  githubAppInstallUrl,
  calendarReturnTo = '/dashboard',
  dismissible = false,
  settingsHref,
}: {
  variant: 'employee' | 'manager'
  orgId?: number | null
  github: State
  calendar: State
  slack: State
  githubConnectAction?: () => Promise<void>
  githubAppInstallUrl?: string
  calendarReturnTo?: string
  /** When true, show an X to hide the card (persisted). Use on dashboards. */
  dismissible?: boolean
  /** Where "connect later" lives once dismissed — shown as a hint. */
  settingsHref?: string
}) {
  const dismissed = useSyncExternalStore(
    subscribeDismissed,
    () => readDismissed(variant),
    () => false,
  )
  const dismiss = useCallback(() => setDismissed(variant), [variant])
  if (dismissible && dismissed) return null

  return (
    <section className="app-card app-card-lg relative">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="app-h2">Connections</h2>
          <p className="app-sub mt-0.5">Plug Marina into the tools you already use.</p>
        </div>
        {dismissible && (
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            title={settingsHref ? 'Hide — connect anytime from Settings' : 'Hide'}
            className="shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-md text-[var(--m-ink-4)] hover:text-[var(--m-ink-2)] hover:bg-[var(--m-bg-soft)] transition"
          >
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      <div className="divide-y divide-[var(--m-border-soft)]">
        {/* GitHub */}
        <Row
          glyph={<GithubGlyph />}
          tint="#1a1f2e"
          name="GitHub"
          desc={
            github.connected
              ? github.detail ?? (variant === 'manager' ? 'App installed — syncing your repos.' : 'Your commits, PRs and reviews flow into Marina.')
              : variant === 'manager'
                ? 'Install the GitHub App to track your team’s work.'
                : 'Link GitHub so your work shows up automatically.'
          }
          connected={github.connected}
          action={<GithubAction variant={variant} connected={github.connected} connectAction={githubConnectAction} appInstallUrl={githubAppInstallUrl} />}
        />

        {/* Google Calendar */}
        <Row
          glyph={<CalendarGlyph />}
          tint="#3f6b54"
          name="Google Calendar"
          desc={
            calendar.connected
              ? 'Meetings sync in; Marina can create events with Meet links.'
              : 'Connect to see your meetings and book with one click.'
          }
          connected={calendar.connected}
          action={<CalendarConnect connected={calendar.connected} returnTo={calendarReturnTo} />}
        />

        {/* Slack */}
        <Row
          glyph={<SlackGlyph />}
          tint="#a35e3d"
          name="Slack"
          desc={
            slack.connected
              ? slack.detail ?? 'Punch in, log work and post standups from Slack.'
              : variant === 'manager'
                ? 'Connect Slack for DM alerts, standups and slash commands.'
                : 'Your admin hasn’t connected Slack yet.'
          }
          connected={slack.connected}
          action={<SlackAction variant={variant} connected={slack.connected} orgId={orgId} />}
        />
      </div>

      {dismissible && settingsHref && (
        <p className="mt-3 text-[11.5px] text-[var(--m-ink-4)]">
          You can connect these anytime from{' '}
          <a href={settingsHref} className="underline hover:text-[var(--m-ink-2)]">Settings</a>.
        </p>
      )}
    </section>
  )
}

function Row({
  glyph,
  tint,
  name,
  desc,
  connected,
  action,
}: {
  glyph: React.ReactNode
  tint: string
  name: string
  desc: string
  connected: boolean
  action: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span
        className="shrink-0 w-9 h-9 rounded-lg inline-flex items-center justify-center border border-[var(--m-border)]"
        style={{ color: tint, background: '#fff' }}
      >
        {glyph}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[13.5px] font-semibold text-[var(--m-ink)]">{name}</p>
          {connected && (
            <span className="text-[10.5px] font-medium px-1.5 py-0.5 rounded bg-[var(--m-good)]/12 text-[var(--m-good)]">
              Connected
            </span>
          )}
        </div>
        <p className="text-[12px] text-[var(--m-ink-3)] mt-0.5 truncate">{desc}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  )
}

function GithubAction({
  variant,
  connected,
  connectAction,
  appInstallUrl,
}: {
  variant: 'employee' | 'manager'
  connected: boolean
  connectAction?: () => Promise<void>
  appInstallUrl?: string
}) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Manager → GitHub App (org-level, external install page).
  if (variant === 'manager') {
    return (
      <a href={appInstallUrl ?? '#'} target="_blank" rel="noopener noreferrer" className={connected ? 'btn-secondary text-[12.5px]' : 'btn-sage text-[13px]'}>
        {connected ? 'Manage' : 'Install'}
      </a>
    )
  }

  // Employee → personal OAuth + sync. The OAuth start is a server action (the
  // raw GET signin link 302s to ?error=Configuration), passed in by the page.
  if (!connected) {
    if (!connectAction) return null
    return (
      <form action={connectAction}>
        <button type="submit" className="btn-sage text-[13px]">Connect</button>
      </form>
    )
  }
  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-[11.5px] text-[var(--m-good)]">{msg}</span>}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setMsg(null)
          try {
            const res = await fetch('/api/sync/github', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days: 90 }) })
            const data = await res.json()
            if (!res.ok) throw new Error(data?.error ?? 'failed')
            setMsg('Synced — refreshing…')
            setTimeout(() => window.location.reload(), 800)
          } catch {
            setMsg(null)
            setBusy(false)
          }
        }}
        className="btn-secondary text-[12.5px] disabled:opacity-50"
      >
        {busy ? 'Syncing…' : 'Sync'}
      </button>
    </div>
  )
}

function SlackAction({ variant, connected, orgId }: { variant: 'employee' | 'manager'; connected: boolean; orgId?: number | null }) {
  // Employee can't install Slack (org-level). Show nothing actionable.
  if (variant === 'employee') {
    return connected ? <span className="pill pill-good text-[11.5px]">Active</span> : null
  }
  if (!orgId) return null
  if (!connected) {
    return (
      <a href={`/api/connect/slack/install?orgId=${orgId}`} className="btn-sage text-[13px]">Connect</a>
    )
  }
  return <SlackDisconnect orgId={orgId} />
}

function SlackDisconnect({ orgId }: { orgId: number }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (!confirm('Disconnect Slack from this workspace?')) return
        setBusy(true)
        try {
          const res = await fetch(`/api/connect/slack/disconnect?orgId=${orgId}`, { method: 'POST' })
          if (res.ok) window.location.reload()
          else setBusy(false)
        } catch {
          setBusy(false)
        }
      }}
      className="btn-ghost text-[12.5px] !text-[var(--m-bad)] disabled:opacity-50"
    >
      {busy ? '…' : 'Disconnect'}
    </button>
  )
}

function GithubGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.1c-3.2.7-3.88-1.36-3.88-1.36-.52-1.31-1.28-1.66-1.28-1.66-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.58.23 2.75.11 3.04.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.07.78 2.15v3.19c0 .31.21.67.8.56C20.71 21.39 24 17.08 24 12 24 5.65 18.35.5 12 .5Z" />
    </svg>
  )
}
function CalendarGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v3M16 3v3" />
    </svg>
  )
}
function SlackGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 15a2 2 0 1 1-2-2h2v2Zm1 0a2 2 0 1 1 4 0v5a2 2 0 1 1-4 0v-5Zm2-9a2 2 0 1 1 2-2h-2V6Zm0 1a2 2 0 0 1 0 4H4a2 2 0 1 1 0-4h5Zm9 2a2 2 0 1 1 2 2h-2V9Zm-1 0a2 2 0 0 1-4 0V4a2 2 0 1 1 4 0v5Zm-2 9a2 2 0 1 1-2 2v-2h2Zm0-1a2 2 0 0 1 0-4h5a2 2 0 1 1 0 4h-5Z" />
    </svg>
  )
}
