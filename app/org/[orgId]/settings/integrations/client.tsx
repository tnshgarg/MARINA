'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * The Integrations page only shows things the owner can actually act on.
 * No "coming soon" placeholders without interaction — those just frustrate
 * users. A single "Request an integration" CTA at the bottom captures
 * demand for everything else.
 */
type Initial = {
  trackedGithubOrgs: string[]
  hasSlack: boolean
  slackInstall: {
    teamName: string
    installedAt: string | null
    defaultChannelId: string | null
  } | null
  githubLinked: number
  calendarLinked: number
  teamSize: number
  githubApp: {
    configured: boolean
    installationId: number | null
    installUrl: string
  }
}

export default function IntegrationsClient({
  orgId,
  initial,
}: {
  orgId: number
  initial: Initial
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [appSyncMsg, setAppSyncMsg] = useState<string | null>(null)

  async function syncApp() {
    setBusy('app-sync')
    setAppSyncMsg(null)
    try {
      const res = await fetch(`/api/orgs/${orgId}/github-app/sync`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'failed')
      const unmatched = Array.isArray(data.unmatchedAuthors) ? data.unmatchedAuthors.length : 0
      setAppSyncMsg(
        `Pulled from ${data.repos} repo(s) · ${data.inserted} new event(s)` +
          (unmatched > 0 ? ` · ${unmatched} author(s) not yet linked to a teammate` : ''),
      )
      router.refresh()
    } catch (e) {
      setAppSyncMsg(String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {/* GitHub App — the reliable, org-level repo tracking path. */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="w-7 h-7 rounded-md bg-slate-900 text-white inline-flex items-center justify-center text-[13px] font-semibold">G</span>
          <h2 className="text-[14px] font-semibold text-slate-900">GitHub App — repo activity</h2>
          {initial.githubApp.installationId ? (
            <span className="pill pill-good text-[11px]">Installed</span>
          ) : (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">Not installed</span>
          )}
        </div>
        <p className="mt-2 text-[12.5px] text-slate-500 leading-snug max-w-2xl">
          Install the MARINA GitHub App on your org and choose which repos to share. MARINA then reads
          commits &amp; PRs from those repos directly — including <strong>private</strong> ones — and
          attributes each to the teammate who authored it. No per-person repo access needed.
        </p>
        {!initial.githubApp.configured ? (
          <p className="mt-4 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 max-w-2xl">
            The GitHub App isn&apos;t set up on this deployment yet — an admin needs to create the App on
            GitHub and set <code className="px-1 rounded bg-amber-100">GITHUB_APP_ID</code>,{' '}
            <code className="px-1 rounded bg-amber-100">GITHUB_APP_PRIVATE_KEY</code> and{' '}
            <code className="px-1 rounded bg-amber-100">GITHUB_APP_SLUG</code>.
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <a
              href={initial.githubApp.installUrl}
              className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-700 text-white text-[12.5px] font-medium transition"
            >
              {initial.githubApp.installationId ? 'Manage repos / reinstall' : 'Install GitHub App'}
            </a>
            {initial.githubApp.installationId && (
              <button
                type="button"
                onClick={syncApp}
                disabled={busy === 'app-sync'}
                className="px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[12.5px] font-medium disabled:opacity-50 transition"
              >
                {busy === 'app-sync' ? 'Syncing…' : 'Sync now'}
              </button>
            )}
            {appSyncMsg && <span className="text-[12px] text-slate-600">{appSyncMsg}</span>}
          </div>
        )}
        {/* Identity link — teammates connect their GitHub so commits/PRs map to
            them. This replaces the old per-teammate GitHub card. */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          <p className="text-[12px] text-slate-600">
            <strong>Teammates:</strong> link your GitHub account so we can attribute each commit/PR to you.
            {initial.teamSize > 0 && (
              <span className="text-slate-400">
                {' '}· {initial.githubLinked} of {initial.teamSize} linked
              </span>
            )}
          </p>
          <a
            href={`/api/auth/signin/github?callbackUrl=${encodeURIComponent(
              `/org/${orgId}/settings/integrations`,
            )}`}
            className="mt-2 inline-flex px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[12px] font-medium transition"
          >
            {initial.githubLinked > 0 ? 'Re-link my GitHub' : 'Link my GitHub'}
          </a>
        </div>
      </section>

      {/* Google Calendar */}
      <IntegrationCard
        glyphLetter="G"
        glyphBg="bg-blue-500"
        name="Google Calendar"
        category="Universal"
        status={initial.calendarLinked > 0 ? 'partial' : 'not_connected'}
        headline={
          initial.teamSize > 0
            ? `${initial.calendarLinked} of ${initial.teamSize} teammate${initial.teamSize === 1 ? '' : 's'} linked their calendar`
            : 'No teammates yet'
        }
        description={
          <p>
            Calendar is connected per teammate. Once linked, MARINA shows their meetings of the day,
            flags meeting overload, and uses busy time to derive focus blocks. Works for every role.
          </p>
        }
        actions={
          <a
            href={`/api/connect/google/start?return=/org/${orgId}/settings/integrations`}
            className="inline-block px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[12px] font-medium transition"
          >
            Connect my calendar
          </a>
        }
      />

      {/* Slack — full bot install for DMs + slash commands. The legacy
          webhook (`hasSlack` true / install null) keeps working but the
          UI nudges you toward the install. */}
      <SlackIntegrationCard
        orgId={orgId}
        install={initial.slackInstall}
        legacyWebhookConfigured={initial.hasSlack}
      />

      {/* Request integration CTA — replaces the row of ghost cards */}
      <section className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[13px] font-semibold text-slate-900">Need another integration?</p>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Figma · Linear · Jira · HubSpot · Salesforce · Zendesk · Notion · Asana · ClickUp —
            tell us which one you need next and we'll prioritise the shortlist.
          </p>
        </div>
        <a
          href="mailto:thetanishgarg@gmail.com?subject=Integration%20request"
          className="px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[12px] font-medium transition"
        >
          Request an integration
        </a>
      </section>
    </div>
  )
}

function IntegrationCard({
  glyphLetter,
  glyphBg,
  name,
  category,
  status,
  headline,
  description,
  actions,
  children,
}: {
  glyphLetter: string
  glyphBg: string
  name: string
  category: string
  status: 'configured' | 'partial' | 'not_connected'
  headline: string
  description: React.ReactNode
  actions: React.ReactNode
  children?: React.ReactNode
}) {
  const chip =
    status === 'configured'
      ? { bg: 'bg-emerald-50', fg: 'text-emerald-700', label: 'Connected' }
      : status === 'partial'
      ? { bg: 'bg-amber-50', fg: 'text-amber-700', label: 'Partial' }
      : { bg: 'bg-slate-100', fg: 'text-slate-600', label: 'Not connected' }
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <span
          className={`inline-flex w-10 h-10 rounded-lg ${glyphBg} text-white items-center justify-center text-[14px] font-semibold shrink-0`}
        >
          {glyphLetter}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[14px] font-semibold text-slate-900">{name}</h3>
            <span
              className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full ${chip.bg} ${chip.fg}`}
            >
              {chip.label}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-slate-500">{category}</span>
          </div>
          <p className="mt-0.5 text-[12px] text-slate-700 font-medium">{headline}</p>
          <div className="mt-2 text-[12.5px] text-slate-600 leading-snug space-y-1.5">{description}</div>
          <div className="mt-3">{actions}</div>
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
    </section>
  )
}

function SlackIntegrationCard({
  orgId,
  install,
  legacyWebhookConfigured,
}: {
  orgId: number
  install: { teamName: string; installedAt: string | null; defaultChannelId: string | null } | null
  legacyWebhookConfigured: boolean
}) {
  const router = useRouter()
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const justConnected = params?.get('slack') === 'connected'
  const errorParam = params?.get('slack_error') ?? null
  const [disconnecting, setDisconnecting] = useState(false)
  const status = install ? 'configured' : legacyWebhookConfigured ? 'configured' : 'not_connected'

  async function disconnect() {
    if (!confirm('Disconnect Slack from this workspace? Notifications via DM and slash commands will stop until you reconnect.')) return
    setDisconnecting(true)
    try {
      const res = await fetch('/api/connect/slack/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      })
      if (!res.ok) throw new Error(String(res.status))
      router.refresh()
    } catch (e) {
      alert('Failed to disconnect: ' + e)
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <IntegrationCard
      glyphLetter="S"
      glyphBg="bg-[var(--m-clay)]"
      name="Slack"
      category="Notifications + commands"
      status={status}
      headline={
        install
          ? `Connected to ${install.teamName}`
          : legacyWebhookConfigured
          ? 'Legacy webhook configured — upgrade to install for DMs'
          : 'Install the MARINA app on Slack'
      }
      description={
        <div className="space-y-2.5">
          <p>
            Install the MARINA Slack app to get manager DMs (leave requests, blockers),
            employee DMs (decision updates, nudges from teammates), and slash commands
            (<code className="font-mono text-[11px] px-1 rounded bg-slate-100">/marina pulse</code>,
            <code className="font-mono text-[11px] px-1 rounded bg-slate-100">/marina done</code>,
            <code className="font-mono text-[11px] px-1 rounded bg-slate-100">/marina blocker</code>).
          </p>
          {install && (
            <p className="text-emerald-700">
              ✓ Workspace: <span className="font-medium">{install.teamName}</span>
              {install.installedAt && (
                <span className="text-slate-500 ml-1.5">
                  · installed {new Date(install.installedAt).toLocaleDateString()}
                </span>
              )}
            </p>
          )}
          {justConnected && (
            <p className="text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2.5 py-1.5">
              ✓ Slack connected. Slash commands and DMs are live.
            </p>
          )}
          {errorParam && (
            <p className="text-rose-700 bg-rose-50 border border-rose-200 rounded px-2.5 py-1.5">
              Slack install failed: {errorParam}
            </p>
          )}
        </div>
      }
      actions={
        install ? (
          <button
            type="button"
            onClick={disconnect}
            disabled={disconnecting}
            className="px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 text-slate-700 text-[12px] font-medium transition disabled:opacity-50"
          >
            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
          </button>
        ) : (
          <a
            href={`/api/connect/slack/install?orgId=${orgId}`}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#4A154B] hover:bg-[#611f63] text-white text-[12px] font-medium transition"
          >
            <SlackGlyph />
            Add to Slack
          </a>
        )
      }
    />
  )
}

function SlackGlyph() {
  return (
    <svg width={14} height={14} viewBox="0 0 122.8 122.8" aria-hidden>
      <path fill="#e01e5a" d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9zm6.5 0c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9z"/>
      <path fill="#36c5f0" d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9zm0 6.5c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9z"/>
      <path fill="#2eb67d" d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97zm-6.5 0c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9z"/>
      <path fill="#ecb22e" d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97zm0-6.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9z"/>
    </svg>
  )
}

