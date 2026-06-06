'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Signal = 'High' | 'Steady' | 'Low' | 'Blocked'

type MemberCard = {
  membershipId: number
  userId: number
  login: string
  name: string | null
  avatarUrl: string | null
  role: string
  hasGithub: boolean
  activity: {
    activeSeconds: number
    idleSeconds: number
    topApp: string | null
    paused: boolean
  }
  narrative: {
    id: number
    body: string
    signal: Signal
    blockers: string[]
    provider: string
    model: string
    createdAt: string
  } | null
}

const SIGNAL_STYLES: Record<Signal, string> = {
  High: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  Steady: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  Low: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  Blocked: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
}

export default function TeamDashboardClient({
  orgId,
  isManager,
  members,
}: {
  orgId: number
  isManager: boolean
  members: MemberCard[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<{ membershipId: number; kind: 'sync' | 'narrative' } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState<'groq' | 'openai'>(
    (process.env.NEXT_PUBLIC_DEFAULT_AI_PROVIDER as 'groq' | 'openai') || 'groq'
  )
  const [narratives, setNarratives] = useState<Record<number, MemberCard['narrative']>>(
    Object.fromEntries(members.map((m) => [m.membershipId, m.narrative]))
  )

  async function runFor(membershipId: number, kind: 'sync' | 'narrative') {
    setBusy({ membershipId, kind })
    setError(null)
    try {
      const path =
        kind === 'sync'
          ? `/api/orgs/${orgId}/members/${membershipId}/sync`
          : `/api/orgs/${orgId}/members/${membershipId}/narrative?provider=${provider}`
      const res = await fetch(path, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || data?.error || 'failed')
      if (kind === 'narrative') {
        setNarratives((prev) => ({ ...prev, [membershipId]: serializeNarrative(data.narrative) }))
      } else {
        router.refresh()
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {isManager && (
        <div className="mb-4 flex items-center justify-end gap-2">
          <label className="text-xs text-zinc-500">Narrative provider</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as 'groq' | 'openai')}
            className="text-xs rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="groq">Groq (Llama 3.3 70B)</option>
            <option value="openai">OpenAI (gpt-4o-mini)</option>
          </select>
        </div>
      )}

      {error && <p className="mb-4 text-xs text-rose-600">{error}</p>}

      {members.length === 0 ? (
        <p className="text-sm text-zinc-500">No members yet.</p>
      ) : (
        <ul className="space-y-4">
          {members.map((m) => {
            const n = narratives[m.membershipId]
            return (
              <li
                key={m.membershipId}
                className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex items-start gap-4">
                  {m.avatarUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.avatarUrl} alt="" className="size-10 rounded-full" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">
                          {m.name || `@${m.login}`}{' '}
                          <span className="text-xs text-zinc-500">@{m.login} · {m.role}</span>
                        </p>
                        {!m.hasGithub && (
                          <p className="text-xs text-amber-700 dark:text-amber-400">
                            GitHub not connected yet
                          </p>
                        )}
                        <p className="mt-0.5 text-xs text-zinc-500">
                          Today:{' '}
                          {m.activity.activeSeconds + m.activity.idleSeconds === 0
                            ? 'no agent activity'
                            : `${fmt(m.activity.activeSeconds)} active${
                                m.activity.idleSeconds > 0 ? ` · ${fmt(m.activity.idleSeconds)} idle` : ''
                              }${m.activity.topApp ? ` · ${m.activity.topApp}` : ''}`}
                          {m.activity.paused && (
                            <span className="ml-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              paused
                            </span>
                          )}
                        </p>
                      </div>
                      {isManager && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => runFor(m.membershipId, 'sync')}
                            disabled={busy !== null || !m.hasGithub}
                            className="text-xs rounded border border-zinc-300 bg-white px-2.5 py-1 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                          >
                            {busy?.membershipId === m.membershipId && busy.kind === 'sync' ? 'Syncing…' : 'Sync'}
                          </button>
                          <button
                            onClick={() => runFor(m.membershipId, 'narrative')}
                            disabled={busy !== null}
                            className="text-xs rounded bg-zinc-900 px-2.5 py-1 font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                          >
                            {busy?.membershipId === m.membershipId && busy.kind === 'narrative' ? 'Generating…' : 'Generate'}
                          </button>
                        </div>
                      )}
                    </div>

                    {n ? (
                      <div className="mt-3 space-y-2">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${SIGNAL_STYLES[n.signal]}`}>
                          {n.signal}
                        </span>
                        <p className="text-sm leading-6 text-zinc-800 dark:text-zinc-200 whitespace-pre-line">{n.body}</p>
                        {n.blockers.length > 0 && (
                          <ul className="mt-1 list-disc pl-5 text-sm text-zinc-700 dark:text-zinc-300">
                            {n.blockers.map((b, i) => (
                              <li key={i}>{b}</li>
                            ))}
                          </ul>
                        )}
                        <p className="text-[10px] uppercase tracking-wider text-zinc-400">
                          {n.provider} · {n.model} · {new Date(n.createdAt).toLocaleString()}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-zinc-500">No narrative yet.</p>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function serializeNarrative(n: {
  id: number
  body: string
  signal: Signal
  blockers: string[]
  provider: string
  model: string
  createdAt: string
}): MemberCard['narrative'] {
  return n
}

function fmt(seconds: number): string {
  if (seconds <= 0) return '0m'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
