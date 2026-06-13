'use client'

import { useState } from 'react'

type OrgLite = { orgId: number; name: string; plan: string }
type Ann = {
  id: number
  title: string
  body: string
  severity: string
  audience: string
  href: string | null
  startsAt: string
  endsAt: string | null
}

export function BroadcastClient({
  orgs,
  initialAnnouncements,
}: {
  orgs: OrgLite[]
  initialAnnouncements: Ann[]
}) {
  const [announcements, setAnnouncements] = useState<Ann[]>(initialAnnouncements)
  const [tab, setTab] = useState<'digest' | 'announce'>('digest')

  return (
    <>
      <div className="flex items-center gap-1 mb-5 border-b border-white/5">
        <TabBtn label="Trigger digest" active={tab === 'digest'} onClick={() => setTab('digest')} />
        <TabBtn label="Announcements" active={tab === 'announce'} onClick={() => setTab('announce')} />
      </div>
      {tab === 'digest' ? (
        <DigestPanel orgs={orgs} />
      ) : (
        <AnnouncePanel
          announcements={announcements}
          onCreate={(a) => setAnnouncements([a, ...announcements])}
          onRetire={(id) =>
            setAnnouncements(
              announcements.map((x) =>
                x.id === id ? { ...x, endsAt: new Date().toISOString() } : x,
              ),
            )
          }
        />
      )}
    </>
  )
}

