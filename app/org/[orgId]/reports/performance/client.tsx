'use client'

import type { PerformanceReport } from '@/lib/reports/performance'

/**
 * Printable performance review. The whole layout is designed for ⌘P → Save
 * as PDF: white background, no chrome, single-column print flow, big
 * generous margins. The "Download as PDF" button just calls `window.print()`
 * — every modern browser produces a clean PDF from this.
 */
export default function PerformanceReportClient({ report }: { report: PerformanceReport }) {
  return (
    <>
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .report-page { padding: 0 !important; box-shadow: none !important; border: 0 !important; }
        }
        @page {
          size: A4;
          margin: 18mm;
        }
      `}</style>

      {/* Toolbar — hidden in print */}
      <div className="no-print sticky top-0 z-10 bg-white border-b border-[var(--m-border)] px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-[var(--m-ink-3)]">
            Performance review · ready to share
          </p>
          <p className="text-[13px] text-[var(--m-ink)]">
            {report.employee.name} ·{' '}
            <span className="text-[var(--m-ink-3)]">
              {report.range.start} → {report.range.end}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3.5 py-1.5 rounded-md bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white text-[12.5px] font-medium transition"
          >
            Download as PDF
          </button>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="px-3 py-1.5 rounded-md bg-white border border-[var(--m-border)] hover:bg-[var(--m-bg-soft)] text-[var(--m-ink-2)] text-[12.5px] font-medium transition"
          >
            Back
          </button>
        </div>
      </div>

      <div className="bg-[var(--m-bg)] min-h-screen py-6">
        <article className="report-page max-w-[820px] mx-auto bg-white border border-[var(--m-border)] rounded-md shadow-sm p-12 text-[var(--m-ink)]">
          {/* Letterhead */}
          <div className="flex items-baseline justify-between gap-4 pb-5 mb-6 border-b border-[var(--m-border)]">
            <div>
              <p className="font-display text-[28px] leading-tight text-[var(--m-ink)]">
                Performance review
              </p>
              <p className="text-[13px] text-[var(--m-ink-3)] mt-1">
                {report.org.name} · prepared {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-[18px] text-[var(--m-accent)]">MARINA</p>
              <p className="text-[11px] text-[var(--m-ink-3)]">AI Chief of Staff</p>
            </div>
          </div>

          {/* Employee block */}
          <section className="mb-6">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-[var(--m-ink-3)] mb-1.5">
              Employee
            </p>
            <p className="font-display text-[22px] leading-tight">{report.employee.name}</p>
            <p className="text-[13px] text-[var(--m-ink-2)] mt-0.5">
              {report.employee.jobTitle ?? '—'} ·{' '}
              <span className="capitalize">{report.employee.discipline}</span>
              {report.employee.email && (
                <>
                  {' · '}
                  <span className="text-[var(--m-ink-3)]">{report.employee.email}</span>
                </>
              )}
              {report.employee.joinedOn && (
                <>
                  {' · joined '}
                  {new Date(report.employee.joinedOn).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                </>
              )}
            </p>
          </section>

          {/* Period & narrative */}
          <section className="mb-7">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-[var(--m-ink-3)] mb-1.5">
              Period
            </p>
            <p className="text-[13.5px] text-[var(--m-ink)]">
              {fmtRange(report.range.start, report.range.end)} ·{' '}
              <span className="text-[var(--m-ink-3)]">{report.range.workingDays} working days</span>
            </p>
            {/* Summary line — body sans-serif to match the rest of the
                product. The italic display serif was performing as a
                pull-quote which clashed with the "professional report"
                voice the page is going for. */}
            <p className="mt-4 text-[14px] leading-relaxed text-[var(--m-ink)]">
              {report.narrative.summary}
            </p>
          </section>

          {/* Stats grid */}
          <section className="mb-7">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-[var(--m-ink-3)] mb-2.5">
              By the numbers
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <Stat value={`${report.totals.hoursWorked}h`} label="Hours worked" />
              <Stat value={`${report.totals.focusHours}h`} label="Focus time" tone="good" />
              <Stat value={`${report.totals.productivity}%`} label="Productivity" tone={report.totals.productivity >= 65 ? 'good' : report.totals.productivity >= 45 ? 'warn' : 'bad'} />
              <Stat value={String(report.totals.deliverablesShipped)} label="Shipped" tone="good" />
              <Stat value={String(report.totals.shifts)} label="Shifts" />
              <Stat value={`${report.totals.onTimeRate}%`} label="On time" tone={report.totals.onTimeRate >= 80 ? 'good' : 'warn'} />
              <Stat value={String(report.totals.meetingsAttended)} label="Meetings" />
              <Stat value={String(report.totals.blockersFaced)} label="Blockers" tone={report.totals.blockersFaced >= 3 ? 'bad' : undefined} />
            </div>
          </section>

          {/* Strengths */}
          {report.narrative.strengths.length > 0 && (
            <section className="mb-6">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-[var(--m-good)] mb-2">
                Strengths
              </p>
              <ul className="space-y-1.5">
                {report.narrative.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--m-ink)]">
                    <span className="mt-1.5 inline-block w-1.5 h-1.5 rounded-full bg-[var(--m-good)]" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Concerns */}
          {report.narrative.concerns.length > 0 && (
            <section className="mb-6">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-[var(--m-bad)] mb-2">
                Areas of concern
              </p>
              <ul className="space-y-1.5">
                {report.narrative.concerns.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--m-ink)]">
                    <span className="mt-1.5 inline-block w-1.5 h-1.5 rounded-full bg-[var(--m-bad)]" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Highlights */}
          {report.highlights.length > 0 && (
            <section className="mb-6 break-inside-avoid">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-[var(--m-ink-3)] mb-2">
                Top deliverables this period
              </p>
              <table className="w-full text-[12.5px]">
                <tbody>
                  {report.highlights.map((h, i) => (
                    <tr key={i} className="border-b border-[var(--m-border-soft)] last:border-0">
                      <td className="py-1.5 pr-3 text-[var(--m-ink-3)] tabular-nums w-24">{h.date}</td>
                      <td className="py-1.5 text-[var(--m-ink)]">{h.title}</td>
                      {h.kind && <td className="py-1.5 pl-2 text-[var(--m-ink-4)] text-right">{h.kind}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Blockers detail */}
          {report.blockers.length > 0 && (
            <section className="mb-6 break-inside-avoid">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-[var(--m-ink-3)] mb-2">
                Blockers this period
              </p>
              <ul className="space-y-1.5">
                {report.blockers.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12.5px] text-[var(--m-ink-2)]">
                    <span className="tabular-nums w-24 shrink-0 text-[var(--m-ink-3)]">{b.date}</span>
                    <span className="text-[var(--m-ink-3)] w-14 shrink-0 tabular-nums">{Math.round(b.minutes / 60 * 10) / 10}h</span>
                    <span>{b.reason}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Recommendation */}
          <section className="mt-8 pt-5 border-t border-[var(--m-border)]">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-[var(--m-ink-3)] mb-1.5">
              Manager recommendation
            </p>
            <p className="text-[15px] leading-snug text-[var(--m-ink)]">
              {report.narrative.recommendation}
            </p>
            <p className="mt-6 text-[11px] text-[var(--m-ink-4)]">
              Generated by MARINA · {new Date().toLocaleString('en-IN')} · This report combines
              shift, deliverable, blocker, focus and meeting signals from the selected window.
              AI narrative is grounded on the metrics shown above and contains no other data.
            </p>
          </section>
        </article>
      </div>
    </>
  )
}

function Stat({
  value,
  label,
  tone,
}: {
  value: string
  label: string
  tone?: 'good' | 'warn' | 'bad'
}) {
  const color =
    tone === 'good' ? 'text-[var(--m-good)]' :
    tone === 'warn' ? 'text-[var(--m-warn)]' :
    tone === 'bad' ? 'text-[var(--m-bad)]' :
    'text-[var(--m-ink)]'
  return (
    <div className="rounded-md border border-[var(--m-border)] px-3 py-2.5">
      <p className={`text-[22px] font-semibold leading-none tabular-nums tracking-tight ${color}`}>{value}</p>
      <p className="mt-1.5 text-[10.5px] uppercase tracking-wider font-medium text-[var(--m-ink-3)]">{label}</p>
    </div>
  )
}

function fmtRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  const e = new Date(end + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${s} → ${e}`
}
