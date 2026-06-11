'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CharacterAvatar } from '@/components/character-avatar'
import { getCharacter } from '@/lib/characters/data'
import { useToast } from '@/components/toast'

type Member = {
  membershipId: number
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
  members,
  pendingInvites,
}: {
  orgId: number
  isOwner: boolean
  viewerMembershipId: number
  members: Member[]
  pendingInvites: PendingInvite[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'manager'>('member')
  const [discipline, setDiscipline] = useState<
    'engineering' | 'design' | 'product' | 'sales' | 'support' |
    'marketing' | 'ops' | 'hr' | 'finance' | 'exec' | 'other'
  >('other')
  const [jobTitle, setJobTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null)
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
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-[14px] font-semibold text-slate-900">Invite a teammate</h2>
        <p className="text-[12px] text-slate-500 mt-0.5">
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
              onChange={(e) => setRole(e.target.value as 'member' | 'manager')}
              className="select"
              disabled={busy}
              aria-label="Org role"
            >
              <option value="member">Member</option>
              <option value="manager">Manager</option>
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
              className="px-4 py-2 rounded-md bg-slate-900 hover:bg-slate-700 text-white text-[12.5px] font-medium disabled:opacity-50 transition"
            >
              {busy ? 'Sending…' : 'Send invite'}
            </button>
          </div>
        </form>
        {lastInviteLink && (
          <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[12px] text-slate-700">
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
                className="px-2 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-[11px] font-medium text-slate-700 transition"
              >
                {copied === lastInviteLink ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}
        {error && <p className="mt-3 text-[12px] text-rose-600">{error}</p>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-baseline justify-between">
          <h2 className="text-[13px] font-semibold text-slate-900">
            Pending invites
            <span className="ml-1.5 text-slate-400 tabular-nums">{pendingInvites.length}</span>
          </h2>
        </div>
        {pendingInvites.length === 0 ? (
          <p className="px-4 py-5 text-[12.5px] text-slate-500">No outstanding invites.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pendingInvites.map((i) => {
              const url = inviteUrl(i.token)
              return (
                <li key={i.id} className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-slate-900 truncate">
                      {i.email}
                      {i.jobTitle && <span className="text-slate-400 font-normal"> · {i.jobTitle}</span>}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {i.role}
                      {i.discipline !== 'other' && <> · {DISCIPLINE_BADGE_LABEL[i.discipline] ?? i.discipline}</>}
                      {' · expires '}{new Date(i.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => copyLink(url)}
                      className="px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-[11.5px] font-medium text-slate-700 transition"
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

      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-[13px] font-semibold text-slate-900">
            All members
            <span className="ml-1.5 text-slate-400 tabular-nums">{members.length}</span>
          </h2>
          <input
            type="search"
            placeholder="Search name, login, email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input max-w-xs"
          />
        </div>
        <table className="app-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th>Email</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filteredMembers.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-500">No matching members.</td>
              </tr>
            )}
            {filteredMembers.map((m) => {
              const hero = getCharacter(m.characterKey)
              return (
                <tr key={m.membershipId}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <CharacterAvatar characterKey={m.characterKey} size={28} />
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-slate-900 truncate">
                          {m.name ?? `@${m.login}`}
                        </p>
                        <p className="text-[11.5px] text-slate-500 truncate">
                          {m.jobTitle ?? (hero ? hero.name : `@${m.login}`)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`pill ${m.role === 'owner' ? 'pill-violet' : m.role === 'manager' ? 'pill-info' : 'pill-slate'}`}>
                        {m.role}
                      </span>
                      {m.discipline !== 'other' && (
                        <span className="text-[10.5px] uppercase tracking-wider text-slate-500">
                          {DISCIPLINE_BADGE_LABEL[m.discipline] ?? m.discipline}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="text-[12.5px] text-slate-600">{m.email ?? '—'}</td>
                  <td>
                    {isOwner && m.role !== 'owner' && m.membershipId !== viewerMembershipId && (
                      <button
                        onClick={() => removeMember(m.membershipId)}
                        disabled={busy}
                        className="px-2 py-1 rounded-md bg-white border border-rose-200 hover:bg-rose-50 text-[11.5px] font-medium text-rose-700 disabled:opacity-50 transition"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </div>
  )
}
