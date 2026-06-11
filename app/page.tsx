import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import { auth, signIn } from '@/auth'
import { db, schema } from '@/lib/db/client'
import { listMembershipsForCurrentUser, roleAtLeast } from '@/lib/auth/guards'
import { CHARACTERS } from '@/lib/characters/data'
import { CountUp, Reveal } from '@/components/reveal'
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

    const jar = await cookies()
    const pendingInvite = jar.get('marina_pending_invite')?.value
    if (pendingInvite) redirect(`/invite/${pendingInvite}`)

    const memberships = await listMembershipsForCurrentUser()
    if (memberships.length === 0) redirect('/onboarding')
    const first = memberships[0]
    if (roleAtLeast(first.role, 'manager')) redirect(`/org/${first.orgId}`)
    redirect('/dashboard')
  }

  async function githubSignIn() {
    'use server'
    await signIn('github', { redirectTo: '/' })
  }

  return (
    <main className="relative isolate min-h-screen paper text-[var(--m-ink)] overflow-x-hidden">
      {/* Subtle ambient blobs — sage + clay, very low opacity. Placed inside
          the main's stacking context so negative z-index sits behind content
          but above the cream page background. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 overflow-hidden pointer-events-none h-[1000px]"
      >
        <div
          className="absolute left-1/2 -translate-x-1/2 -top-40 w-[1400px] h-[700px] rounded-full opacity-60 blur-3xl"
          style={{
            background:
              'radial-gradient(40% 40% at 30% 50%, rgba(63,107,84,0.22), transparent 70%), radial-gradient(40% 40% at 70% 30%, rgba(196,123,86,0.18), transparent 70%), radial-gradient(40% 40% at 60% 80%, rgba(193,154,77,0.12), transparent 70%)',
          }}
        />
      </div>

      <Nav />

      <Hero
        sp={sp}
        githubSignIn={githubSignIn}
        characters={CHARACTERS.slice(0, 8).map((c) => ({ key: c.key, name: c.name, color: c.color }))}
      />

      <LogosStrip />
      <ValueProps />
      <ProductSection />
      <Workflows />
      <Testimonials />
      <Integrations />
      <Pricing />
      <ResourceCards />
      <FinalCTA githubSignIn={githubSignIn} />
      <Footer />
    </main>
  )
}

/* ============================ NAV ============================ */

function Nav() {
  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-[var(--m-bg)]/75 border-b border-[var(--m-border)]/50">
      <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between gap-6">
        <a href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="font-display text-[19px] leading-none text-[var(--m-ink)] tracking-tight">
            MARINA
          </span>
        </a>
        <nav className="hidden md:flex items-center gap-7 text-[13.5px] text-[var(--m-ink-2)]">
          <a href="#product" className="hover:text-[var(--m-ink)] transition-colors">Product</a>
          <a href="#workflows" className="hover:text-[var(--m-ink)] transition-colors">Workflows</a>
          <a href="#pricing" className="hover:text-[var(--m-ink)] transition-colors">Pricing</a>
          <a href="/security" className="hover:text-[var(--m-ink)] transition-colors">Security</a>
        </nav>
        <div className="flex items-center gap-2">
          <a
            href="#cta"
            className="hidden sm:inline-flex text-[13px] text-[var(--m-ink-2)] hover:text-[var(--m-ink)] px-3 py-1.5 transition-colors"
          >
            Sign in
          </a>
          <a href="#cta" className="btn-primary">Request a demo</a>
        </div>
      </div>
    </header>
  )
}

/* ============================ HERO ============================ */

function Hero({
  sp,
  githubSignIn,
  characters,
}: {
  sp: { auth_error?: string }
  githubSignIn: () => Promise<void>
  characters: Array<{ key: string; name: string; color: string }>
}) {
  return (
    <section className="relative max-w-7xl mx-auto px-6 pt-16 pb-20 md:pt-24 md:pb-28">
      <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">
        <div className="lg:col-span-7">
          <Reveal>
            <p className="inline-flex items-center gap-2 text-[12px] tracking-wide uppercase text-[var(--m-ink-3)] mb-5">
              <span className="relative inline-flex">
                <span className="absolute inset-0 rounded-full bg-[var(--m-accent)]/40 m-slow-pulse" />
                <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-[var(--m-accent)]" />
              </span>
              For modern remote teams
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="font-display text-[44px] md:text-[68px] leading-[1.02] tracking-tight text-[var(--m-ink)]">
              People <span className="italic text-[var(--m-accent)]">+</span> AI:
              <br />
              <span className="italic brand-gradient-text">working</span> together
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mt-6 max-w-xl text-[16px] md:text-[18px] leading-relaxed text-[var(--m-ink-2)]">
              MARINA is the AI Chief of Staff for distributed teams — engineering,
              design, sales, support, ops. See what shipped, who's blocked, and
              what needs your attention. One calm dashboard, every morning.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-8">
              <LandingClient
                authError={sp.auth_error ?? null}
                githubSignIn={githubSignIn}
                characters={characters}
              />
            </div>
            <p className="mt-5 text-[12.5px] text-[var(--m-ink-3)] flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="text-[var(--m-good)]">
                  <path d="M5 13l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Free for the first 5 teammates
              </span>
              <span className="text-[var(--m-ink-5)]">·</span>
              <span className="inline-flex items-center gap-1.5">
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="text-[var(--m-good)]">
                  <path d="M5 13l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                No credit card required
              </span>
            </p>
          </Reveal>
        </div>

        {/* Hero illustration — animated Team Pulse preview */}
        <Reveal delay={320} className="lg:col-span-5">
          <HeroPreview />
        </Reveal>
      </div>
    </section>
  )
}

function HeroPreview() {
  return (
    <div className="relative">
      {/* Soft pastel background — floats gently */}
      <div
        className="absolute -inset-6 rounded-[28px] -z-10 m-float"
        style={{
          background:
            'linear-gradient(135deg, rgba(63,107,84,0.12) 0%, rgba(196,123,86,0.08) 50%, rgba(193,154,77,0.10) 100%)',
        }}
      />
      {/* Decorative offset card behind for depth */}
      <div className="absolute inset-0 translate-x-3 translate-y-4 rounded-[20px] bg-[var(--m-bg-soft)] border border-[var(--m-border)] -z-10" />

      <div className="relative rounded-[20px] bg-white border border-[var(--m-border)] shadow-[var(--m-shadow-xl)] p-5">
        {/* Mock chrome */}
        <div className="flex items-center gap-1.5 mb-4">
          <span className="w-2.5 h-2.5 rounded-full bg-[#e5e0d4]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#e5e0d4]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#e5e0d4]" />
          <span className="ml-3 text-[10.5px] tracking-wider uppercase text-[var(--m-ink-4)]">
            Team Pulse · Acme
          </span>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-[var(--m-good)] font-medium">
            <span className="relative inline-flex">
              <span className="absolute inset-0 rounded-full bg-[var(--m-good)]/40 animate-ping" />
              <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-[var(--m-good)]" />
            </span>
            live
          </span>
        </div>

        {/* Greeting */}
        <p className="font-display text-[18px] text-[var(--m-ink)] leading-tight">
          Good morning, Tanish
        </p>
        <p className="text-[11.5px] text-[var(--m-ink-3)] mt-0.5">
          2 teammates waiting on you · 7 of 12 shipping today
        </p>

        {/* Inline stats */}
        <div className="flex items-baseline gap-6 mt-4 pb-4 border-b border-[var(--m-border-soft)]">
          <Stat n="2" label="blocked" tone="bad" />
          <Stat n="7" label="shipping" tone="good" />
          <Stat n="1" label="on leave" tone="warn" />
        </div>

        {/* Blocker card */}
        <div className="mt-4 rounded-lg border border-[#f1d5d6] bg-[#fbf2f2]/60 p-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <p className="text-[11px] tracking-wider uppercase text-[var(--m-bad)] font-semibold flex items-center gap-1.5">
              <span className="relative inline-flex">
                <span className="absolute inset-0 rounded-full bg-[var(--m-bad)]/40 animate-ping" />
                <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-[var(--m-bad)]" />
              </span>
              Active blocker
            </p>
            <span className="text-[10.5px] text-[var(--m-bad)] tabular-nums font-medium">47 min</span>
          </div>
          <p className="mt-1.5 text-[13px] text-[var(--m-ink)]">
            <span className="font-medium">Priya</span>
            <span className="text-[var(--m-ink-3)]"> waiting on </span>
            <span className="font-medium">@arjun</span>
          </p>
          <p className="text-[11.5px] text-[var(--m-ink-3)] mt-0.5">
            Brand review pending sign-off · marketing
          </p>
        </div>

        {/* Member row — designer */}
        <div className="mt-3 rounded-lg border border-[var(--m-border)] bg-white p-3">
          <div className="flex items-center gap-3 mb-2">
            <span className="inline-flex w-8 h-8 rounded-md bg-[var(--m-clay-soft)] items-center justify-center text-[var(--m-clay-deep)] text-[11.5px] font-semibold">
              A
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium text-[var(--m-ink)] truncate flex items-center gap-1.5 flex-wrap">
                Anika Roy
                <span className="text-[10px] text-[var(--m-ink-4)] uppercase tracking-wider">Design</span>
                <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--m-good-soft)] text-[var(--m-good)]">
                  <span className="inline-block w-1 h-1 rounded-full bg-[var(--m-good)]" />
                  Working
                </span>
              </p>
            </div>
          </div>
          {/* Right now line */}
          <p className="text-[11.5px] text-[var(--m-ink-2)] mb-1.5 flex items-center gap-1.5">
            <span className="relative inline-flex">
              <span className="absolute inset-0 rounded-full bg-[var(--m-good)]/40 animate-ping" />
              <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-[var(--m-good)]" />
            </span>
            <span className="text-[var(--m-ink-3)]">Right now</span>
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="text-[var(--m-accent)]">
              <path d="M8 8l-4 4 4 4M16 8l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-medium truncate">Figma · Mobile onboarding</span>
          </p>
          <div className="h-1 rounded-full overflow-hidden flex bg-[var(--m-bg-soft)] m-shimmer">
            <div className="h-full bg-[var(--m-accent)]" style={{ width: '68%' }} />
            <div className="h-full bg-[var(--m-ink-5)]" style={{ width: '22%' }} />
          </div>
        </div>

        {/* Second row — sales (mixed-team hint) */}
        <div className="mt-2.5 rounded-lg border border-[var(--m-border)] bg-white p-2.5 flex items-center gap-3">
          <span className="inline-flex w-7 h-7 rounded-md bg-[var(--m-info-soft)] items-center justify-center text-[var(--m-info)] text-[11px] font-semibold">
            V
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-[var(--m-ink)] truncate flex items-center gap-1.5">
              Vikram Shah
              <span className="text-[9.5px] text-[var(--m-ink-4)] uppercase tracking-wider">Sales</span>
            </p>
            <p className="text-[10.5px] text-[var(--m-ink-3)] truncate">
              In a call · Zoom · Acme Corp
            </p>
          </div>
          <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--m-info-soft)] text-[var(--m-info)]">
            In meeting
          </span>
        </div>

        <p className="mt-3 text-[10.5px] text-[var(--m-ink-4)] text-center">
          Live preview · auto-refreshes every 45 seconds
        </p>
      </div>
    </div>
  )
}

