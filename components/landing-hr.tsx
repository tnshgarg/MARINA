import { Reveal } from '@/components/reveal'

/**
 * "Built for HR, too" — the people-ops half of Marina. The manager sections sell
 * visibility; this one sells the HR painkiller: never miss a celebration, leave
 * and attendance on autopilot, recognition by default, burnout caught early.
 */
const FEATURES = [
  {
    title: 'Never miss a moment',
    body: 'Birthdays, work anniversaries and 1:1s — Marina remembers every one, reminds the team, and posts the celebration to your channel automatically. No more “we forgot Priya’s anniversary”.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
        <path d="M4 11h16v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8Z" strokeLinejoin="round" />
        <path d="M4 11l2-4h12l2 4M12 7V4M9 4.5l3 2.5 3-2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Leave & attendance on autopilot',
    body: 'Requests, approvals, balances and attendance fixes — handled in the flow of work, in Slack or the web. No spreadsheets, no chasing sign-off, no month-end reconciliation.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
        <rect x="3.5" y="5" width="17" height="15" rx="2" />
        <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3M8.5 14l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Recognition that sticks',
    body: 'Kudos in one tap — posted where the whole team sees it. Appreciation becomes a habit, not an afterthought, and your culture gets a visible heartbeat.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
        <path d="M12 4.5l2.2 4.5 5 .7-3.6 3.5.85 4.95L12 20.3l-4.45 2.35.85-4.95L4.8 9.7l5-.7L12 4.5Z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Catch burnout early',
    body: 'Marina flags overwork and quiet disengagement — the long hours, the missed breaks, the fading activity — before they turn into a resignation you didn’t see coming.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
        <path d="M3 13h3l2.5-6 3 12 2.5-6H21" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
]

export function LandingHr() {
  return (
    <section id="for-hr" className="relative py-20 sm:py-28 bg-[var(--m-bg-soft)]">
      <div className="max-w-5xl mx-auto px-6">
        <Reveal>
          <p className="app-eyebrow text-center">Built for HR, too</p>
          <h2 className="font-display text-[34px] sm:text-[44px] leading-[1.05] tracking-tight text-[var(--m-ink)] text-center mt-2">
            The people work, taken care of
          </h2>
          <p className="text-center text-[15px] text-[var(--m-ink-2)] mt-3 max-w-2xl mx-auto leading-relaxed">
            Marina isn’t just a manager’s tool. It quietly runs the people-ops that keep a team happy and present — so
            HR spends its time on people, not paperwork.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 80}>
              <div className="h-full rounded-2xl border border-[var(--m-border)] bg-white p-6 lift-on-hover">
                <div className="w-11 h-11 rounded-xl bg-[var(--m-accent-soft)] text-[var(--m-accent)] flex items-center justify-center [&>svg]:w-5 [&>svg]:h-5">
                  {f.icon}
                </div>
                <p className="mt-4 text-[16.5px] font-semibold text-[var(--m-ink)]">{f.title}</p>
                <p className="mt-1.5 text-[13.5px] text-[var(--m-ink-2)] leading-relaxed">{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
