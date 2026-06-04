'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type EventDto = {
  id: number
  type: 'commit' | 'pr_opened' | 'pr_reviewed' | 'issue_closed'
  repo: string
  title: string
  url: string
  occurredAt: string
}

type NarrativeDto = {
  id: number
  body: string
  signal: 'High' | 'Steady' | 'Low' | 'Blocked'
  blockers: string[]
  provider: string
  model: string
  periodStart: string
  periodEnd: string
  createdAt: string
}

type Props = {
  initialEvents: EventDto[]
  initialNarrative: NarrativeDto | null
  periodStart: string
  periodEnd: string
}

const SIGNAL_STYLES: Record<NarrativeDto['signal'], string> = {
  High: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  Steady: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  Low: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  Blocked: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
}

const TYPE_LABEL: Record<EventDto['type'], string> = {
  commit: 'commit',
  pr_opened: 'PR opened',
  pr_reviewed: 'review',
  issue_closed: 'issue closed',
}

export default function DashboardClient({ initialEvents, initialNarrative, periodEnd }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busy, setBusy] = useState<'sync' | 'narrative' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState<'groq' | 'openai'>(
    (process.env.NEXT_PUBLIC_DEFAULT_AI_PROVIDER as 'groq' | 'openai') || 'groq'
  )
  const [narrative, setNarrative] = useState<NarrativeDto | null>(initialNarrative)

  async function runSync() {
    setBusy('sync')
    setError(null)
    try {
      const res = await fetch('/api/sync/github', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || data?.error || 'sync failed')
      startTransition(() => router.refresh())
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(null)
    }
  }

  async function runNarrative() {
    setBusy('narrative')
    setError(null)
    try {
      const res = await fetch(`/api/narrative?provider=${provider}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || data?.error || 'narrative failed')
      setNarrative(data.narrative)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(null)
    }
  }

  const totals = countByType(initialEvents)

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 grid gap-6 md:grid-cols-3">
      <div className="md:col-span-2 space-y-6">
        <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Work Narrative</h2>
              <p className="text-xs text-zinc-500">
                Last 7 days · ending {new Date(periodEnd).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as 'groq' | 'openai')}
                className="text-xs rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
                disabled={busy !== null}
              >
                <option value="groq">Groq (Llama 3.3 70B)</option>
                <option value="openai">OpenAI (gpt-4o-mini)</option>
              </select>
              <button
                onClick={runNarrative}
                disabled={busy !== null || isPending}
                className="text-xs rounded-md bg-zinc-900 px-3 py-1.5 font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                {busy === 'narrative' ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </div>

          {narrative ? (
            <div className="mt-4 space-y-3">
              <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${SIGNAL_STYLES[narrative.signal]}`}>
                Signal: {narrative.signal}
              </span>
              <p className="text-sm leading-6 text-zinc-800 dark:text-zinc-200 whitespace-pre-line">{narrative.body}</p>
              {narrative.blockers.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Possible blockers</p>
                  <ul className="mt-1 list-disc pl-5 text-sm text-zinc-700 dark:text-zinc-300">
                    {narrative.blockers.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-[10px] uppercase tracking-wider text-zinc-400">
                {narrative.provider} · {narrative.model} ·{' '}
                {new Date(narrative.createdAt).toLocaleString()}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">
              No narrative yet. Sync GitHub, then click Generate.
            </p>
          )}
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Activity feed</h2>
            <span className="text-xs text-zinc-500">{initialEvents.length} events</span>
          </div>
          {initialEvents.length === 0 ? (
            <p className="text-sm text-zinc-500">No events synced yet. Click &quot;Sync GitHub&quot; above.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {initialEvents.map((e) => (
                <li key={e.id} className="py-2.5 flex items-start gap-3 text-sm">
                  <span className="mt-0.5 inline-block min-w-[78px] rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                    {TYPE_LABEL[e.type]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-zinc-900 hover:underline dark:text-zinc-100 line-clamp-2"
                    >
                      {e.title}
                    </a>
                    <p className="text-xs text-zinc-500">
                      {e.repo} · {new Date(e.occurredAt).toLocaleString()}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="space-y-6">
        <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Sync</h2>
          <button
            onClick={runSync}
            disabled={busy !== null || isPending}
            className="mt-3 w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {busy === 'sync' ? 'Syncing…' : 'Sync GitHub (7d)'}
          </button>
          {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Totals (7d)</h2>
          <dl className="mt-3 space-y-1 text-sm">
            <Row label="Commits" value={totals.commit} />
            <Row label="PRs opened" value={totals.pr_opened} />
            <Row label="Reviews given" value={totals.pr_reviewed} />
            <Row label="Issues closed" value={totals.issue_closed} />
          </dl>
        </section>
      </aside>
    </div>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-zinc-600 dark:text-zinc-400">{label}</dt>
      <dd className="font-medium text-zinc-900 dark:text-zinc-100">{value}</dd>
    </div>
  )
}

function countByType(events: EventDto[]) {
  const base = { commit: 0, pr_opened: 0, pr_reviewed: 0, issue_closed: 0 }
  for (const e of events) base[e.type]++
  return base
}