function TabBtn({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-[13px] font-medium border-b-2 transition ${
        active ? 'text-amber-300 border-amber-300' : 'text-slate-400 border-transparent hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  )
}

function DigestPanel({ orgs }: { orgs: OrgLite[] }) {
  const [kind, setKind] = useState<'weekly' | 'daily'>('weekly')
  const [scope, setScope] = useState<'all' | 'one'>('all')
  const [orgId, setOrgId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{
    sent: number
    skipped: number
    failed: number
    errors: Array<{ orgId: number; error: string }>
  } | null>(null)

  async function fire() {
    if (scope === 'one' && !orgId) return
    if (
      !confirm(
        scope === 'all'
          ? `Send ${kind} digest to ALL workspaces? This sends real email.`
          : `Send ${kind} digest to "${orgs.find((o) => o.orgId === orgId)?.name}"?`,
      )
    )
      return

    setBusy(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/broadcast/digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, orgId: scope === 'one' ? orgId : undefined }),
      })
      const data = await res.json()
      setResult({
        sent: data.sent ?? 0,
        skipped: data.skipped ?? 0,
        failed: data.failed ?? 0,
        errors: data.errors ?? [],
      })
    } catch (e) {
      setResult({
        sent: 0,
        skipped: 0,
        failed: 1,
        errors: [{ orgId: 0, error: e instanceof Error ? e.message : String(e) }],
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
      <p className="text-[13px] text-slate-300 mb-4">
        Trigger a digest send right now — same email body as the cron, but fired on demand.
        Useful when the cron didn&apos;t run, when you want to preview a tweak, or when you&apos;re running a
        retention play.
      </p>

      <div className="space-y-3">
        <Field label="Digest type">
          <div className="flex gap-2">
            <Radio label="Weekly · CEO digest" checked={kind === 'weekly'} onChange={() => setKind('weekly')} />
            <Radio label="Daily · Manager digest" checked={kind === 'daily'} onChange={() => setKind('daily')} />
          </div>
        </Field>

        <Field label="Recipients">
          <div className="flex gap-2">
            <Radio label={`All ${orgs.length} workspaces`} checked={scope === 'all'} onChange={() => setScope('all')} />
            <Radio label="One workspace" checked={scope === 'one'} onChange={() => setScope('one')} />
          </div>
        </Field>

        {scope === 'one' && (
          <Field label="Workspace">
            <select
              value={orgId ?? ''}
              onChange={(e) => setOrgId(Number(e.target.value) || null)}
              className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-[13px] text-slate-100 w-full max-w-md"
            >
              <option value="">— Pick a workspace —</option>
              {orgs.map((o) => (
                <option key={o.orgId} value={o.orgId}>
                  {o.name} · {o.plan}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="pt-2">
          <button
            type="button"
            onClick={fire}
            disabled={busy || (scope === 'one' && !orgId)}
            className="px-5 py-2.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-900 text-[13px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {busy ? 'Sending…' : `Send ${kind} digest`}
          </button>
        </div>

        {result && (
          <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-3">
            <p className="text-[12px] text-slate-200">
              <span className="text-emerald-300 font-medium">{result.sent} sent</span>
              <span className="text-slate-500 mx-2">·</span>
              <span className="text-slate-400">{result.skipped} skipped</span>
              <span className="text-slate-500 mx-2">·</span>
              <span className={result.failed > 0 ? 'text-rose-300' : 'text-slate-400'}>
                {result.failed} failed
              </span>
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-[11.5px] text-rose-300/80">
                {result.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>
                    org {e.orgId}: {e.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function AnnouncePanel({
  announcements,
  onCreate,
  onRetire,
}: {
  announcements: Ann[]
  onCreate: (a: Ann) => void
  onRetire: (id: number) => void
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [severity, setSeverity] = useState<'info' | 'warn' | 'critical'>('info')
  const [audience, setAudience] = useState<'all' | 'owners' | 'managers'>('all')
  const [href, setHref] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (title.length < 3 || body.length < 3) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          severity,
          audience,
          href: href || null,
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        onCreate({
          id: data.announcement.id,
          title: data.announcement.title,
          body: data.announcement.body,
          severity: data.announcement.severity,
          audience: data.announcement.audience,
          href: data.announcement.href,
          startsAt: data.announcement.startsAt ?? data.announcement.starts_at ?? new Date().toISOString(),
          endsAt: data.announcement.endsAt ?? data.announcement.ends_at ?? null,
        })
        setTitle('')
        setBody('')
        setHref('')
        setEndsAt('')
        setSeverity('info')
        setAudience('all')
      }
    } finally {
      setBusy(false)
    }
  }

  async function retire(id: number) {
    if (!confirm('Retire this announcement now? It disappears from every customer dashboard immediately.')) return
    const res = await fetch(`/api/admin/announcements/${id}`, { method: 'DELETE' })
    if (res.ok) onRetire(id)
  }

  return (
    <div className="grid md:grid-cols-2 gap-5">
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
        <p className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-3">New announcement</p>
        <div className="space-y-3">
          <Field label="Title">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Scheduled maintenance Sunday 02:00 UTC"
              className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-[13px] text-slate-100"
            />
          </Field>
          <Field label="Body">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Up to 2000 characters. Plain text."
              rows={4}
              className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-[13px] text-slate-100 resize-y"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Severity">
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as typeof severity)}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-[13px] text-slate-100"
              >
                <option value="info">Info</option>
                <option value="warn">Warn</option>
                <option value="critical">Critical</option>
              </select>
            </Field>
            <Field label="Audience">
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value as typeof audience)}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-[13px] text-slate-100"
              >
                <option value="all">Everyone</option>
                <option value="owners">Owners only</option>
                <option value="managers">Managers + above</option>
              </select>
            </Field>
          </div>
          <Field label="Learn-more URL (optional)">
            <input
              type="url"
              value={href}
              onChange={(e) => setHref(e.target.value)}
              placeholder="https://…"
              className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-[13px] text-slate-100"
            />
          </Field>
          <Field label="Ends at (optional — leave blank to keep until you retire it)">
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-[13px] text-slate-100"
            />
          </Field>
          <button
            type="button"
            onClick={submit}
            disabled={busy || title.length < 3 || body.length < 3}
            className="px-5 py-2.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-900 text-[13px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {busy ? 'Publishing…' : 'Publish announcement'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
        <p className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-3">
          Recent announcements ({announcements.length})
        </p>
        {announcements.length === 0 ? (
          <p className="text-[13px] text-slate-500">No announcements yet.</p>
        ) : (
          <ul className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
            {announcements.map((a) => {
              const active = !a.endsAt || new Date(a.endsAt) > new Date()
              const sevColor =
                a.severity === 'critical'
                  ? 'text-rose-300 border-rose-400/30'
                  : a.severity === 'warn'
                    ? 'text-amber-300 border-amber-400/30'
                    : 'text-sky-300 border-sky-400/30'
              return (
                <li
                  key={a.id}
                  className={`rounded-lg border px-3 py-2.5 ${active ? sevColor : 'border-white/5 text-slate-500'} bg-black/20`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium truncate">
                        {a.title}
                        <span className="ml-1.5 text-[10px] uppercase tracking-wider opacity-60">
                          {a.severity} · {a.audience}
                        </span>
                      </p>
                      <p className="text-[11.5px] mt-1 text-slate-400 line-clamp-2">{a.body}</p>
                      <p className="text-[10.5px] mt-1 text-slate-500">
                        {active ? 'Active' : 'Retired'} · since {new Date(a.startsAt).toLocaleString()}
                        {a.endsAt && ` · ends ${new Date(a.endsAt).toLocaleString()}`}
                      </p>
                    </div>
                    {active && (
                      <button
                        type="button"
                        onClick={() => retire(a.id)}
                        className="text-[11px] text-rose-300 hover:text-rose-200 shrink-0"
                      >
                        Retire
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block mb-1.5">
        {label}
      </span>
      {children}
    </label>
  )
}

function Radio({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`px-3 py-2 rounded-lg border text-[13px] transition ${
        checked
          ? 'bg-amber-400/10 border-amber-400/50 text-amber-200'
          : 'bg-white/[0.03] border-white/10 text-slate-300 hover:border-white/20'
      }`}
    >
      {label}
    </button>
  )
}