function Stat({ n, label, tone }: { n: string; label: string; tone: 'good' | 'bad' | 'warn' }) {
  const colorClass =
    tone === 'good' ? 'text-[var(--m-good)]'
    : tone === 'bad' ? 'text-[var(--m-bad)]'
    : 'text-[var(--m-warn)]'
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`text-[22px] font-semibold tabular-nums tracking-tight ${colorClass}`}>{n}</span>
      <span className="text-[11.5px] text-[var(--m-ink-3)]">{label}</span>
    </div>
  )
}

/* ============================ LOGOS STRIP ============================ */

function LogosStrip() {
  const logos = [
    { name: 'Zerodha', font: 'serif' },
    { name: 'Razorpay', font: 'sans' },
    { name: 'CleverTap', font: 'sans' },
    { name: 'Postman', font: 'sans' },
    { name: 'Hasura', font: 'sans' },
    { name: 'BrowserStack', font: 'sans' },
    { name: 'Zomato', font: 'sans' },
    { name: 'Swiggy', font: 'sans' },
    { name: 'Freshworks', font: 'sans' },
    { name: 'Atlan', font: 'sans' },
  ]
  // Duplicate for seamless marquee loop
  const items = [...logos, ...logos]
  return (
    <section className="border-y border-[var(--m-border)]/60 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <Reveal>
          <p className="text-center text-[11px] tracking-[0.2em] uppercase text-[var(--m-ink-4)] mb-7">
            Trusted by remote teams at
          </p>
        </Reveal>
        <div className="relative">
          {/* Fade edges */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-20 z-10 bg-gradient-to-r from-[var(--m-bg)] to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-20 z-10 bg-gradient-to-l from-[var(--m-bg)] to-transparent" />
          <div className="m-marquee flex items-center gap-x-14 whitespace-nowrap">
            {items.map((l, i) => (
              <span
                key={`${l.name}-${i}`}
                className={`text-[18px] md:text-[20px] tracking-tight text-[var(--m-ink-3)] opacity-70 ${
                  l.font === 'serif' ? 'font-display italic' : 'font-medium'
                }`}
              >
                {l.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ============================ VALUE PROPS ============================ */

function ValueProps() {
  return (
    <section id="product" className="max-w-7xl mx-auto px-6 py-20 md:py-28">
      <Reveal>
        <div className="max-w-3xl">
          <p className="text-[11px] tracking-[0.18em] uppercase text-[var(--m-accent)] font-medium mb-4">
            Why MARINA
          </p>
          <h2 className="font-display text-[36px] md:text-[52px] leading-[1.02] tracking-tight text-[var(--m-ink)]">
            High-performing teams are <span className="italic brand-gradient-text">built here</span>
          </h2>
          <p className="mt-5 text-[16px] md:text-[18px] text-[var(--m-ink-2)] leading-relaxed">
            MARINA is your team's daily destination for work — combining the best
            people and AI to help managers see signal, unblock teammates, and ship the right things together.
          </p>
        </div>
      </Reveal>

      <div className="mt-12 grid md:grid-cols-3 gap-5 items-stretch">
        <Reveal delay={0} className="h-full">
          <ValueCard
            eyebrow="Pulse"
            title="One glance, one verdict"
            body="See blockers, slacking risks, and standout work in a single calm dashboard. No graphs to interpret — just the next action."
            tone="sage"
          />
        </Reveal>
        <Reveal delay={120} className="h-full">
          <ValueCard
            eyebrow="Briefs"
            title="AI Chief of Staff"
            body="Every Monday, a CEO digest in your inbox. Every Friday, a 1-on-1 prep card. Every day, a daily story per teammate."
            tone="clay"
          />
        </Reveal>
        <Reveal delay={240} className="h-full">
          <ValueCard
            eyebrow="Every role"
            title="Engineers, designers, sales, support"
            body="Hours, focus, meetings and breaks work for everyone. Connect GitHub, Figma, Linear or HubSpot to pull per-role deliverables — or stay manual."
            tone="gold"
          />
        </Reveal>
      </div>
    </section>
  )
}

function ValueCard({
  eyebrow,
  title,
  body,
  tone,
}: {
  eyebrow: string
  title: string
  body: string
  tone: 'sage' | 'clay' | 'gold'
}) {
  const bgGradient = {
    sage: 'linear-gradient(160deg, rgba(63,107,84,0.08), rgba(63,107,84,0.02))',
    clay: 'linear-gradient(160deg, rgba(196,123,86,0.08), rgba(196,123,86,0.02))',
    gold: 'linear-gradient(160deg, rgba(193,154,77,0.08), rgba(193,154,77,0.02))',
  }[tone]
  const dot = {
    sage: 'var(--m-accent)',
    clay: 'var(--m-clay)',
    gold: 'var(--m-gold)',
  }[tone]
  return (
    <div
      className="lift-on-hover h-full rounded-2xl p-6 border border-[var(--m-border)] bg-white shadow-[var(--m-shadow-sm)] relative overflow-hidden"
      style={{ background: bgGradient }}
    >
      <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl opacity-40" style={{ background: dot }} />
      <p className="text-[10.5px] tracking-[0.18em] uppercase font-semibold relative" style={{ color: dot }}>
        {eyebrow}
      </p>
      <h3 className="mt-2 font-display text-[26px] leading-tight text-[var(--m-ink)] relative">
        {title}
      </h3>
      <p className="mt-3 text-[14px] text-[var(--m-ink-2)] leading-relaxed relative">{body}</p>
    </div>
  )
}

/* ============================ PRODUCT SECTION ============================ */

function ProductSection() {
  return (
    <section className="bg-[var(--m-bg-soft)] border-y border-[var(--m-border)]">
      <div className="max-w-7xl mx-auto px-6 py-20 md:py-28">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-5">
            <p className="text-[11px] tracking-[0.18em] uppercase text-[var(--m-clay)] font-medium mb-4">
              Story narrative
            </p>
            <h2 className="font-display text-[32px] md:text-[42px] leading-[1.1] tracking-tight">
              Unblock work and unlock potential with your team's <span className="italic">personal AI agent</span>
            </h2>
            <p className="mt-5 text-[15px] text-[var(--m-ink-2)] leading-relaxed">
              MARINA proactively surfaces what each teammate did, what's holding them back,
              and what they should focus on next — grounded in real GitHub activity, calendar
              meetings, and screen evidence. Never a hallucination.
            </p>
            <ul className="mt-6 space-y-2.5 text-[13.5px] text-[var(--m-ink-2)]">
              <Bullet>Specific PR titles + commit subjects, not just counts</Bullet>
              <Bullet>Top apps used today, work vs non-work mix</Bullet>
              <Bullet>Scenes timeline with hoverable per-window evidence</Bullet>
            </ul>
          </div>
          <div className="lg:col-span-7">
            <BriefPreview />
          </div>
        </div>
      </div>
    </section>
  )
}

function BriefPreview() {
  return (
    <div className="rounded-2xl bg-white border border-[var(--m-border)] shadow-[var(--m-shadow-lg)] p-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex w-10 h-10 rounded-lg bg-[var(--m-accent-soft)] items-center justify-center text-[var(--m-accent)] font-semibold">
            P
          </span>
          <div>
            <p className="text-[14px] font-medium text-[var(--m-ink)]">Priya Nair</p>
            <p className="text-[11.5px] text-[var(--m-ink-3)]">Senior · @priya</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-[10.5px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--m-good-soft)] text-[var(--m-good)]">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--m-good)]" />
          On a strong stretch
        </span>
      </div>

      {/* Timeline ribbon */}
      <div className="mb-4">
        <div className="flex justify-between text-[9.5px] text-[var(--m-ink-4)] mb-1 tabular-nums">
          <span>9:15 AM</span>
          <span>6:42 PM</span>
        </div>
        <div className="flex h-2 rounded-full overflow-hidden bg-[var(--m-bg-soft)]">
          <div style={{ width: '12%', background: 'var(--m-info)' }} />
          <div style={{ width: '28%', background: 'var(--m-accent)' }} />
          <div style={{ width: '6%', background: 'var(--m-warn)' }} />
          <div style={{ width: '22%', background: 'var(--m-accent)' }} />
          <div style={{ width: '8%', background: 'var(--m-info)' }} />
          <div style={{ width: '14%', background: 'var(--m-clay)' }} />
          <div style={{ width: '10%', background: 'var(--m-accent-2)' }} />
        </div>
      </div>

      {/* What shipped */}
      <p className="text-[10.5px] tracking-wider uppercase font-semibold text-[var(--m-ink-4)] mb-2">
        What shipped
      </p>
      <ul className="space-y-1.5 text-[13px]">
        <li className="flex items-center gap-2">
          <span className="text-[9.5px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[var(--m-clay-soft)] text-[var(--m-clay-deep)]">PR</span>
          <span className="text-[var(--m-ink)] flex-1 truncate">Fix double-submit on leave form</span>
          <span className="text-[var(--m-ink-4)] text-[11px]">acme/web</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="text-[9.5px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[var(--m-good-soft)] text-[var(--m-good)]">commit</span>
          <span className="text-[var(--m-ink)] flex-1 truncate">Bump react to 19.2 + migrate compiler</span>
          <span className="text-[var(--m-ink-4)] text-[11px]">acme/api</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="text-[9.5px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[var(--m-info-soft)] text-[var(--m-info)]">review</span>
          <span className="text-[var(--m-ink)] flex-1 truncate">Review: refactor auth middleware</span>
          <span className="text-[var(--m-ink-4)] text-[11px]">acme/api</span>
        </li>
      </ul>

      <p className="mt-4 text-[10.5px] tracking-wider uppercase font-semibold text-[var(--m-ink-4)] mb-2">
        Where time went today
      </p>
      <div className="flex rounded-full overflow-hidden h-1.5 mb-2">
        <div style={{ width: '45%', background: 'var(--m-accent)' }} />
        <div style={{ width: '20%', background: 'var(--m-clay)' }} />
        <div style={{ width: '15%', background: 'var(--m-info)' }} />
        <div style={{ width: '20%', background: 'var(--m-bg-soft)' }} />
      </div>
      <div className="flex items-center gap-3 text-[11px] text-[var(--m-ink-3)] flex-wrap">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-[var(--m-accent)]" />VS Code 3h 12m</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-[var(--m-clay)]" />Figma 1h 25m</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-[var(--m-info)]" />Slack 58m</span>
      </div>
    </div>
  )
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <svg
        width={16}
        height={16}
        viewBox="0 0 20 20"
        className="shrink-0 mt-0.5 text-[var(--m-accent)]"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <circle cx="10" cy="10" r="8" />
        <path d="M6.5 10.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{children}</span>
    </li>
  )
}

/* ============================ WORKFLOWS ============================ */

function Workflows() {
  const items = [
    {
      eyebrow: 'Standup Mode',
      title: 'Lead live standups',
      body: 'Projection-friendly view shows what each person shipped yesterday — designs, PRs, deals or tickets — what they\'re stuck on, and questions to ask them. Arrow keys to navigate.',
    },
    {
      eyebrow: 'Blockers',
      title: 'Unstuck within minutes',
      body: 'Tagged "Waiting on @X" pauses surface in real time across every team. One click nudges the blocker via Slack with the reason and duration.',
    },
    {
      eyebrow: 'Attendance',
      title: 'Auto-marked, no spreadsheets',
      body: 'Punch-in, punch-out, leaves, and regional holidays roll up into a monthly calendar per employee. Export to your HRIS or payroll.',
    },
    {
      eyebrow: 'Briefs',
      title: 'AI weekly digest',
      body: 'Every Monday morning, founders get a digest: what shipped across teams, who\'s blocked, who needs attention, who\'s out next week.',
    },
  ]
  return (
    <section id="workflows" className="max-w-7xl mx-auto px-6 py-20 md:py-28">
      <div className="max-w-2xl mb-12">
        <p className="text-[11px] tracking-[0.18em] uppercase text-[var(--m-accent)] font-medium mb-4">
          Workflows
        </p>
        <h2 className="font-display text-[36px] md:text-[48px] leading-[1.05] tracking-tight">
          Build high performance through <span className="italic">everyday habits</span>
        </h2>
      </div>
      <div className="grid md:grid-cols-2 gap-5 items-stretch">
        {items.map((it, i) => (
          <Reveal key={it.title} delay={i * 100} className="h-full">
            <div className="lift-on-hover h-full rounded-2xl bg-white border border-[var(--m-border)] p-6">
              <p className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[var(--m-clay)]">
                {it.eyebrow}
              </p>
              <h3 className="mt-2 font-display text-[26px] leading-tight text-[var(--m-ink)]">
                {it.title}
              </h3>
              <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--m-ink-2)]">{it.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/* ============================ TESTIMONIALS ============================ */

function Testimonials() {
  return (
    <section className="bg-[var(--m-bg-soft)] border-y border-[var(--m-border)]">
      <div className="max-w-7xl mx-auto px-6 py-20 md:py-24">
        <Reveal>
          <p className="text-center text-[11px] tracking-[0.18em] uppercase text-[var(--m-ink-4)] mb-3">
            Customer stories
          </p>
          <h2 className="font-display text-[32px] md:text-[44px] leading-tight tracking-tight text-center max-w-2xl mx-auto">
            Trusted by <span className="italic brand-gradient-text">top performers</span>
          </h2>
        </Reveal>

        <div className="mt-12 grid md:grid-cols-2 gap-5 items-stretch">
          <Reveal delay={0} className="h-full">
            <Testimonial
              quote="MARINA listens to us a lot. They take suggestions seriously and ship them within a week. The Scrum Mode replaced our 25-minute standup."
              name="Arjun Mehta"
              role="Engineering Manager · Hulk Labs"
              metricCount={30}
              metricSuffix="h"
              metricLabel="weekly hours saved on standups + status reports"
              gradient="sage"
            />
          </Reveal>
          <Reveal delay={120} className="h-full">
            <Testimonial
              quote="We wanted to create the most efficient and effective system for spotting blockers and unblocking the team. MARINA's nudge workflow ships exactly that."
              name="Priya Nair"
              role="Head of Product · Spider Co."
              metricCount={2000}
              metricSuffix=""
              metricLabel="blockers resolved in our first month"
              gradient="clay"
            />
          </Reveal>
        </div>
      </div>
    </section>
  )
}

function Testimonial({
  quote,
  name,
  role,
  metricCount,
  metricSuffix,
  metricLabel,
  gradient,
}: {
  quote: string
  name: string
  role: string
  metricCount: number
  metricSuffix: string
  metricLabel: string
  gradient: 'sage' | 'clay'
}) {
  const avatarBg = gradient === 'sage' ? 'var(--m-accent-soft)' : 'var(--m-clay-soft)'
  const avatarText = gradient === 'sage' ? 'var(--m-accent)' : 'var(--m-clay-deep)'
  const metricColor = gradient === 'sage' ? 'var(--m-accent)' : 'var(--m-clay-deep)'
  return (
    <article className="lift-on-hover h-full rounded-2xl bg-white border border-[var(--m-border)] p-6 md:p-8 shadow-[var(--m-shadow-sm)]">
      <div className="grid md:grid-cols-5 gap-6 items-start">
        <div className="md:col-span-3">
          <svg width={28} height={20} viewBox="0 0 28 20" className="text-[var(--m-clay)] mb-3 opacity-50" fill="currentColor">
            <path d="M0 20V8c0-4.4 3.6-8 8-8h2v6H8c-1.1 0-2 .9-2 2v2h6v10H0zm16 0V8c0-4.4 3.6-8 8-8h2v6h-2c-1.1 0-2 .9-2 2v2h6v10H16z" />
          </svg>
          <p className="font-display text-[20px] md:text-[22px] leading-snug text-[var(--m-ink)] italic">
            {quote}
          </p>
          <div className="mt-5 flex items-center gap-3">
            <span
              className="inline-flex w-10 h-10 rounded-full items-center justify-center font-semibold text-[14px]"
              style={{ background: avatarBg, color: avatarText }}
            >
              {name.split(' ').map((s) => s[0]).join('').slice(0, 2)}
            </span>
            <div>
              <p className="text-[13.5px] font-medium text-[var(--m-ink)]">{name}</p>
              <p className="text-[11.5px] text-[var(--m-ink-3)]">{role}</p>
            </div>
          </div>
        </div>
        <div className="md:col-span-2 md:border-l md:border-[var(--m-border)] md:pl-6">
          <p className="font-display text-[48px] leading-none tracking-tight" style={{ color: metricColor }}>
            <CountUp to={metricCount} suffix={metricSuffix} />
          </p>
          <p className="mt-3 text-[12.5px] text-[var(--m-ink-2)] leading-relaxed">{metricLabel}</p>
        </div>
      </div>
    </article>
  )
}

/* ============================ INTEGRATIONS ============================ */

function Integrations() {
  return (
    <section className="relative isolate overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            'linear-gradient(135deg, rgba(63,107,84,0.18) 0%, rgba(196,123,86,0.10) 50%, rgba(193,154,77,0.14) 100%)',
        }}
      />
      <div className="max-w-7xl mx-auto px-6 py-20 md:py-24 text-center">
        <p className="text-[11px] tracking-[0.18em] uppercase text-[var(--m-ink-2)] font-medium mb-3">
          Integrations
        </p>
        <h2 className="font-display text-[32px] md:text-[44px] leading-tight tracking-tight text-[var(--m-ink)] max-w-3xl mx-auto">
          Integrate everything. <span className="italic">Align everyone.</span>
        </h2>
        <p className="mt-4 max-w-2xl mx-auto text-[15px] text-[var(--m-ink-2)] leading-relaxed">
          Connect MARINA with the tools you already use for source code, calendars,
          chat, and payroll. Engineering data flows in; clean signal flows out.
        </p>

        <div className="mt-12 grid grid-cols-3 md:grid-cols-6 gap-3 max-w-3xl mx-auto">
          {['GitHub', 'GitLab', 'Slack', 'Google Cal', 'Linear', 'Jira', 'Razorpay', 'KEKA', 'WhatsApp', 'Notion', 'Figma', 'M365'].map((n) => (
            <div
              key={n}
              className="rounded-xl bg-white border border-[var(--m-border)] py-4 px-3 text-[12.5px] text-[var(--m-ink-2)] font-medium shadow-[var(--m-shadow-sm)] hover:shadow-[var(--m-shadow)] transition-shadow"
            >
              {n}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ============================ PRICING ============================ */

function Pricing() {
  const plans = [
    {
      name: 'Free',
      price: '₹0',
      period: 'forever',
      blurb: 'For up to 5 teammates. Get started, prove the value.',
      features: ['Up to 5 teammates', 'AI weekly briefs', 'Blockers panel', 'Mac + Windows agents', 'Email support'],
      cta: 'Start free',
      tone: 'plain',
    },
    {
      name: 'Team',
      price: '₹499',
      period: 'per operator / month',
      blurb: 'For founders and small teams shipping fast.',
      features: ['Everything in Free', 'Unlimited teammates', 'CEO weekly digest', 'Standup Mode', 'Slack + WhatsApp bots', 'Compliance pack (IN + global)', '24h support SLA'],
      cta: 'Start free trial',
      tone: 'sage',
    },
    {
      name: 'Scale',
      price: '₹899',
      period: 'per operator / month',
      blurb: 'When procurement starts asking questions.',
      features: ['Everything in Team', 'SSO (Google / Microsoft)', 'Custom roles + permissions', 'India-region data residency', 'DPA + security review', 'Dedicated CSM'],
      cta: 'Talk to us',
      tone: 'plain',
    },
  ]
  return (
    <section id="pricing" className="max-w-7xl mx-auto px-6 py-20 md:py-28">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <p className="text-[11px] tracking-[0.18em] uppercase text-[var(--m-accent)] font-medium mb-3">
          Pricing
        </p>
        <h2 className="font-display text-[36px] md:text-[48px] leading-tight tracking-tight">
          Honest pricing,<br />
          <span className="italic">no per-seat surprises</span>
        </h2>
        <p className="mt-4 text-[15px] text-[var(--m-ink-2)]">
          Founder pricing locked for early customers. 17% off on annual prepay.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-5 items-stretch">
        {plans.map((p) => {
          const featured = p.tone === 'sage'
          return (
            <div
              key={p.name}
              className={`flex flex-col rounded-2xl border bg-white p-7 transition-all ${
                featured
                  ? 'border-[var(--m-accent)] shadow-[var(--m-shadow-xl)] relative md:-mt-2'
                  : 'border-[var(--m-border)] shadow-[var(--m-shadow-sm)] hover:shadow-[var(--m-shadow)]'
              }`}
            >
              {featured && (
                <p className="absolute -top-3 left-1/2 -translate-x-1/2 inline-block text-[10.5px] font-semibold tracking-wider uppercase text-white bg-[var(--m-accent)] px-2.5 py-0.5 rounded-full">
                  Most popular
                </p>
              )}
              <h3 className="font-display text-[24px] text-[var(--m-ink)]">{p.name}</h3>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="font-display text-[44px] tracking-tight text-[var(--m-ink)]">{p.price}</span>
                <span className="text-[12px] text-[var(--m-ink-3)]">{p.period}</span>
              </div>
              <p className="mt-1.5 text-[13px] text-[var(--m-ink-2)]">{p.blurb}</p>
              <ul className="mt-6 space-y-2.5 text-[13px] text-[var(--m-ink-2)] flex-1">
                {p.features.map((f) => (
                  <Bullet key={f}>{f}</Bullet>
                ))}
              </ul>
              <a
                href="#cta"
                className={`mt-7 inline-flex w-full justify-center font-medium text-[13.5px] py-2.5 rounded-lg transition ${
                  featured
                    ? 'bg-[var(--m-ink)] text-white hover:bg-[var(--m-ink-2)]'
                    : 'border border-[var(--m-border)] text-[var(--m-ink-2)] hover:bg-[var(--m-bg)]'
                }`}
              >
                {p.cta}
              </a>
            </div>
          )
        })}
      </div>
      <p className="text-center mt-8 text-[12px] text-[var(--m-ink-3)]">
        All prices in INR, exclusive of 18% GST. GST-compliant invoices issued automatically.
      </p>
    </section>
  )
}

/* ============================ RESOURCE CARDS ============================ */

function ResourceCards() {
  const items = [
    { tone: 'sage', title: 'Library', body: 'Explore the ultimate resource center for people management and HR ops.', icon: BookIcon },
    { tone: 'clay', title: 'MARINA University', body: 'Curriculum, training, and templates to build and implement successful people programs.', icon: GraduationIcon },
    { tone: 'gold', title: 'Community', body: 'Join the Resources for Humans community to connect with founders and team leads running distributed teams.', icon: PeopleIcon },
    { tone: 'sage', title: 'Events', body: 'Live and recorded webinars on all things people management and HR.', icon: SparkIcon },
  ]
  return (
    <section className="bg-[var(--m-bg-soft)] border-y border-[var(--m-border)]">
      <div className="max-w-7xl mx-auto px-6 py-20 md:py-24">
        <div className="max-w-2xl mb-12">
          <p className="text-[11px] tracking-[0.18em] uppercase text-[var(--m-accent)] font-medium mb-3">
            Resources
          </p>
          <h2 className="font-display text-[32px] md:text-[42px] leading-tight tracking-tight">
            Power your <span className="italic">high-performing organization</span>
          </h2>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map((it, i) => {
            const Icon = it.icon
            const dot =
              it.tone === 'sage' ? 'var(--m-accent)' :
              it.tone === 'clay' ? 'var(--m-clay)' :
              'var(--m-gold)'
            const bg =
              it.tone === 'sage' ? 'var(--m-accent-soft)' :
              it.tone === 'clay' ? 'var(--m-clay-soft)' :
              'var(--m-gold-soft)'
            return (
              <a
                key={i}
                href="#"
                className="rounded-2xl bg-white border border-[var(--m-border)] p-6 hover:shadow-[var(--m-shadow-lg)] hover:-translate-y-0.5 transition-all block"
              >
                <span
                  className="inline-flex w-10 h-10 rounded-xl items-center justify-center mb-4"
                  style={{ background: bg, color: dot }}
                >
                  <Icon />
                </span>
                <h3 className="font-display text-[20px] text-[var(--m-ink)] leading-tight">{it.title}</h3>
                <p className="mt-2 text-[13px] text-[var(--m-ink-2)] leading-relaxed">{it.body}</p>
              </a>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ============================ FINAL CTA ============================ */

function FinalCTA({ githubSignIn }: { githubSignIn: () => Promise<void> }) {
  return (
    <section id="cta" className="relative isolate overflow-hidden">
      {/* `isolate` creates a local stacking context so the gradient sits
          behind the content without being pushed under the page's own
          cream background by negative z-index. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            'linear-gradient(135deg, #1f3d2c 0%, #2f5240 28%, #3f6b54 55%, #c19a4d 100%)',
        }}
      />
      {/* Subtle inner glow + grain so the gradient doesn't look flat */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-40"
        style={{
          background:
            'radial-gradient(50% 60% at 50% 30%, rgba(255,255,255,0.18), transparent 70%)',
        }}
      />
      <div className="relative max-w-4xl mx-auto px-6 py-24 md:py-32 text-center text-white">
        <p className="text-[11px] tracking-[0.18em] uppercase text-white/80 font-medium mb-4">
          Ready when you are
        </p>
        <h2 className="font-display text-[40px] md:text-[56px] leading-[1.05] tracking-tight">
          Your people are <br />
          <span className="italic">your business</span>
        </h2>
        <p className="mt-5 max-w-xl mx-auto text-[15px] text-white/85 leading-relaxed">
          Ensure both are successful with MARINA. Free for the first 5 teammates.
          ₹0 trial for 30 days on every paid plan. No credit card needed.
        </p>

        <form action={githubSignIn} className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          <button
            type="submit"
            className="inline-flex items-center gap-2 bg-white text-[var(--m-ink)] hover:bg-white/95 px-5 py-2.5 rounded-lg text-[14px] font-medium shadow-lg transition"
          >
            <GhIcon />
            Continue with GitHub
          </button>
          <a
            href="mailto:hello@marina.in?subject=MARINA%20demo%20request"
            className="text-[14px] text-white/90 hover:text-white border border-white/30 hover:border-white/60 rounded-lg px-5 py-2.5 transition"
          >
            Request a demo
          </a>
        </form>
      </div>
    </section>
  )
}

/* ============================ FOOTER ============================ */

function Footer() {
  return (
    <footer className="border-t border-[var(--m-border)] bg-[var(--m-bg)]">
      <div className="max-w-7xl mx-auto px-6 py-14">
        <div className="grid sm:grid-cols-2 md:grid-cols-5 gap-10 text-[13px]">
          <div className="sm:col-span-2 md:col-span-2">
            <div className="flex items-center gap-2.5 mb-3">
              <Logo />
              <span className="font-display text-[17px] tracking-tight">MARINA</span>
            </div>
            <p className="text-[var(--m-ink-3)] leading-relaxed max-w-xs">
              The AI Chief of Staff for modern remote teams.
              Built in India 🇮🇳 for the world.
            </p>
          </div>
          <FooterCol title="Product" items={[['Features', '#product'], ['Workflows', '#workflows'], ['Pricing', '#pricing'], ['Changelog', '/changelog']]} />
          <FooterCol title="Legal" items={[['Privacy', '/privacy'], ['Terms', '/terms'], ['DPA', '/dpa'], ['Security', '/security']]} />
          <FooterCol title="Contact" items={[['hello@marina.in', 'mailto:hello@marina.in'], ['security@marina.in', 'mailto:security@marina.in'], ['dpo@marina.in', 'mailto:dpo@marina.in']]} />
        </div>
        <div className="mt-12 pt-6 border-t border-[var(--m-border)] flex items-center justify-between flex-wrap gap-3 text-[11.5px] text-[var(--m-ink-4)]">
          <p>© 2026 Project MARINA Private Limited. All rights reserved.</p>
          <p>Made with care in Bangalore.</p>
        </div>
      </div>
    </footer>
  )
}

function FooterCol({ title, items }: { title: string; items: Array<[string, string]> }) {
  return (
    <div>
      <p className="font-medium text-[var(--m-ink)] mb-3">{title}</p>
      <ul className="space-y-1.5">
        {items.map(([label, href]) => (
          <li key={label}>
            <a href={href} className="text-[var(--m-ink-3)] hover:text-[var(--m-ink)] transition-colors">{label}</a>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ============================ INLINE ICONS ============================ */

function Logo() {
  return (
    <svg width={28} height={28} viewBox="0 0 28 28" fill="none">
      <defs>
        <linearGradient id="mlogo" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3f6b54" />
          <stop offset="100%" stopColor="#c19a4d" />
        </linearGradient>
      </defs>
      <path d="M14 3 L24 24 H4 Z" fill="url(#mlogo)" />
      <circle cx={14} cy={18} r={3} fill="#f8f6f1" />
    </svg>
  )
}
function BookIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <path d="M4 5a2 2 0 012-2h12v18H6a2 2 0 01-2-2V5z" />
      <path d="M18 3v18M8 7h6M8 11h6" strokeLinecap="round" />
    </svg>
  )
}
function GraduationIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <path d="M2 9l10-5 10 5-10 5L2 9z" />
      <path d="M6 11v5c0 1 3 3 6 3s6-2 6-3v-5" />
    </svg>
  )
}
function PeopleIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <circle cx={9} cy={8} r={3.5} />
      <circle cx={17} cy={10} r={2.5} />
      <path d="M3 20c0-3 3-5 6-5s6 2 6 5" />
      <path d="M15 20c.6-2 2.5-3.5 4-3.5 2 0 3 1.5 3 3.5" />
    </svg>
  )
}
function SparkIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <path d="M12 3v6M12 15v6M3 12h6M15 12h6" strokeLinecap="round" />
      <circle cx={12} cy={12} r={2.5} />
    </svg>
  )
}
function GhIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.1c-3.2.7-3.88-1.36-3.88-1.36-.52-1.31-1.28-1.66-1.28-1.66-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18A11 11 0 0 1 12 6.8c.98.01 1.97.13 2.89.39 2.2-1.49 3.17-1.18 3.17-1.18.64 1.58.24 2.75.12 3.04.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.07.78 2.15v3.19c0 .31.21.67.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  )
}
