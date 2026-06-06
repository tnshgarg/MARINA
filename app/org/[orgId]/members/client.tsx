'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Member = {
  membershipId: number
  login: string
  name: string | null
  email: string | null
  avatarUrl: string | null
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

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Invite a member</h2>
        <form onSubmit={invite} className="mt-3 flex gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@example.com"
            className="flex-1 rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            disabled={busy}
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'member' | 'manager')}
            className="rounded border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            disabled={busy}
          >
            <option value="member">Member</option>
            <option value="manager">Manager</option>
          </select>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {busy ? 'Sending…' : 'Send invite'}
          </button>
        </form>
        {lastInviteLink && (
          <div className="mt-3 rounded bg-zinc-100 px-3 py-2 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            {linkSent === false && (
              <p className="mb-1">No email provider configured — copy this link to send manually:</p>
            )}
            {linkSent && <p className="mb-1">Invite emailed. Backup link:</p>}
            <div className="flex items-center gap-2">
              <code className="break-all">{lastInviteLink}</code>
              <button
                onClick={() => copyLink(lastInviteLink)}
                className="shrink-0 rounded border border-zinc-300 px-2 py-0.5 text-[10px] dark:border-zinc-700"
              >
                {copied === lastInviteLink ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}
        {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Pending invites ({pendingInvites.length})
        </h2>
        {pendingInvites.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">None.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-900">
            {pendingInvites.map((i) => {
              const url = inviteUrl(i.token)
              return (
                <li key={i.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-900 dark:text-zinc-100 truncate">{i.email}</p>
                    <p className="text-xs text-zinc-500">
                      {i.role} · expires {new Date(i.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyLink(url)}
                      className="text-xs rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700"
                    >
                      {copied === url ? 'Copied' : 'Copy link'}
                    </button>
                    <button
                      onClick={() => revoke(i.id)}
                      disabled={busy}
                      className="text-xs rounded border border-rose-300 px-2 py-1 text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300"
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

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Members ({members.length})
        </h2>
        <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-900">
          {members.map((m) => (
            <li key={m.membershipId} className="py-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {m.avatarUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.avatarUrl} alt="" className="size-8 rounded-full" />
                )}
                <div className="min-w-0">
                  <p className="text-sm text-zinc-900 dark:text-zinc-100 truncate">
                    {m.name || `@${m.login}`}{' '}
                    <span className="text-xs text-zinc-500">@{m.login}</span>
                  </p>
                  <p className="text-xs text-zinc-500">
                    {m.role}{m.email ? ` · ${m.email}` : ''}
                  </p>
                </div>
              </div>
              {isOwner && m.role !== 'owner' && m.membershipId !== viewerMembershipId && (
                <button
                  onClick={() => removeMember(m.membershipId)}
                  disabled={busy}
                  className="text-xs rounded border border-rose-300 px-2 py-1 text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
