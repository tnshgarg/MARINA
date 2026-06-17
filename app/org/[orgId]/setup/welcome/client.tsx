'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MarinaMark } from '@/components/marina-mark'

/**
 * Marina-hosted welcome glance. A calm, skippable 4-step intro that mirrors the
 * desktop agent's onboarding aesthetic (drifting sage/clay orbs, staggered
 * fade-up, progress dots) so the web and desktop first-runs feel like siblings.
 */
export default function WelcomeClient({
  orgId,
  orgName,
  firstName,
}: {
  orgId: number
  orgName: string
  firstName: string
}) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const TOTAL = 4

  const toInvite = () => router.push(`/org/${orgId}/setup/invite`)
  const toDashboard = () => router.push(`/org/${orgId}`)
  const next = () => setStep((s) => Math.min(TOTAL - 1, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  return (
    <main className="relative min-h-screen overflow-hidden paper flex flex-col">
      {/* Drifting brand orbs — the calm, alive backdrop. */}
      <div aria-hidden className="wf-orb wf-orb-sage" />
      <div aria-hidden className="wf-orb wf-orb-clay" />

      {/* Top bar: brand + skip */}
      <header className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-5">
        <div className="flex items-center gap-2.5">
          <MarinaMark size={26} label="Marina" />
          <span className="font-display text-[18px] tracking-tight text-[var(--m-ink)]">MARINA</span>
        </div>
        <button
          type="button"
          onClick={toDashboard}
          className="text-[13px] text-[var(--m-ink-3)] hover:text-[var(--m-ink)] transition"
        >
          Skip for now →
        </button>
      </header>

      {/* Stage */}
      <section className="relative z-10 flex-1 flex items-center justify-center px-6">
        <div key={step} className="w-full max-w-2xl wf-stage">
          {step === 0 && <StepWelcome firstName={firstName} orgName={orgName} />}
          {step === 1 && <StepWhat />}
          {step === 2 && <StepHow />}
          {step === 3 && <StepReady firstName={firstName} />}
        </div>
      </section>

      {/* Footer: progress + actions */}
      <footer className="relative z-10 px-6 sm:px-10 pb-9 pt-2">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <span className="sr-only" aria-live="polite">
            Step {step + 1} of {TOTAL}
          </span>
          <div className="flex items-center gap-1.5" aria-hidden>
            {Array.from({ length: TOTAL }).map((_, i) => (
              <span
                key={i}
                className="h-1 rounded-full transition-all duration-300"
                style={{
                  width: i === step ? 26 : 16,
                  background: i <= step ? 'var(--m-accent)' : 'var(--m-border)',
                }}
              />
            ))}
          </div>
          <div className="flex-1" />
          {step > 0 && (
            <button
              type="button"
              onClick={back}
              className="text-[13px] text-[var(--m-ink-3)] hover:text-[var(--m-ink)] transition"
            >
              ← Back
            </button>
          )}
          {step < TOTAL - 1 ? (
            <button type="button" onClick={next} className="btn-sage">
              {step === 0 ? 'Show me →' : 'Continue →'}
            </button>
          ) : (
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={toDashboard}
                className="text-[13px] text-[var(--m-ink-3)] hover:text-[var(--m-ink)] transition"
              >
                I&apos;ll explore first
              </button>
              <button type="button" onClick={toInvite} className="btn-sage">
                Invite my team →
              </button>
            </div>
          )}
        </div>
      </footer>

      <style jsx>{`
        .wf-orb {
          position: fixed;
          border-radius: 9999px;
          filter: blur(64px);
          opacity: 0.55;
          z-index: 0;
          pointer-events: none;
        }
        .wf-orb-sage {
          width: 520px;
          height: 520px;
          top: -180px;
          left: -140px;
          background: radial-gradient(circle at 30% 30%, #cfe0d2, transparent 70%);
          animation: wf-drift-a 24s ease-in-out infinite;
        }
        .wf-orb-clay {
          width: 460px;
          height: 460px;
          bottom: -200px;
          right: -140px;
          background: radial-gradient(circle at 60% 40%, #f0d6c4, transparent 70%);
          animation: wf-drift-b 28s ease-in-out infinite;
        }
        @keyframes wf-drift-a {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(44px, 32px) scale(1.08); }
        }
        @keyframes wf-drift-b {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-40px, -28px) scale(1.1); }
        }
        .wf-stage :global(.wf-in) {
          animation: wf-rise 0.5s cubic-bezier(0.16, 0.84, 0.34, 1) both;
        }
        @keyframes wf-rise {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .wf-orb { animation: none; }
          .wf-stage :global(.wf-in) { animation: none; }
        }
      `}</style>
    </main>
  )
}

function delay(i: number): React.CSSProperties {
  return { animationDelay: `${i * 70 + 40}ms` }
}

function StepWelcome({ firstName, orgName }: { firstName: string; orgName: string }) {
  return (
    <div className="text-center flex flex-col items-center">
      <div className="wf-in" style={delay(0)}>
        <MarinaMark size={92} label="Marina" />
      </div>
      <p className="wf-in mt-7 text-[12px] uppercase tracking-[0.18em] text-[var(--m-accent)] font-semibold" style={delay(1)}>
        Welcome aboard
      </p>
      <h1 className="wf-in mt-3 font-display text-[40px] md:text-[52px] leading-[1.04] tracking-tight text-[var(--m-ink)]" style={delay(2)}>
        MARINA is ready, {firstName}.
      </h1>
      <p className="wf-in mt-5 max-w-lg text-[16px] leading-relaxed text-[var(--m-ink-2)]" style={delay(3)}>
        <strong className="text-[var(--m-ink)]">{orgName}</strong> is live. I&apos;m Marina — your
        team&apos;s chief of staff. Give me two minutes and I&apos;ll show you exactly what I&apos;ll
        take off your plate.
      </p>
    </div>
  )
}

function StepWhat() {
  const cards: Array<{ title: string; body: string }> = [
    { title: 'A brief every morning', body: 'I read your team’s day and tell you what needs you — no standup required.' },
    { title: 'Blockers, cleared fast', body: 'The moment someone’s stuck, I surface it. Unblock them in one click.' },
    { title: 'Ask me anything', body: '“Who’s overloaded?” “What shipped this week?” Grounded answers in seconds.' },
    { title: 'Standups in 9 minutes', body: 'Yesterday, today, blockers — pre-filled. Arrow keys to run the room.' },
    { title: 'Attendance, automatic', body: 'Punch-ins, leaves, holidays — tracked for you. Zero spreadsheets.' },
    { title: 'Reviews from evidence', body: 'Digests and 1:1 prep, written from real work — not from memory.' },
  ]
  return (
    <div>
      <p className="wf-in text-[12px] uppercase tracking-[0.18em] text-[var(--m-accent)] font-semibold" style={delay(0)}>
        What I do for you
      </p>
      <h2 className="wf-in mt-2 font-display text-[30px] md:text-[38px] leading-tight tracking-tight text-[var(--m-ink)]" style={delay(1)}>
        Six jobs off your plate, day one.
      </h2>
      <div className="mt-6 grid sm:grid-cols-2 gap-3">
        {cards.map((c, i) => (
          <div
            key={c.title}
            className="wf-in rounded-2xl border border-[var(--m-border)] bg-white/75 backdrop-blur-sm p-4"
            style={delay(i + 2)}
          >
            <div className="flex items-start gap-3">
              <MarinaMark size={22} className="mt-0.5" label="" />
              <div>
                <h3 className="text-[14px] font-semibold text-[var(--m-ink)]">{c.title}</h3>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--m-ink-3)]">{c.body}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StepHow() {
  const steps: Array<{ n: string; title: string; body: string }> = [
    { n: '1', title: 'Your team installs a tiny agent', body: 'A lightweight Mac/Windows app that lives in the menu bar. Two-minute setup, guided.' },
    { n: '2', title: 'I turn real work into signal', body: 'Commits, focus time, meetings, deliverables — quietly summarised. Never keystrokes or screenshots unless your team opts in.' },
    { n: '3', title: 'You get clarity, not meetings', body: 'A morning brief, live blockers, and answers on demand. The status meeting just disappears.' },
  ]
  return (
    <div>
      <p className="wf-in text-[12px] uppercase tracking-[0.18em] text-[var(--m-accent)] font-semibold" style={delay(0)}>
        How it works
      </p>
      <h2 className="wf-in mt-2 font-display text-[30px] md:text-[38px] leading-tight tracking-tight text-[var(--m-ink)]" style={delay(1)}>
        Three steps, then it runs itself.
      </h2>
      <div className="mt-6 space-y-3">
        {steps.map((s, i) => (
          <div
            key={s.n}
            className="wf-in flex items-start gap-4 rounded-2xl border border-[var(--m-border)] bg-white/75 backdrop-blur-sm p-4"
            style={delay(i + 2)}
          >
            <span className="shrink-0 w-8 h-8 rounded-full bg-[var(--m-accent-soft)] text-[var(--m-accent-2)] font-semibold inline-flex items-center justify-center text-[14px]">
              {s.n}
            </span>
            <div>
              <h3 className="text-[14.5px] font-semibold text-[var(--m-ink)]">{s.title}</h3>
              <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--m-ink-2)]">{s.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StepReady({ firstName }: { firstName: string }) {
  return (
    <div className="text-center flex flex-col items-center">
      <div className="wf-in" style={delay(0)}>
        <MarinaMark size={76} label="Marina" />
      </div>
      <h2 className="wf-in mt-6 font-display text-[34px] md:text-[44px] leading-tight tracking-tight text-[var(--m-ink)]" style={delay(1)}>
        Let&apos;s bring your team in, {firstName}.
      </h2>
      <p className="wf-in mt-4 max-w-md text-[15px] leading-relaxed text-[var(--m-ink-2)]" style={delay(2)}>
        Invite a few teammates and I&apos;ll start turning their work into a clear picture for you.
        You can always do this later from the Members page.
      </p>
    </div>
  )
}
