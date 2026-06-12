'use client'

import { useMemo, useState } from 'react'
import { CharacterAvatar } from '@/components/character-avatar'
import { TutorialHint } from '@/components/tutorial-hint'
import type { WeeklyReport, WeeklyRow } from '@/lib/reports/weekly'

type Band = 'all' | WeeklyRow['band']

const BAND_LABEL: Record<WeeklyRow['band'], string> = {
  exceptional: 'Exceptional',
  steady: 'Steady',
  watch: 'Worth watching',
  struggling: 'Struggling',
}

const BAND_TONE: Record<WeeklyRow['band'], string> = {
  exceptional: 'text-[var(--m-good)] bg-[var(--m-good-soft)]',
  steady: 'text-[var(--m-info)] bg-[var(--m-info-soft)]',
  watch: 'text-[var(--m-warn)] bg-[var(--m-warn-soft)]',
  struggling: 'text-[var(--m-bad)] bg-[var(--m-bad-soft)]',
}

/**
 * Weekly performance ranking. Reads top-down: the headline takeaways and
 * counts at the top, the per-person grid below. HR uses this once a
 * Monday morning to decide who to celebrate and who to check in on.
 */
export default function WeeklyReportClient({
  report,
  orgId,
}: {
  report: WeeklyReport
  orgId: number
}) {
  const [band, setBand] = useState<Band>('all')
  const filtered = useMemo(
    () => (band === 'all' ? report.rows : report.rows.filter((r) => r.band === band)),
    [report.rows, band],
  )

  const exceptional = report.rows.filter((r) => r.band === 'exceptional')
  const struggling = report.rows.filter((r) => r.band === 'struggling')

  return (
    <>
      <div className="mb-3 flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="app-h1">Weekly report</h1>
          <p className="mt-1.5 text-[13px] text-slate-600">
            Last 7 days · {report.weekStart} → {report.weekEnd} · graded across focus, ship rate,
            on-time arrivals, and blocker tax.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="px-2 py-0.5 rounded-full bg-[var(--m-good-soft)] text-[var(--m-good)] font-medium">
            {exceptional.length} exceptional
          </span>
          <span className="px-2 py-0.5 rounded-full bg-[var(--m-bad-soft)] text-[var(--m-bad)] font-medium">
            {struggling.length} struggling
          </span>
        </div>
      </div>

      <div className="mb-4">
        <TutorialHint id="weekly-report-intro" title="Use this once a week" tone="gold">
          The scores combine four signals: focus % (40 pts), deliverables shipped (30 pts),
          on-time rate (15 pts), and blocker tax (15 pts — high if they've spent hours stuck).
          We surface the band, not the math — but you can hover any row for the breakdown,
          and click <b>Report</b> to generate a shareable PDF.
        </TutorialHint>
      </div>

      {/* Headline KPIs — same typography-led treatment as the org dashboard
          so the two surfaces read as one product. Big number on the left,
          quiet label on the right, no boxes around them. */}
      <div className="mb-6 flex items-center gap-x-8 gap-y-2 flex-wrap pb-5 border-b border-slate-200">
        <Stat label="members" value={String(report.totals.members)} />
        <Stat
          label="avg focus"
          value={`${report.totals.avgFocus}%`}
          tone={report.totals.avgFocus >= 65 ? 'good' : report.totals.avgFocus >= 45 ? 'warn' : 'bad'}
        />
        <Stat label="shipped" value={String(report.totals.deliverablesShipped)} tone="good" />
        <Stat
          label="open blockers"
          value={String(report.totals.blockersOpen)}
          tone={report.totals.blockersOpen > 3 ? 'bad' : undefined}
        />
      </div>

      {/* Filter strip */}
      <div className="mb-3 inline-flex bg-white border border-slate-200 rounded-lg p-0.5">
        {(['all', 'exceptional', 'steady', 'watch', 'struggling'] as const).map((b) => {
          const count = b === 'all' ? report.rows.length : report.rows.filter((r) => r.band === b).length
          return (
            <button
              key={b}
              type="button"
              onClick={() => setBand(b)}
              className={`px-3 py-1.5 rounded-md text-[12.5px] font-medium transition ${
                band === b
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {b === 'all' ? 'All' : BAND_LABEL[b]}
              <span className="ml-1 text-slate-400 tabular-nums">{count}</span>
            </button>
          )
        })}
      </div>

      {/* Top + bottom callouts */}
      {(exceptional.length > 0 || struggling.length > 0) && band === 'all' && (
        <div className="mb-5 grid lg:grid-cols-2 gap-3">
          {exceptional.length > 0 && (
            <CalloutBlock
              tone="good"
              title="Worth celebrating"
              sub="HR can call these out in the next team meeting."
              rows={exceptional.slice(0, 3)}
              orgId={orgId}
            />
          )}
          {struggling.length > 0 && (
            <CalloutBlock
              tone="bad"
              title="Worth checking in on"
              sub="Schedule a 1:1 this week — don't let it slip."
              rows={struggling.slice(0, 3)}
              orgId={orgId}
            />
          )}
        </div>
      )}

      {/* Full grid */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
          <p className="font-display text-[20px] text-[var(--m-ink)] leading-tight">
            Nobody in this band this week.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((row, idx) => (
            <li key={row.userId}>
              <Row row={row} rank={band === 'all' ? idx + 1 : null} orgId={orgId} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function Row({ row, rank, orgId }: { row: WeeklyRow; rank: number | null; orgId: number }) {
  const reportUrl = `/org/${orgId}/reports/performance?userId=${row.userId}`
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-3 flex-wrap">
      {rank !== null && (
        <span className="w-7 text-[13px] font-semibold tabular-nums text-slate-400 text-right">
          {rank}
        </span>
      )}
      <CharacterAvatar characterKey={row.characterKey} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-[13.5px] font-medium text-slate-900 truncate">{row.name}</p>
          <span className={`inline-flex items-center text-[10.5px] font-medium px-1.5 py-0.5 rounded-full ${BAND_TONE[row.band]}`}>
            {BAND_LABEL[row.band]}
          </span>
        </div>
        <p className="text-[11.5px] text-slate-500 truncate">
          {row.jobTitle ?? row.discipline} · {row.hours}h · {row.focusPct}% focus · {row.deliverables} shipped
          {row.blockersFaced > 0 && (
            <span className="text-[var(--m-bad)]"> · {row.blockersFaced} blocker{row.blockersFaced === 1 ? '' : 's'} ({row.blockersHours}h)</span>
          )}
        </p>
        {row.highlight && (
          <p className="text-[11.5px] text-slate-700 truncate italic mt-0.5">
            ✓ {row.highlight}
          </p>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-3">
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Score</p>
          <p className={`text-[22px] font-semibold leading-none tabular-nums tracking-tight ${scoreColor(row.score)}`}>
            {row.score}
          </p>
        </div>
        <a
          href={reportUrl}
          target="_blank"
          rel="noreferrer"
          className="px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-[11.5px] font-medium text-slate-700 transition whitespace-nowrap"
        >
          Report →
        </a>
      </div>
    </div>
  )
}

function CalloutBlock({
  tone,
  title,
  sub,
  rows,
  orgId,
}: {
  tone: 'good' | 'bad'
  title: string
  sub: string
  rows: WeeklyRow[]
  orgId: number
}) {
  const accent = tone === 'good' ? 'border-[var(--m-good)]/30 bg-[var(--m-good-soft)]/40' : 'border-[var(--m-bad)]/30 bg-[var(--m-bad-soft)]/40'
  const eyebrow = tone === 'good' ? 'text-[var(--m-good)]' : 'text-[var(--m-bad)]'
  return (
    <div className={`rounded-xl border ${accent} px-4 py-3.5`}>
      <p className={`app-eyebrow ${eyebrow}`}>{title}</p>
      <p className="text-[12px] text-slate-600 mt-0.5">{sub}</p>
      <ul className="mt-2.5 space-y-1.5">
        {rows.map((r) => (
          <li key={r.userId} className="flex items-center gap-2.5">
            <CharacterAvatar characterKey={r.characterKey} size={24} />
            <span className="text-[12.5px] font-medium text-slate-900 truncate flex-1">{r.name}</span>
            <span className="text-[11.5px] text-slate-500">{r.score} pts</span>
            <a
              href={`/org/${orgId}/reports/performance?userId=${r.userId}`}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-slate-600 hover:text-slate-900 underline"
            >
              PDF
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'good' | 'warn' | 'bad'
}) {
  // Typography-led KPI — matches the dashboard's InlineStat. Big number,
  // quiet label inline, no surrounding box. Tone maps to the brand tokens
  // so the colour story stays consistent across surfaces.
  const color =
    tone === 'good' ? 'text-[var(--m-good)]' :
    tone === 'warn' ? 'text-amber-700' :
    tone === 'bad' ? 'text-rose-700' :
    'text-slate-900'
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`text-[22px] font-semibold tabular-nums tracking-tight ${color}`}>{value}</span>
      <span className="text-[12px] text-slate-500">{label}</span>
    </div>
  )
}

function scoreColor(score: number): string {
  if (score >= 75) return 'text-[var(--m-good)]'
  if (score >= 55) return 'text-[var(--m-info)]'
  if (score >= 35) return 'text-[var(--m-warn)]'
  return 'text-[var(--m-bad)]'
}
