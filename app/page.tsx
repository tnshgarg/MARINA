import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { auth, signIn } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { listMembershipsForCurrentUser, roleAtLeast } from '@/lib/auth/guards'
import { CHARACTERS } from '@/lib/characters/data'
import { CharacterAvatar } from '@/components/character-avatar'
import LandingClient from './landing-client'

export const dynamic = 'force-dynamic'

export default async function Home({ searchParams }: { searchParams: Promise<{ auth_error?: string }> }) {
  const sp = await searchParams
  const session = await auth()
  if (session?.appUserId) {
    const me = await db.query.users.findFirst({
      where: eq(schema.users.id, session.appUserId),
    })
    if (!me?.characterKey) redirect('/pick')
    const memberships = await listMembershipsForCurrentUser()
    if (memberships.length === 0) redirect('/onboarding')
    const first = memberships[0]
    if (roleAtLeast(first.role, 'manager')) {
      redirect(`/org/${first.orgId}`)
    }
    redirect('/dashboard')
  }

  async function githubSignIn() {
    'use server'
    await signIn('github', { redirectTo: '/' })
  }

  return (
    <main className="min-h-screen bg-white">
      {/* Decorative top blobs */}
      <div className="absolute inset-x-0 top-0 -z-10 overflow-hidden pointer-events-none">
        <div
          className="absolute left-1/2 -translate-x-1/2 -top-32 w-[1200px] h-[600px] rounded-full opacity-30 blur-3xl"
          style={{
            background:
              'radial-gradient(60% 50% at 50% 50%, rgba(99,102,241,0.35), transparent 70%), radial-gradient(40% 40% at 70% 60%, rgba(236,72,153,0.25), transparent 70%)',
          }}
        />
      </div>

      <Nav />

      <LandingClient
        authError={sp.auth_error ?? null}
        githubSignIn={githubSignIn}
        characters={CHARACTERS.slice(0, 10).map((c) => ({ key: c.key, name: c.name, color: c.color }))}
      />

      <How />
      <FeatureGrid />
      <ProductMock />
      <Pricing />
      <Trust />
      <FAQ />
      <FinalCTA githubSignIn={githubSignIn} />
      <Footer />
    </main>
  )
}

/* ------------------------- Nav ------------------------- */

function Nav() {
  return (
    <header className="sticky top-0 z-30 backdrop-blur bg-white/80 border-b border-slate-100">
      <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2.5">
          <Logo />
          <div className="leading-none">
            <p className="font-semibold text-[15px] tracking-tight text-slate-900">MARINA</p>
            <p className="text-[10px] text-slate-500 mt-0.5">AI Workforce Intelligence</p>
          </div>
        </a>
        <nav className="hidden md:flex items-center gap-7 text-[13px] text-slate-600">
          <a href="#features" className="hover:text-slate-900 transition">Features</a>
          <a href="#how" className="hover:text-slate-900 transition">How it works</a>
          <a href="#pricing" className="hover:text-slate-900 transition">Pricing</a>
          <a href="/security" className="hover:text-slate-900 transition">Security</a>
          <a href="/privacy" className="hover:text-slate-900 transition">Privacy</a>
        </nav>
        <a
          href="#cta"
          className="text-[13px] px-3.5 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition"
        >
          Start free →
        </a>
      </div>
    </header>
  )
}

/* ------------------------- How it works ------------------------- */

