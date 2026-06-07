'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CharacterAvatar } from '@/components/character-avatar'
import { getCharacter } from '@/lib/characters/data'

type Member = {
  membershipId: number
  login: string
  name: string | null
  email: string | null
  avatarUrl: string | null
  characterKey: string | null
  role: string
}

type PendingInvite = {
  id: number
  email: string
  role: string
  token: string
  expiresAt: string
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
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'manager'>('member')
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
        body: JSON.stringify({ email, role }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || data?.error || 'failed')
      setEmail('')
      setLastInviteLink(data.inviteUrl)
      setLinkSent(Boolean(data.email?.sent))
      router.refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  async function revoke(inviteId: number) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/orgs/${orgId}/invites/${inviteId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || data?.error || 'failed')
      router.refresh()
    } catch (e) {
      setError(String(e))
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
      if (!res.ok) throw new Error(data?.message || data?.error || 'failed')
      router.refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(url)
      setTimeout(() => setCopied((c) => (c === url ? null : c)), 1500)
    } catch {
      // ignore
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
    <div className="space-y-6">
      <section className="app-card app-card-lg">
        <h2 className="app-h2">Invite a teammate</h2>
        <p className="app-sub mt-1">They&apos;ll get an email with a one-time link.</p>
        <form onSubmit={invite} className="mt-4 flex gap-2 flex-wrap">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@example.com"
            className="input flex-1 min-w-[200px]"
            disabled={busy}
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'member' | 'manager')}
            className="select max-w-[160px]"
            disabled={busy}
          >
            <option value="member">Member</option>
            <option value="manager">Manager</option>
          </select>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Sending…' : 'Send invite'}
          </button>
        </form>
        {lastInviteLink && (
          <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-[12px] text-slate-700">
            {linkSent === false && (
              <p className="mb-1 text-amber-700 font-medium">No email provider configured — copy this link to send manually:</p>
            )}
            {linkSent && <p className="mb-1 text-emerald-700 font-medium">Invite emailed · backup link:</p>}
            <div className="flex items-center gap-2">
              <code className="break-all">{lastInviteLink}</code>
              <button onClick={() => copyLink(lastInviteLink)} className="btn-secondary text-[11px]">
                {copied === lastInviteLink ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}
        {error && <p className="mt-3 text-[12px] text-rose-600">{error}</p>}
      </section>

      <section className="app-card app-card-lg">
        <h2 className="app-h2">Pending invites · {pendingInvites.length}</h2>
        {pendingInvites.length === 0 ? (
          <p className="app-sub mt-3">No outstanding invites.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {pendingInvites.map((i) => {
              const url = inviteUrl(i.token)
              return (
                <li key={i.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-slate-900 truncate">{i.email}</p>
                    <p className="text-[11px] text-slate-500">
                      {i.role} · expires {new Date(i.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => copyLink(url)} className="btn-secondary">
                      {copied === url ? 'Copied' : 'Copy link'}
                    </button>
                    <button onClick={() => revoke(i.id)} disabled={busy} className="btn-bad">
                      Revoke
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="app-card">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="app-h2">All members · {members.length}</h2>
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
                    <div className="flex items-center gap-3">
                      <CharacterAvatar characterKey={m.characterKey} size={36} />
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium text-slate-900 truncate">
                          {m.name ?? `@${m.login}`}
                        </p>
                        <p className="text-[12px] text-slate-500 truncate">
                          {hero ? hero.name : `@${m.login}`}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`pill ${m.role === 'owner' ? 'pill-violet' : m.role === 'manager' ? 'pill-info' : 'pill-slate'}`}>
                      {m.role}
                    </span>
                  </td>
                  <td className="text-[13px] text-slate-600">{m.email ?? '—'}</td>
                  <td>
                    {isOwner && m.role !== 'owner' && m.membershipId !== viewerMembershipId && (
                      <button onClick={() => removeMember(m.membershipId)} disabled={busy} className="btn-bad">
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
