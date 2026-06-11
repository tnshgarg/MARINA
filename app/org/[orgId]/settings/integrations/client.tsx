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
  githubLinked: number
  calendarLinked: number
  teamSize: number
}

export default function IntegrationsClient({
  orgId,
  initial,
}: {
  orgId: number
  initial: Initial
}) {
  const router = useRouter()
  const [trackedOrgs, setTrackedOrgs] = useState<string[]>(initial.trackedGithubOrgs)
  const [ghInput, setGhInput] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  async function saveOrgs(next: string[]) {
    setBusy('github-orgs')
    setErr(null)
    try {
      const res = await fetch(`/api/orgs/${orgId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackedGithubOrgs: next }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'failed')
      setTrackedOrgs(next)
      setSavedAt(new Date())
      router.refresh()
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(null)
    }
  }

  function addOrg() {
    const o = ghInput.trim().toLowerCase()
    if (!o) return
    if (!/^[a-z0-9][a-z0-9-]{0,38}$/.test(o)) {
      setErr("That doesn't look like a valid GitHub org login.")
      return
    }
    if (trackedOrgs.includes(o)) {
      setGhInput('')
      return
    }
    void saveOrgs([...trackedOrgs, o])
    setGhInput('')
  }

  function removeOrg(o: string) {
    void saveOrgs(trackedOrgs.filter((x) => x !== o))
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {/* GitHub */}
      <IntegrationCard
        glyphLetter="G"
        glyphBg="bg-slate-900"
        name="GitHub"
        category="Engineering"
        status={trackedOrgs.length > 0 ? 'configured' : initial.githubLinked > 0 ? 'partial' : 'not_connected'}
        headline={
          initial.teamSize > 0
            ? `${initial.githubLinked} of ${initial.teamSize} teammate${initial.teamSize === 1 ? '' : 's'} signed in with GitHub`
            : 'No teammates yet'
        }
        description={
          <>
            <p className="mb-2">
              GitHub is connected <strong>per teammate</strong>, not per org. Each engineer signs in
              with their GitHub account once — that authorises MARINA to read their PR, review and
              commit activity. There's no separate "connect the org" step.
            </p>
            <p>
              Below you can restrict which GitHub <em>organisations</em> count. Events from any
              repo whose owner isn't on this list are filtered out, so a teammate's personal
              open-source contributions stay private.
            </p>
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            {/* Use the link-account endpoint with an explicit callbackUrl so
                the user lands back on the integrations page instead of the
                generic /dashboard. */}
            <a
              href={`/api/auth/signin/github?callbackUrl=${encodeURIComponent(
                `/org/${orgId}/settings/integrations`,
              )}`}
              className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-700 text-white font-medium transition"
            >
              {initial.githubLinked > 0 ? 'Re-link my GitHub' : 'Link my GitHub'}
            </a>
            <span className="text-slate-500">
              Each teammate links their own GitHub — there's no separate "connect the org" step.
            </span>
          </div>
        }
      >
        <GithubOrgsEditor
          orgs={trackedOrgs}
          input={ghInput}
          onInput={setGhInput}
          onAdd={addOrg}
          onRemove={removeOrg}
          saving={busy === 'github-orgs'}
        />
      </IntegrationCard>

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

      {/* Slack */}
      <IntegrationCard
        glyphLetter="S"
        glyphBg="bg-purple-500"
        name="Slack"
        category="Notifications"
        status={initial.hasSlack ? 'configured' : 'not_connected'}
        headline={
          initial.hasSlack
            ? 'Webhook configured — channel pings active'
            : 'Add a webhook to ping a Slack channel'
        }
        description={
          <p>
            One incoming webhook per org. Used for blocker pings, leave decisions, suspect
            shift alerts and standup nudges. Configure under{' '}
            <a href={`/org/${orgId}/settings`} className="text-slate-900 underline">
              Workspace
            </a>
            .
          </p>
        }
        actions={
          <a
            href={`/org/${orgId}/settings`}
            className="inline-block px-3 py-1.5 rounded-md bg-purple-600 hover:bg-purple-500 text-white text-[12px] font-medium transition"
          >
            {initial.hasSlack ? 'Manage Slack' : 'Set up Slack'}
          </a>
        }
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
          href="mailto:hello@marina.in?subject=Integration%20request"
          className="px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[12px] font-medium transition"
        >
          Request an integration
        </a>
      </section>

      {err && <p className="text-[12px] text-rose-600">{err}</p>}
      {savedAt && !err && (
        <p className="text-[12px] text-emerald-600">Saved at {savedAt.toLocaleTimeString()}</p>
      )}
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

function GithubOrgsEditor({
  orgs,
  input,
  onInput,
  onAdd,
  onRemove,
  saving,
}: {
  orgs: string[]
  input: string
  onInput: (s: string) => void
  onAdd: () => void
  onRemove: (o: string) => void
  saving: boolean
}) {
  return (
    <div className="border-t border-slate-100 pt-3">
      <label className="text-[10.5px] uppercase tracking-wider font-semibold text-slate-500 block mb-1.5">
        Tracked GitHub organisations
      </label>
      <p className="text-[11.5px] text-slate-500 leading-snug mb-2">
        Only events from repos owned by these orgs are recorded. Find the org login at the top of
        a GitHub URL: <code className="px-1 rounded bg-slate-100">github.com/<strong>acme</strong>/repo</code>.
        Leave empty to track every repo a teammate touches.
      </p>
      <div className="flex gap-1.5">
        <input
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onAdd()
            }
          }}
          placeholder="acme"
          disabled={saving}
          className="flex-1 text-[12.5px] border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-300"
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={saving || !input.trim()}
          className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-700 text-white text-[12px] font-medium disabled:opacity-50 transition"
        >
          {saving ? 'Saving…' : 'Add'}
        </button>
      </div>
      {orgs.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {orgs.map((o) => (
            <li
              key={o}
              className="inline-flex items-center gap-1 text-[11.5px] font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full"
            >
              {o}
              <button
                type="button"
                onClick={() => onRemove(o)}
                aria-label={`Remove ${o}`}
                disabled={saving}
                className="text-slate-400 hover:text-rose-600 disabled:opacity-50"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