function How() {
  const steps = [
    {
      n: '01',
      title: 'Invite your team',
      body: 'Send an email invite. Members pick a hero, install the desktop agent in 60 seconds, and consent on-device.',
      color: 'from-indigo-500 to-violet-500',
    },
    {
      n: '02',
      title: 'They punch in for the day',
      body: 'Tracking only runs between punch-in and punch-out. Breaks pause it. AI cross-checks the end-of-shift summary.',
      color: 'from-emerald-500 to-teal-500',
    },
    {
      n: '03',
      title: 'You see the story',
      body: 'A timeline + AI narrative tells you what happened — meetings 3-4PM, coding 4-6PM, blocked after 6PM. Act with context.',
      color: 'from-pink-500 to-rose-500',
    },
  ]
  return (
    <section id="how" className="max-w-6xl mx-auto px-6 py-24">
      <div className="text-center mb-14">
        <p className="text-[12px] font-semibold uppercase tracking-widest text-indigo-600">How it works</p>
        <h2 className="mt-2 text-[34px] font-semibold tracking-tight text-slate-900">
          Three steps to seeing the truth
        </h2>
        <p className="mt-3 text-slate-600 max-w-2xl mx-auto">
          MARINA isn&apos;t surveillance. It&apos;s decision-support for managers who actually want to help.
        </p>
      </div>
      <div className="grid md:grid-cols-3 gap-6">
        {steps.map((s) => (
          <div key={s.n} className="relative rounded-2xl border border-slate-200 bg-white p-6 hover:shadow-lg hover:-translate-y-1 transition-all">
            <div className={`inline-flex w-12 h-12 rounded-xl bg-gradient-to-br ${s.color} text-white items-center justify-center text-[14px] font-semibold tracking-wider mb-4`}>
              {s.n}
            </div>
            <h3 className="text-[18px] font-semibold text-slate-900">{s.title}</h3>
            <p className="mt-2 text-[14px] text-slate-600 leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ------------------------- Feature grid ------------------------- */

function FeatureGrid() {
  const features = [
    {
      icon: '⏱',
      title: 'Punch in · Punch out',
      body: 'Mac and Windows agents that only track during work hours. AI scores the end-of-shift summary against actual activity.',
      tint: 'from-indigo-50 to-violet-50',
    },
    {
      icon: '🗓',
      title: 'Leaves & breaks, end-to-end',
      body: 'Sick / Casual / Earned / Maternity / Comp-off — all built in with India holiday calendar. Managers approve in one click.',
      tint: 'from-emerald-50 to-teal-50',
    },
    {
      icon: '✦',
      title: 'AI story narratives',
      body: 'A daily prose narrative + horizontal timeline. "Sneha was in meetings 10-12, coded the auth flow 12-3, took lunch at 3."',
      tint: 'from-pink-50 to-rose-50',
    },
    {
      icon: '🛡',
      title: 'Disclosed-randomized screenshots',
      body: '2-4 captures per active hour, with a visible flash. Auto-deleted after 48 hours. Only AI-derived labels stay.',
      tint: 'from-amber-50 to-yellow-50',
    },
    {
      icon: '⚡',
      title: 'GitHub-aware',
      body: 'Pulls commits, PRs, reviews so you know what shipped. Cross-references with focus time for honest output signal.',
      tint: 'from-sky-50 to-blue-50',
    },
    {
      icon: '🦸',
      title: 'Heroes (optional)',
      body: '10 pixel-art avatars built in — every operator picks one. Or flip to GitHub photos for a more boardroom feel.',
      tint: 'from-violet-50 to-purple-50',
    },
    {
      icon: '🔔',
      title: 'Slack + email alerts',
      body: 'Leave requested? Suspect punch-out? Long block? Your manager gets pinged where they already live.',
      tint: 'from-orange-50 to-red-50',
    },
    {
      icon: '🇮🇳',
      title: 'India-first',
      body: 'DPDP-compliant by design. GST-ready invoicing. Indian holiday calendar. Razorpay for INR billing.',
      tint: 'from-cyan-50 to-sky-50',
    },
    {
      icon: '🔐',
      title: 'Privacy-respecting',
      body: 'No keylogging. No file content. Off-clock = zero tracking. Audit logs on every privileged action.',
      tint: 'from-lime-50 to-green-50',
    },
  ]

  return (
    <section id="features" className="bg-slate-50 border-y border-slate-200">
      <div className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <p className="text-[12px] font-semibold uppercase tracking-widest text-indigo-600">Features</p>
          <h2 className="mt-2 text-[34px] font-semibold tracking-tight text-slate-900">
            Everything an honest manager actually needs
          </h2>
          <p className="mt-3 text-slate-600 max-w-2xl mx-auto">
            Not a HRMS. Not a spy tool. The thin layer of intelligence that sits on top of the work
            you&apos;re already doing.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <div
              key={f.title}
              className={`rounded-2xl border border-slate-200 bg-gradient-to-br ${f.tint} p-5 hover:shadow-md hover:-translate-y-0.5 transition-all`}
            >
              <div className="text-[28px] mb-3">{f.icon}</div>
              <h3 className="text-[15px] font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-1.5 text-[13px] text-slate-700 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------- Product mock ------------------------- */

function ProductMock() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-24">
      <div className="text-center mb-12">
        <p className="text-[12px] font-semibold uppercase tracking-widest text-indigo-600">The story</p>
        <h2 className="mt-2 text-[34px] font-semibold tracking-tight text-slate-900">
          One paragraph, one timeline, the whole day
        </h2>
        <p className="mt-3 text-slate-600 max-w-2xl mx-auto">
          Stop chasing standups for context. MARINA stitches screenshots, agent samples, GitHub
          events, and human-logged breaks into a single coherent narrative.
        </p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-indigo-50/40 to-pink-50/40 p-8 shadow-xl">
        {/* Mock browser chrome */}
        <div className="flex items-center gap-1.5 mb-5">
          <span className="w-3 h-3 rounded-full bg-rose-300" />
          <span className="w-3 h-3 rounded-full bg-amber-300" />
          <span className="w-3 h-3 rounded-full bg-emerald-300" />
          <span className="ml-3 text-[11px] text-slate-500 font-mono">marina.in/dashboard</span>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
              ✦
            </span>
            <div>
              <p className="text-[15px] font-semibold text-slate-900">Sneha&apos;s story · Today</p>
              <p className="text-[11px] text-slate-500">Generated 2 minutes ago · Groq · Llama 3.3</p>
            </div>
          </div>

          {/* Timeline */}
          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
            <span>10 AM</span><span>1 PM</span><span>4 PM</span><span>7 PM</span>
          </div>
          <div className="h-9 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 flex">
            <div className="h-full" style={{ width: '18%', background: '#6366f1' }} title="Meeting" />
            <div className="h-full" style={{ width: '6%', background: '#0ea5e9' }} title="Messages" />
            <div className="h-full" style={{ width: '28%', background: '#10b981' }} title="Coding" />
            <div className="h-full" style={{ width: '6%', background: '#f97316' }} title="Break" />
            <div className="h-full" style={{ width: '22%', background: '#10b981' }} title="Coding" />
            <div className="h-full" style={{ width: '8%', background: '#6366f1' }} title="Meeting" />
            <div className="h-full" style={{ width: '12%', background: '#a855f7' }} title="Reading" />
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <Tag color="#6366f1" label="Meeting" />
            <Tag color="#10b981" label="Coding" />
            <Tag color="#0ea5e9" label="Messages" />
            <Tag color="#f97316" label="Break" />
            <Tag color="#a855f7" label="Reading docs" />
          </div>

          <div className="mt-5 rounded-xl bg-gradient-to-br from-indigo-50 to-pink-50 border border-indigo-100 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700 mb-1.5">
              ✦ Narrative
            </p>
            <p className="text-[14px] leading-relaxed text-slate-800">
              Sneha started her day with a product sync from 10 AM to 11:30 AM, then jumped into VS Code for
              two hours shipping a fix to the auth flow (PR #482 merged). She took a 30-minute lunch break at
              1 PM, returned for another 2 hours of heads-down coding plus three commits to{' '}
              <span className="font-mono text-[12.5px]">payment-worker</span>, and ended the day reviewing
              Rahul&apos;s PR in Notion. Verification score: 92/100.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function Tag({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

/* ------------------------- Pricing ------------------------- */

function Pricing() {
  const plans = [
    {
      name: 'Free',
      price: '₹0',
      period: 'forever',
      blurb: 'For up to 5 users. Get started, prove the value.',
      features: [
        'Up to 5 operators',
        'Punch in/out + AI verify',
        'Daily AI story',
        'Mac + Windows agents',
        'Email support',
      ],
      cta: 'Start free',
      highlight: false,
    },
    {
      name: 'Team',
      price: '₹299',
      period: 'per user / month',
      blurb: 'For founders and small teams shipping fast.',
      features: [
        'Everything in Free',
        'Unlimited operators',
        'Slack notifications',
        'Org settings + roles',
        'India holiday calendar',
        'Audit log + DPDP exports',
        '24-hour support SLA',
      ],
      cta: 'Start free trial',
      highlight: true,
    },
    {
      name: 'Scale',
      price: '₹499',
      period: 'per user / month',
      blurb: 'When procurement starts asking questions.',
      features: [
        'Everything in Team',
        'SSO (Google / Microsoft)',
        'Custom roles + permissions',
        'India-region data residency',
        'DPA + security review',
        'Dedicated CSM',
      ],
      cta: 'Talk to us',
      highlight: false,
    },
  ]

  return (
    <section id="pricing" className="bg-slate-50 border-y border-slate-200">
      <div className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <p className="text-[12px] font-semibold uppercase tracking-widest text-indigo-600">Pricing</p>
          <h2 className="mt-2 text-[34px] font-semibold tracking-tight text-slate-900">
            Honest pricing, no per-seat surprises
          </h2>
          <p className="mt-3 text-slate-600 max-w-2xl mx-auto">
            Founder pricing locked for early customers. 17% off on annual prepay.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`rounded-2xl border p-6 bg-white transition-all hover:shadow-xl ${p.highlight ? 'border-indigo-300 shadow-lg ring-1 ring-indigo-200 scale-[1.02]' : 'border-slate-200'}`}
            >
              {p.highlight && (
                <p className="inline-block text-[10px] font-semibold uppercase tracking-wider text-white bg-gradient-to-r from-indigo-600 to-violet-600 px-2 py-0.5 rounded-full mb-3">
                  Most popular
                </p>
              )}
              <h3 className="text-[16px] font-semibold text-slate-900">{p.name}</h3>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-[40px] font-bold tracking-tight text-slate-900">{p.price}</span>
                <span className="text-[12px] text-slate-500">{p.period}</span>
              </div>
              <p className="mt-1.5 text-[13px] text-slate-600">{p.blurb}</p>
              <ul className="mt-5 space-y-2.5 text-[13px] text-slate-700">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <svg className="mt-0.5 flex-shrink-0" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth={3}>
                      <path d="M5 13l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href="#cta"
                className={`mt-6 inline-flex w-full justify-center px-4 py-2.5 rounded-lg text-[13px] font-medium transition ${p.highlight ? 'bg-slate-900 text-white hover:bg-slate-800' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}`}
              >
                {p.cta}
              </a>
            </div>
          ))}
        </div>
        <p className="text-center mt-8 text-[12px] text-slate-500">
          All prices in INR, exclusive of 18% GST. Razorpay autopay supported.
        </p>
      </div>
    </section>
  )
}

/* ------------------------- Trust strip ------------------------- */

function Trust() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-20">
      <div className="text-center mb-10">
        <p className="text-[12px] font-semibold uppercase tracking-widest text-indigo-600">Built on trust</p>
        <h2 className="mt-2 text-[28px] font-semibold tracking-tight text-slate-900">
          We take security like it&apos;s our day job
        </h2>
      </div>
      <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 text-center">
        <TrustItem icon="✅" title="DPDP Act 2023" sub="India compliant" />
        <TrustItem icon="🔄" title="SOC 2 in progress" sub="With Sprinto · Q4 2026" />
        <TrustItem icon="🇮🇳" title="India data residency" sub="On Scale tier" />
        <TrustItem icon="📜" title="DPA on request" sub="Templates at /dpa" />
      </div>
    </section>
  )
}

function TrustItem({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 hover:shadow-md transition-all">
      <p className="text-[24px]">{icon}</p>
      <p className="mt-1.5 text-[14px] font-medium text-slate-900">{title}</p>
      <p className="text-[12px] text-slate-500 mt-0.5">{sub}</p>
    </div>
  )
}

/* ------------------------- FAQ ------------------------- */

function FAQ() {
  const qs = [
    {
      q: 'Is this spyware?',
      a: 'No. We never read keystrokes, file contents, or unrelated screens. Tracking only runs between punch-in and punch-out, employees consent on-device, and pausing is a single click. Disclosed-randomized screenshots flash a visible indicator and are auto-deleted in 48 hours.',
    },
    {
      q: 'Do employees know they\'re being tracked?',
      a: 'Yes, explicitly. The agent shows a consent screen on install with full disclosure of what\'s collected, when, and how to pause. We provide a customer-facing Employee Acceptable Use Policy template you give to your team before deployment.',
    },
    {
      q: 'What\'s the AI actually doing?',
      a: 'Two things. (1) Verifying end-of-shift work summaries against actual activity — commits, PRs, focus time, breaks — to give a 0-100 honesty score. (2) Generating a prose narrative + timeline of the day so managers see context at a glance, not a wall of data.',
    },
    {
      q: 'Mac only?',
      a: 'Mac (Apple Silicon + Intel) and Windows. Linux is on the roadmap if customers ask.',
    },
    {
      q: 'What about regulated industries?',
      a: 'Today we serve product startups and dev agencies. BFSI/healthcare/government can talk to us — we\'ll be SOC 2 Type 1 by Q4 2026 and offer India-region data residency on the Scale tier.',
    },
    {
      q: 'Can I export or delete my data?',
      a: 'Yes — both, instantly, under DPDP Act § 11. Settings → Danger zone has Export (full JSON dump) and Delete (cascade erasure). No support ticket required.',
    },
  ]
  return (
    <section className="bg-slate-50 border-y border-slate-200">
      <div className="max-w-3xl mx-auto px-6 py-24">
        <div className="text-center mb-12">
          <p className="text-[12px] font-semibold uppercase tracking-widest text-indigo-600">FAQ</p>
          <h2 className="mt-2 text-[34px] font-semibold tracking-tight text-slate-900">
            Common questions
          </h2>
        </div>
        <div className="space-y-3">
          {qs.map((qa) => (
            <details key={qa.q} className="group rounded-xl border border-slate-200 bg-white p-5 hover:shadow-sm transition-all">
              <summary className="cursor-pointer flex items-center justify-between gap-4 text-[15px] font-medium text-slate-900">
                {qa.q}
                <span className="text-slate-400 group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <p className="mt-3 text-[14px] text-slate-600 leading-relaxed">{qa.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------- Final CTA ------------------------- */

function FinalCTA({ githubSignIn }: { githubSignIn: () => Promise<void> }) {
  return (
    <section id="cta" className="relative overflow-hidden bg-slate-900 text-white">
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          background:
            'radial-gradient(60% 80% at 50% 0%, rgba(99,102,241,0.5), transparent 70%), radial-gradient(40% 60% at 70% 100%, rgba(236,72,153,0.4), transparent 70%)',
        }}
      />
      <div className="relative max-w-3xl mx-auto px-6 py-24 text-center">
        <p className="text-[12px] font-semibold uppercase tracking-widest text-indigo-300">Ready when you are</p>
        <h2 className="mt-3 text-[40px] font-semibold tracking-tight">
          Stop guessing.<br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-pink-300 to-amber-300">Start seeing.</span>
        </h2>
        <p className="mt-4 text-slate-300 max-w-xl mx-auto text-[15px]">
          Free for the first 5 operators forever. ₹0 trial for 30 days on every paid plan.
          No credit card needed.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          <form action={githubSignIn}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-slate-900 hover:bg-slate-100 text-[14px] font-medium transition"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.1c-3.2.7-3.88-1.36-3.88-1.36-.52-1.31-1.28-1.66-1.28-1.66-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18A11 11 0 0 1 12 6.8c.98.01 1.97.13 2.89.39 2.2-1.49 3.17-1.18 3.17-1.18.64 1.58.24 2.75.12 3.04.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.07.78 2.15v3.19c0 .31.21.67.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
              </svg>
              Continue with GitHub
            </button>
          </form>
        </div>

        <p className="mt-6 text-[11px] text-slate-400">
          Or use email above — works for non-tech teammates. DPDP-compliant. Built in India 🇮🇳
        </p>
      </div>
    </section>
  )
}

/* ------------------------- Footer ------------------------- */

function Footer() {
  return (
    <footer className="border-t border-slate-100 py-12">
      <div className="max-w-6xl mx-auto px-6 grid sm:grid-cols-2 md:grid-cols-4 gap-8 text-[13px]">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Logo />
            <span className="font-semibold text-slate-900">MARINA</span>
          </div>
          <p className="text-slate-500 leading-relaxed">
            AI Workforce Intelligence built in India 🇮🇳<br />
            <span className="text-slate-400">Project MARINA Private Limited</span>
          </p>
        </div>
        <div>
          <p className="font-medium text-slate-900 mb-3">Product</p>
          <ul className="space-y-1.5 text-slate-600">
            <li><a href="#features" className="hover:text-indigo-600">Features</a></li>
            <li><a href="#how" className="hover:text-indigo-600">How it works</a></li>
            <li><a href="#pricing" className="hover:text-indigo-600">Pricing</a></li>
          </ul>
        </div>
        <div>
          <p className="font-medium text-slate-900 mb-3">Legal</p>
          <ul className="space-y-1.5 text-slate-600">
            <li><a href="/privacy" className="hover:text-indigo-600">Privacy</a></li>
            <li><a href="/terms" className="hover:text-indigo-600">Terms</a></li>
            <li><a href="/dpa" className="hover:text-indigo-600">DPA</a></li>
            <li><a href="/security" className="hover:text-indigo-600">Security</a></li>
          </ul>
        </div>
        <div>
          <p className="font-medium text-slate-900 mb-3">Contact</p>
          <ul className="space-y-1.5 text-slate-600">
            <li><a href="mailto:hello@marina.in" className="hover:text-indigo-600">hello@marina.in</a></li>
            <li><a href="mailto:security@marina.in" className="hover:text-indigo-600">security@marina.in</a></li>
            <li><a href="mailto:dpo@marina.in" className="hover:text-indigo-600">dpo@marina.in</a></li>
          </ul>
        </div>
      </div>
      <p className="text-center text-[11px] text-slate-400 mt-10">
        © 2026 Project MARINA Private Limited. All rights reserved.
      </p>
    </footer>
  )
}

/* ------------------------- Bits ------------------------- */

function Logo() {
  return (
    <svg width={28} height={28} viewBox="0 0 28 28" fill="none" aria-hidden>
      <path d="M14 3 L24 24 H4 Z" fill="#6366f1" />
      <circle cx={14} cy={18} r={3} fill="#fff" />
    </svg>
  )
}

// Keep CharacterAvatar import "used" so tree-shaking doesn't strip it before client bundle
void CharacterAvatar
