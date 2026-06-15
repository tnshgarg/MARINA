import Link from 'next/link'
import { DemoForm } from './demo-form'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Book a demo · MARINA',
  description:
    'See how MARINA gives engineering managers 5+ hours a week back. 15-minute personalised walkthrough.',
}

/**
 * Landing-page demo CTA destination. Replaces the previous `mailto:` link
 * — those silently failed on browsers without a configured mail handler,
 * which on most laptops is most of them.
 *
 * The page is intentionally minimal: a single column with proof on the
 * left and a real form on the right. Conversion-optimised — no nav, no
 * footer noise, one clear next action.
 */
export default function DemoPage() {
  return (
    <main className="paper min-h-screen text-[var(--m-ink)]">
      <header className="border-b border-[var(--m-border)]/60">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="font-display text-[18px] tracking-tight text-[var(--m-ink)]">MARINA</span>
          </Link>
          <Link
            href="/#cta"
            className="text-[13px] text-[var(--m-ink-2)] hover:text-[var(--m-ink)]"
          >
            Skip — start free →
          </Link>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 py-16 md:py-24">
        <div className="grid lg:grid-cols-2 gap-14 lg:gap-20 items-start">
          {/* Left rail — proof + outcomes */}
          <div>
            <p className="text-[11px] tracking-[0.18em] uppercase text-[var(--m-accent)] font-medium mb-4">
              Personalised 15-min demo
            </p>
            <h1 className="font-display text-[40px] md:text-[56px] leading-[1.02] tracking-tight">
              See your team{' '}
              <span className="italic brand-gradient-text">on autopilot.</span>
            </h1>
            <p className="mt-5 text-[16px] text-[var(--m-ink-2)] leading-relaxed max-w-md">
              We&apos;ll walk through MARINA with your data &mdash; not a sandbox.
              You&apos;ll leave knowing exactly how many hours it saves you a week.
            </p>

            <ul className="mt-8 space-y-3.5 text-[14.5px] text-[var(--m-ink)]">
              <ProofRow>15 minutes. On Zoom or Google Meet.</ProofRow>
              <ProofRow>We connect to a sample of your GitHub + calendar live.</ProofRow>
              <ProofRow>You see your team&apos;s real blockers, real shifts, real risk.</ProofRow>
              <ProofRow>No sales script. No CRM follow-up spam.</ProofRow>
            </ul>

            <div className="mt-10 p-5 rounded-2xl bg-[var(--m-bg-soft)]/60 border border-[var(--m-border)]/70">
              <p className="text-[11px] uppercase tracking-wider text-[var(--m-ink-4)] font-semibold mb-2">
                What managers tell us after the demo
              </p>
              <p className="font-display text-[19px] text-[var(--m-ink)] leading-snug italic">
                &ldquo;I cancelled two of my three weekly standups the day I signed up.&rdquo;
              </p>
              <p className="mt-2 text-[12.5px] text-[var(--m-ink-3)]">
                &mdash; EM, 14-person platform team
              </p>
            </div>
          </div>

          {/* Right rail — the form */}
          <div className="lg:sticky lg:top-8">
            <div className="rounded-2xl bg-white border border-[var(--m-border)] shadow-[var(--m-shadow-xl)] p-7 md:p-8">
              <h2 className="font-display text-[24px] leading-tight">
                Book your slot
              </h2>
              <p className="mt-1.5 text-[13px] text-[var(--m-ink-3)]">
                Tanish (founder) usually replies within 6 hours.
              </p>
              <div className="mt-6">
                <DemoForm />
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--m-border)] mt-8">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between text-[12px] text-[var(--m-ink-4)]">
          <p>© 2026 Project MARINA Private Limited</p>
          <div className="flex gap-5">
            <Link href="/privacy" className="hover:text-[var(--m-ink-2)]">Privacy</Link>
            <Link href="/security" className="hover:text-[var(--m-ink-2)]">Security</Link>
          </div>
        </div>
      </footer>
    </main>
  )
}

function ProofRow({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-1 inline-flex w-4 h-4 shrink-0 items-center justify-center rounded-full bg-[var(--m-accent-soft)] text-[var(--m-accent-2)]">
        <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
          <path d="M5 13l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  )
}
