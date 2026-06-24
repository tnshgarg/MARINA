'use client'

import { useState } from 'react'

type Report = {
  label: string
  format: string
  shipped: Array<{ title: string; repo: string; status?: string; url: string }>
  commitTitles: string[]
  reviews: Array<{ title: string; repo: string; url: string }>
  meetings: Array<{ title: string; minutes: number; when: string; with: string[]; url: string | null }>
  deliverables: Array<{ title: string; detail: string | null; kind: string | null; url: string | null }>
  counts: { commits: number; prs: number; reviews: number; meetings: number; deliverables: number }
  empty: boolean
  markdown: string
  slack: string
}

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This week' },
  { key: 'last7', label: 'Last 7 days' },
]
/**
 * "Prove your day" — the report that's always already written. Pick a window
 * and Marina assembles your real GitHub + meetings + deliverables into an update
 * you can paste into Slack, copy as markdown, or save as PDF. Deliberately one
 * button — a stressed employee shouldn't have to choose a "format".
 */
export function DayReport() {
  const [range, setRange] = useState('today')
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  async function generate() {
    setBusy(true)
    setError(null)
    setCopied(null)
    try {
      const res = await fetch('/api/me/day-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ range, format: 'status' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'failed')
      setReport(data.report)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  async function copy(text: string, which: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied(null), 1800)
    } catch {
      /* clipboard unavailable */
    }
  }

  function download() {
    if (!report) return
    const blob = new Blob([report.markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report-${range}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  function printPdf() {
    if (!report) return
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
    const title = report.format === 'oneonone' ? '1:1 update' : report.format === 'status' ? 'Status update' : 'Standup'
    const sec = (h: string, items: string[]) => (items.length ? `<h2>${h}</h2><ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : '')
    const shipped = report.shipped.map((s) => `${s.status ? `[${s.status}] ` : ''}${esc(s.title)} <em>(${esc(s.repo)})</em>`)
    if (report.counts.commits) shipped.push(`+ ${report.counts.commits} commit${report.counts.commits === 1 ? '' : 's'}`)
    const body =
      sec('Shipped', shipped) +
      sec('Reviews', report.reviews.map((r) => `${esc(r.title)} <em>(${esc(r.repo)})</em>`)) +
      sec('Other deliverables', report.deliverables.map((d) => esc(d.title))) +
      sec('Meetings', report.meetings.map((m) => `${m.minutes}m · ${esc(m.title)}`))
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(
      `<html><head><title>${title} — ${esc(report.label)}</title><style>` +
        'body{font-family:-apple-system,system-ui,sans-serif;max-width:680px;margin:48px auto;padding:0 24px;color:#1a1f2e;line-height:1.55}' +
        'h1{font-size:22px;margin:0 0 4px}h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#3f6b54;margin:22px 0 6px}' +
        'ul{margin:0;padding-left:18px}li{margin:3px 0}em{color:#8a91a3;font-style:normal}.f{color:#8a91a3;font-size:12px;margin-top:28px}' +
        `</style></head><body><h1>${title} — ${esc(report.label)}</h1>${body}` +
        `<p class="f">${report.counts.commits} commits · ${report.counts.prs} PRs · ${report.counts.reviews} reviews · ${report.counts.meetings} meetings · ${report.counts.deliverables} other<br/>Generated with Marina</p></body></html>`,
    )
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 250)
  }

  return (
    <section className="app-card app-card-lg relative overflow-hidden">
      <div aria-hidden className="absolute -top-16 -right-16 w-56 h-56 rounded-full blur-3xl opacity-25" style={{ background: 'var(--m-accent)' }} />
      <div className="relative">
        <p className="app-eyebrow">Prove your day</p>
        <h2 className="font-display text-[24px] leading-tight text-[var(--m-ink)] mt-0.5">Your status report, already written</h2>
        <p className="app-sub mt-1 max-w-lg">
          When someone asks what you did, it&rsquo;s ready. Marina assembles your real work — commits, PRs, reviews,
          meetings and what you logged — for any window.
        </p>

        {/* Controls */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-[var(--m-border)] overflow-hidden">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                className={`text-[12.5px] px-2.5 py-1.5 transition-colors ${range === r.key ? 'bg-[var(--m-accent)] text-white' : 'bg-white text-[var(--m-ink-2)] hover:bg-[var(--m-bg-soft)]'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={generate} disabled={busy} className="btn-sage text-[13px] disabled:opacity-60">
            {busy ? 'Assembling…' : 'Generate my update'}
          </button>
        </div>

        {error && <p className="mt-3 text-[12px] text-[var(--m-bad)]">Couldn&apos;t generate — {error}</p>}

        {report && (
          <div className="mt-4 rounded-xl border border-[var(--m-border)] bg-white">
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[var(--m-border-soft)]">
              <p className="text-[11px] uppercase tracking-wider text-[var(--m-ink-4)] font-semibold">{report.label}</p>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => copy(report.slack, 'slack')} className="text-[11.5px] px-2 py-1 rounded-md border border-[var(--m-border)] text-[var(--m-ink-2)] hover:border-[var(--m-accent)] hover:text-[var(--m-accent)] transition-colors">
                  {copied === 'slack' ? 'Copied ✓' : 'Copy for Slack'}
                </button>
                <button type="button" onClick={() => copy(report.markdown, 'md')} className="text-[11.5px] px-2 py-1 rounded-md border border-[var(--m-border)] text-[var(--m-ink-2)] hover:border-[var(--m-accent)] hover:text-[var(--m-accent)] transition-colors">
                  {copied === 'md' ? 'Copied ✓' : 'Copy markdown'}
                </button>
                <button type="button" onClick={download} className="text-[11.5px] px-2 py-1 rounded-md border border-[var(--m-border)] text-[var(--m-ink-2)] hover:border-[var(--m-accent)] hover:text-[var(--m-accent)] transition-colors">
                  .md
                </button>
                <button type="button" onClick={printPdf} className="text-[11.5px] px-2 py-1 rounded-md border border-[var(--m-border)] text-[var(--m-ink-2)] hover:border-[var(--m-accent)] hover:text-[var(--m-accent)] transition-colors">
                  PDF
                </button>
              </div>
            </div>

            <div className="p-4">
              {report.empty ? (
                <p className="text-[13px] text-[var(--m-ink-3)]">
                  Nothing recorded in this window. Sync GitHub, connect your calendar, or log a deliverable on the right —
                  then your report fills itself.
                </p>
              ) : (
                <div className="space-y-3 text-[13px]">
                  <Section title="Pull requests" show={report.shipped.length > 0}>
                    {report.shipped.map((s, i) => (
                      <Item key={i} label={`[${s.status ?? 'open'}] `} title={s.title} sub={s.repo} url={s.url} />
                    ))}
                  </Section>
                  <Section title="Commits" show={report.commitTitles.length > 0 || report.counts.commits > 0}>
                    {report.commitTitles.map((t, i) => <Item key={i} title={t} />)}
                    {report.counts.commits > report.commitTitles.length && (
                      <li className="text-[var(--m-ink-4)] text-[12px] pl-4">…and {report.counts.commits - report.commitTitles.length} more</li>
                    )}
                  </Section>
                  <Section title="Reviews given" show={report.reviews.length > 0}>
                    {report.reviews.map((r, i) => <Item key={i} title={r.title} sub={r.repo} url={r.url} />)}
                  </Section>
                  <Section title="Other deliverables" show={report.deliverables.length > 0}>
                    {report.deliverables.map((d, i) => <Item key={i} title={d.title} sub={d.detail ?? d.kind ?? ''} url={d.url ?? undefined} />)}
                  </Section>
                  <Section title="Meetings" show={report.meetings.length > 0}>
                    {report.meetings.map((m, i) => (
                      <Item key={i} title={m.title} sub={`${m.minutes}m${m.with.length ? ` · with ${m.with.join(', ')}` : ''}`} url={m.url ?? undefined} />
                    ))}
                  </Section>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function Section({ title, show, children }: { title: string; show: boolean; children: React.ReactNode }) {
  if (!show) return null
  return (
    <div>
      <p className="text-[10.5px] uppercase tracking-wider text-[var(--m-accent)] font-semibold mb-1">{title}</p>
      <ul className="space-y-1">{children}</ul>
    </div>
  )
}

function Item({ label = '', title, sub, url }: { label?: string; title: string; sub?: string; url?: string }) {
  return (
    <li className="flex items-start gap-2 leading-snug">
      <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--m-accent)]" />
      <span className="text-[var(--m-ink)] min-w-0 flex-1">
        {label}
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="hover:text-[var(--m-accent)]">{title}</a>
        ) : (
          title
        )}
        {sub ? <span className="text-[var(--m-ink-4)] text-[11.5px]"> · {sub}</span> : null}
      </span>
    </li>
  )
}
