'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CharacterAvatar } from '@/components/character-avatar'
import { getCharacter } from '@/lib/characters/data'
import { useToast } from '@/components/toast'
import { Modal } from '@/components/modal'

type Member = {
  membershipId: number
  userId: number
  login: string
  name: string | null
  email: string | null
  avatarUrl: string | null
  characterKey: string | null
  role: string
  discipline: string
  jobTitle: string | null
}

type PendingInvite = {
  id: number
  email: string
  role: string
  discipline: string
  jobTitle: string | null
  token: string
  expiresAt: string
}

const DISCIPLINE_BADGE_LABEL: Record<string, string> = {
  engineering: 'Engineering',
  design: 'Design',
  product: 'Product',
  sales: 'Sales',
  support: 'Support',
  marketing: 'Marketing',
  ops: 'Ops',
  hr: 'People',
  finance: 'Finance',
  exec: 'Leadership',
  other: 'Team',
}

export default function MembersClient({
  orgId,
  isOwner,
  viewerMembershipId,
  canViewReports = false,
  members,
  pendingInvites,
}: {
  orgId: number
  isOwner: boolean
  viewerMembershipId: number
  /** Whether the viewer can open per-employee performance reports (view_all_data). */
  canViewReports?: boolean
  members: Member[]
  pendingInvites: PendingInvite[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'manager' | 'admin'>('member')
  const [discipline, setDiscipline] = useState<
    'engineering' | 'design' | 'product' | 'sales' | 'support' |
    'marketing' | 'ops' | 'hr' | 'finance' | 'exec' | 'other'
  >('other')
  const [jobTitle, setJobTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null)
  /** Member currently in the report-date-picker modal. */
  const [reportFor, setReportFor] = useState<Member | null>(null)
  const [linkSent, setLinkSent] = useState<boolean | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setLastInviteLink(null)
    setLinkSent(null)
    try {
      const res = await fetch(`/api/orgs/${orgId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          role,
          discipline,
          jobTitle: jobTitle.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`)
      setEmail('')
      setJobTitle('')
      setLastInviteLink(data.inviteUrl)
      setLinkSent(Boolean(data.email?.sent))
      toast.push({
        kind: 'success',
        title: data.email?.sent ? 'Invite emailed' : 'Invite created',
        body: data.email?.sent ? `Sent to ${data.email.to ?? email}` : 'Copy the link below to share manually.',
      })
      router.refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      toast.push({ kind: 'error', title: 'Invite failed', body: msg })
    } finally {
      setBusy(false)
    }
  }

  async function revoke(inviteId: number) {
    if (!confirm('Revoke this invite? The link will stop working.')) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/orgs/${orgId}/invites/${inviteId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`)
      toast.push({ kind: 'success', title: 'Invite revoked' })
      router.refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      toast.push({ kind: 'error', title: 'Revoke failed', body: msg })
    } finally {
      setBusy(false)
    }
  }

  async function removeMember(membershipId: number) {
    if (!confirm('Remove this member from the org?')) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/orgs/${orgId}/members/${membershipId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`)
      toast.push({ kind: 'success', title: 'Member removed' })
      router.refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      toast.push({ kind: 'error', title: 'Remove failed', body: msg })
    } finally {
      setBusy(false)
    }
  }

  async function copyLink(url: string) {
    let ok = false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        ok = true
      } else {
        // Fallback for insecure contexts / older browsers
        const ta = document.createElement('textarea')
        ta.value = url
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        ok = document.execCommand('copy')
        document.body.removeChild(ta)
      }
    } catch {
      ok = false
    }
    if (ok) {
      setCopied(url)
      setTimeout(() => setCopied((c) => (c === url ? null : c)), 1500)
      toast.push({ kind: 'success', title: 'Link copied to clipboard' })
    } else {
      toast.push({
        kind: 'error',
        title: 'Copy failed',
        body: 'Select the link manually and copy it.',
      })
    }
  }

  const inviteUrl = (token: string) =>
    `${typeof window !== 'undefined' ? window.location.origin : ''}/invite/${token}`

  const [query, setQuery] = useState('')
  const filteredMembers = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return members
    return members.filter(
      (m) =>
        (m.name ?? '').toLowerCase().includes(q) ||
        m.login.toLowerCase().includes(q) ||
        (m.email ?? '').toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q)
    )
  }, [members, query])

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-[var(--m-border)] bg-white p-5">
        <h2 className="text-[14px] font-semibold text-[var(--m-ink)]">Invite a teammate</h2>
        <p className="text-[12px] text-[var(--m-ink-3)] mt-0.5">
          Pick their team role and discipline so they land in the right view from day one.
        </p>
        <form onSubmit={invite} className="mt-3 space-y-2">
          <div className="grid sm:grid-cols-2 gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              className="input"
              disabled={busy}
            />
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Job title (optional) — e.g. Senior Designer"
              maxLength={80}
              className="input"
              disabled={busy}
            />
          </div>
          <div className="grid sm:grid-cols-3 gap-2">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'member' | 'manager' | 'admin')}
              className="select"
              disabled={busy}
              aria-label="Org role"
            >
              <option value="member">Member</option>
              <option value="manager">Manager</option>
              {/* Only an owner/admin can mint another admin. */}
              {isOwner && <option value="admin">Admin (full access)</option>}
            </select>
            <select
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value as typeof discipline)}
              className="select sm:col-span-2"
              disabled={busy}
              aria-label="Discipline"
            >
              <option value="other">Discipline — Other / unsure</option>
              <option value="engineering">Engineering</option>
              <option value="design">Design</option>
              <option value="product">Product</option>
              <option value="sales">Sales</option>
              <option value="support">Customer Support</option>
              <option value="marketing">Marketing</option>
              <option value="ops">Operations</option>
              <option value="hr">People / HR</option>
              <option value="finance">Finance</option>
              <option value="exec">Leadership</option>
            </select>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-md bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white text-[12.5px] font-medium disabled:opacity-50 transition"
            >
              {busy ? 'Sending…' : 'Send invite'}
            </button>
          </div>
        </form>
        {lastInviteLink && (
          <div className="mt-3 rounded-lg bg-[var(--m-bg-soft)] border border-[var(--m-border)] px-3 py-2 text-[12px] text-[var(--m-ink-2)]">
            {linkSent === false && (
              <p className="mb-1 text-amber-700 font-medium">No email provider configured — copy this link to send manually:</p>
            )}
            {linkSent && (
              <p className="mb-1 text-emerald-700 font-medium">Invite emailed · backup link:</p>
            )}
            <div className="flex items-center gap-2">
              <code className="break-all text-[11.5px]">{lastInviteLink}</code>
              <button
                onClick={() => copyLink(lastInviteLink)}
                className="px-2 py-1 rounded-md bg-white border border-[var(--m-border)] hover:bg-[var(--m-bg-soft)] text-[11px] font-medium text-[var(--m-ink-2)] transition"
              >
                {copied === lastInviteLink ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}
        {error && <p className="mt-3 text-[12px] text-rose-600">{error}</p>}
      </section>

      <section className="rounded-xl border border-[var(--m-border)] bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--m-border-soft)] flex items-baseline justify-between">
          <h2 className="text-[13px] font-semibold text-[var(--m-ink)]">
            Pending invites
            <span className="ml-1.5 text-[var(--m-ink-4)] tabular-nums">{pendingInvites.length}</span>
          </h2>
        </div>
        {pendingInvites.length === 0 ? (
          <p className="px-4 py-5 text-[12.5px] text-[var(--m-ink-3)]">No outstanding invites.</p>
        ) : (
          <ul className="divide-y divide-[var(--m-border-soft)]">
            {pendingInvites.map((i) => {
              const url = inviteUrl(i.token)
              return (
                <li key={i.id} className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-[var(--m-ink)] truncate">
                      {i.email}
                      {i.jobTitle && <span className="text-[var(--m-ink-4)] font-normal"> · {i.jobTitle}</span>}
                    </p>
                    <p className="text-[11px] text-[var(--m-ink-3)]">
                      {i.role}
                      {i.discipline !== 'other' && <> · {DISCIPLINE_BADGE_LABEL[i.discipline] ?? i.discipline}</>}
                      {' · expires '}{new Date(i.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => copyLink(url)}
                      className="px-2.5 py-1 rounded-md bg-white border border-[var(--m-border)] hover:bg-[var(--m-bg-soft)] text-[11.5px] font-medium text-[var(--m-ink-2)] transition"
                    >
                      {copied === url ? 'Copied' : 'Copy link'}
                    </button>
                    <button
                      onClick={() => revoke(i.id)}
                      disabled={busy}
                      className="px-2.5 py-1 rounded-md bg-white border border-rose-200 hover:bg-rose-50 text-[11.5px] font-medium text-rose-700 disabled:opacity-50 transition"
                    >
                      Revoke
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* All members — grid-based layout instead of a <table>. The table
          version kept fighting `-mx`/colgroup tradeoffs and overflowing on
          narrow screens; a simple `grid-cols-[…]` row gets us pixel-perfect
          alignment between the header and each row without horizontal
          scroll. The header is sticky-ish (just a top divider) and the row
          truncates each cell so long emails never push the actions off
          screen. */}
      <section className="rounded-xl border border-[var(--m-border)] bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--m-border-soft)] flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-[13px] font-semibold text-[var(--m-ink)]">
            All members
            <span className="ml-1.5 text-[var(--m-ink-4)] tabular-nums">{members.length}</span>
          </h2>
          <input
            type="search"
            placeholder="Search name, login, email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input max-w-xs"
          />
        </div>

        {/* Header row — the grid template is shared with each <li> below
            so columns align pixel-perfect. We use a `[44px]` first column
            for the avatar slot inside the rows so the header `Member` label
            sits visually on top of the NAME, not the avatar.
            Hidden on mobile — the row layout below collapses to a stacked
            card and column headers don't make sense there. */}
        <div className="hidden md:grid grid-cols-[44px_minmax(0,1.4fr)_minmax(0,160px)_minmax(0,1.2fr)_minmax(0,170px)] gap-3 items-center px-4 py-2.5 border-b border-[var(--m-border-soft)] text-[11px] uppercase tracking-wider text-[var(--m-ink-3)] font-medium">
          <span aria-hidden></span>
          <span>Member</span>
          <span>Role</span>
          <span>Email</span>
          <span className="text-right">Actions</span>
        </div>

        {filteredMembers.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-[var(--m-ink-3)]">No matching members.</p>
        ) : (
          <ul className="divide-y divide-[var(--m-border-soft)]">
            {filteredMembers.map((m) => {
              const hero = getCharacter(m.characterKey)
              const roleClass =
                m.role === 'admin' ? 'pill-violet' :
                m.role === 'manager' ? 'pill-info' :
                'pill-slate'
              return (
                <li
                  key={m.membershipId}
                  className="grid grid-cols-[44px_minmax(0,1fr)_auto] md:grid-cols-[44px_minmax(0,1.4fr)_minmax(0,160px)_minmax(0,1.2fr)_minmax(0,170px)] gap-3 items-center px-4 py-3 hover:bg-[var(--m-bg-soft)]/60 transition-colors"
                >
                  {/* Avatar */}
                  <CharacterAvatar
                    characterKey={m.characterKey} name={m.name} login={m.login}
                    imageUrl={(m as { avatarUrl?: string | null }).avatarUrl ?? null}
                    size={32}
                  />

                  {/* Name + subtitle — click-target for the full profile page.
                      We wrap in a Next Link so the whole text column routes
                      while leaving the action cells (Report, Remove) outside
                      the link so their click handlers still fire. */}
                  <a
                    href={`/org/${orgId}/people/${m.membershipId}`}
                    className="min-w-0 block hover:text-[var(--m-accent)] transition-colors"
                  >
                    <p className="text-[13px] font-medium text-[var(--m-ink)] truncate">
                      {m.name ?? `@${m.login}`}
                    </p>
                    <p className="text-[11.5px] text-[var(--m-ink-3)] truncate">
                      {m.jobTitle ?? (hero ? hero.name : `@${m.login}`)}
                    </p>
                    {/* Mobile-only mini meta row */}
                    <div className="md:hidden mt-1 flex items-center gap-1.5 min-w-0">
                      <span className={`pill ${roleClass}`}>{m.role}</span>
                      {m.email && (
                        <span className="text-[10.5px] text-[var(--m-ink-3)] truncate">
                          {m.email}
                        </span>
                      )}
                    </div>
                  </a>

                  {/* Role + discipline — desktop only column */}
                  <div className="hidden md:block min-w-0">
                    <span className={`pill ${roleClass}`}>{m.role}</span>
                    {m.discipline !== 'other' && (
                      <p className="mt-0.5 text-[10.5px] uppercase tracking-wider text-[var(--m-ink-3)] truncate">
                        {DISCIPLINE_BADGE_LABEL[m.discipline] ?? m.discipline}
                      </p>
                    )}
                  </div>

                  {/* Email — desktop only column */}
                  <p className="hidden md:block text-[12.5px] text-[var(--m-ink-2)] truncate min-w-0" title={m.email ?? undefined}>
                    {m.email ?? '—'}
                  </p>

                  {/* Actions — sticks right, never wraps. */}
                  <div className="flex items-center gap-1.5 justify-end shrink-0">
                    {canViewReports && (
                      <button
                        onClick={() => setReportFor(m)}
                        className="px-2 py-1 rounded-md bg-white border border-[var(--m-border)] hover:bg-[var(--m-bg-soft)] text-[11.5px] font-medium text-[var(--m-ink-2)] transition whitespace-nowrap"
                        title="Generate a performance review PDF for this employee"
                      >
                        Report
                      </button>
                    )}
                    {isOwner && m.role !== 'admin' && m.membershipId !== viewerMembershipId && (
                      <button
                        onClick={() => removeMember(m.membershipId)}
                        disabled={busy}
                        className="px-2 py-1 rounded-md bg-white border border-rose-200 hover:bg-rose-50 text-[11.5px] font-medium text-rose-700 disabled:opacity-50 transition whitespace-nowrap"
                      >
                        <span className="hidden sm:inline">Remove</span>
                        <span className="sm:hidden">×</span>
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {reportFor && (
        <ReportRangePicker
          orgId={orgId}
          member={reportFor}
          onClose={() => setReportFor(null)}
        />
      )}
    </div>
  )
}

/**
 * Date-range picker + "Open report" launcher. The report itself is its own
 * route (/org/{orgId}/reports/performance) so the manager can leave it open
 * in a tab and use the browser's print → save as PDF.
 *
 * We default to "last 30 days" because that's the cadence most teams review
 * at; quick presets cover 7/30/90 day common cases without forcing
 * fiddling.
 */
function ReportRangePicker({
  orgId,
  member,
  onClose,
}: {
  orgId: number
  member: Member
  onClose: () => void
}) {
  const today = new Date()
  const toIso = (d: Date) => d.toISOString().slice(0, 10)
  const [from, setFrom] = useState(toIso(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)))
  const [to, setTo] = useState(toIso(today))

  function preset(days: number) {
    setFrom(toIso(new Date(today.getTime() - days * 24 * 60 * 60 * 1000)))
    setTo(toIso(today))
  }

  const url = `/org/${orgId}/reports/performance?userId=${member.userId}&from=${from}&to=${to}`
  const valid = from && to && from <= to

  return (
    <Modal
      open
      onClose={onClose}
      title={`Performance report · ${member.name ?? `@${member.login}`}`}
      subtitle="Pick the window. We'll grade their period and prep a PDF you can share."
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md bg-white border border-[var(--m-border)] hover:bg-[var(--m-bg-soft)] text-[var(--m-ink-2)] text-[12.5px] font-medium transition"
          >
            Cancel
          </button>
          <a
            href={valid ? url : undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!valid}
            className={`px-3 py-1.5 rounded-md text-[12.5px] font-medium transition ${
              valid
                ? 'bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white'
                : 'bg-[var(--m-border)] text-[var(--m-ink-4)] pointer-events-none'
            }`}
          >
            Open report →
          </a>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="app-eyebrow block mb-1.5">From</label>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="input w-full"
            />
          </div>
          <div>
            <label className="app-eyebrow block mb-1.5">To</label>
            <input
              type="date"
              value={to}
              min={from}
              max={toIso(today)}
              onChange={(e) => setTo(e.target.value)}
              className="input w-full"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="app-eyebrow">Quick range</span>
          {[
            { label: 'Last 7 days', days: 7 },
            { label: 'Last 30 days', days: 30 },
            { label: 'Last 90 days', days: 90 },
          ].map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => preset(p.days)}
              className="px-2.5 py-1 rounded-md bg-white border border-[var(--m-border)] hover:bg-[var(--m-bg-soft)] text-[11.5px] font-medium text-[var(--m-ink-2)] transition"
            >
              {p.label}
            </button>
          ))}
        </div>

        <p className="text-[12px] text-[var(--m-ink-3)] leading-relaxed">
          The PDF combines hours worked, focus %, deliverables shipped, blockers, meetings
          and a short AI-written summary grounded on those numbers. Nothing else gets sent
          to the model — your team's privacy stays intact.
        </p>
      </div>
    </Modal>
  )
}
