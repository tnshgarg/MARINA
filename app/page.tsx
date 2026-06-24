import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { auth, signIn } from "@/auth";
import { db, schema } from "@/lib/db/client";
import { listMembershipsForCurrentUser, roleAtLeast } from "@/lib/auth/guards";
import { Reveal } from "@/components/reveal";
import LandingClient from "./landing-client";

export const dynamic = "force-dynamic";

/**
 * The EMPLOYEE landing (`/`). Marina, marketed individual-first: "get credit for
 * the work you actually do." Anyone landing here is an individual, so a signed-in
 * user with no org goes straight to their personal /dashboard (no team-creation
 * step). The employer pitch lives at /company.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ auth_error?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  if (session?.appUserId) {
    const jar = await cookies();
    const pendingInvite = jar.get("marina_pending_invite")?.value;
    if (pendingInvite) redirect(`/invite/${pendingInvite}`);

    const memberships = await listMembershipsForCurrentUser();
    // Employee entry: no org → their own dashboard. (Managers come via /company,
    // which keeps the create-a-team default — that flow is untouched.)
    if (memberships.length === 0) redirect("/dashboard");
    const first = memberships[0];
    if (roleAtLeast(first.role, "manager")) redirect(`/org/${first.orgId}`);
    redirect("/dashboard");
  }

  async function googleSignIn() {
    "use server";
    await signIn("google", { redirectTo: "/" });
  }

  const googleEnabled = !!(
    process.env.GOOGLE_SSO_CLIENT_ID && process.env.GOOGLE_SSO_CLIENT_SECRET
  );

  return (
    <main className="relative isolate min-h-screen paper text-[var(--m-ink)] overflow-x-hidden">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 overflow-hidden pointer-events-none h-[900px]"
      >
        <div
          className="absolute left-1/2 -translate-x-1/2 -top-40 w-[1300px] h-[640px] rounded-full opacity-60 blur-3xl"
          style={{
            background:
              "radial-gradient(40% 40% at 30% 50%, rgba(63,107,84,0.20), transparent 70%), radial-gradient(40% 40% at 70% 30%, rgba(196,123,86,0.16), transparent 70%), radial-gradient(40% 40% at 60% 80%, rgba(193,154,77,0.12), transparent 70%)",
          }}
        />
      </div>

      <Nav />
      <Hero sp={sp} googleSignIn={googleEnabled ? googleSignIn : null} />
      <HowItWorks />
      <Features />
      <TrustBand />
      <FinalCta />
      <Footer />
    </main>
  );
}

/* ============================ NAV ============================ */

function Nav() {
  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-[var(--m-bg)]/75 border-b border-[var(--m-border)]/50">
      <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between gap-6">
        <a href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="font-display text-[19px] leading-none text-[var(--m-ink)] tracking-tight">
            MARINA
          </span>
        </a>
        <nav className="hidden md:flex items-center gap-7 text-[13.5px] text-[var(--m-ink-2)]">
          <a href="#how" className="hover:text-[var(--m-ink)] transition-colors">How it works</a>
          <a href="#features" className="hover:text-[var(--m-ink)] transition-colors">Features</a>
          <a href="/company" className="hover:text-[var(--m-ink)] transition-colors">For companies</a>
          <a href="/security" className="hover:text-[var(--m-ink)] transition-colors">Security</a>
        </nav>
        <div className="flex items-center gap-2">
          <a
            href="#get-started"
            className="hidden sm:inline-flex text-[13px] text-[var(--m-ink-2)] hover:text-[var(--m-ink)] px-3 py-1.5 transition-colors"
          >
            Sign in
          </a>
          <a href="#get-started" className="btn-primary">
            Start free
          </a>
        </div>
      </div>
    </header>
  );
}

/* ============================ HERO ============================ */

function Hero({
  sp,
  googleSignIn,
}: {
  sp: { auth_error?: string };
  googleSignIn: (() => Promise<void>) | null;
}) {
  return (
    <section className="relative max-w-6xl mx-auto px-6 pt-14 pb-16 md:pt-20 md:pb-24">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
        <div className="lg:col-span-6 min-w-0">
          <Reveal>
            <p className="inline-flex items-center gap-2 text-[12px] tracking-wide uppercase text-[var(--m-ink-3)] mb-5">
              <span className="relative inline-flex">
                <span className="absolute inset-0 rounded-full bg-[var(--m-accent)]/40 m-slow-pulse" />
                <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-[var(--m-accent)]" />
              </span>
              Free · for individual engineers
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="font-display text-[42px] md:text-[60px] leading-[1.02] tracking-tight text-[var(--m-ink)]">
              Get credit for the
              <br />
              work you{" "}
              <span className="italic brand-gradient-text">actually do.</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-xl text-[16px] md:text-[18px] leading-snug text-[var(--m-ink-2)] font-medium">
              Marina quietly turns your real work into a private journal &mdash; and a review &amp; 1:1
              packet you can paste straight into your next performance review.
              <span className="block mt-1.5 text-[var(--m-ink-3)] font-normal text-[15px]">
                Never walk into a review empty-handed again. No manager, no team, no spreadsheet.
              </span>
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div id="get-started" className="mt-8 scroll-mt-28">
              <LandingClient authError={sp.auth_error ?? null} googleSignIn={googleSignIn} />
            </div>
            <p className="mt-5 text-[12.5px] text-[var(--m-ink-3)] flex items-center gap-2 flex-wrap">
              {["Free forever for individuals", "Private to you by default", "Yours to keep"].map((t, i) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  {i > 0 && <span className="text-[var(--m-ink-5)] mr-1">·</span>}
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="text-[var(--m-good)]">
                    <path d="M5 13l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {t}
                </span>
              ))}
            </p>
          </Reveal>
        </div>

        <Reveal delay={320} className="lg:col-span-6 min-w-0">
          <ReviewPacketMock />
        </Reveal>
      </div>
    </section>
  );
}

/** A static, on-brand mock of the review packet — the product, shown up front. */
function ReviewPacketMock() {
  return (
    <div className="relative">
      <div
        className="absolute -inset-5 rounded-[26px] -z-10 m-float"
        style={{
          background:
            "linear-gradient(135deg, rgba(63,107,84,0.12) 0%, rgba(196,123,86,0.08) 50%, rgba(193,154,77,0.10) 100%)",
        }}
      />
      <div className="relative rounded-[18px] bg-white border border-[var(--m-border)] shadow-[var(--m-shadow-xl)] p-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[var(--m-clay-deep)]">
            Your review packet · last 90 days
          </p>
          <span className="text-[10.5px] text-[var(--m-ink-4)]">Copy ⧉</span>
        </div>
        <p className="font-display text-[20px] leading-snug text-[var(--m-ink)]">
          I led the payments reliability push and shipped the new checkout flow.
        </p>
        <ul className="mt-4 space-y-2.5">
          {[
            ["Cut checkout errors 40%", "Reworked the retry + idempotency path (acme/api)"],
            ["Shipped the new checkout UI", "12 PRs merged across web + mobile"],
            ["Unblocked the team", "18 reviews given — most on the payments migration"],
          ].map(([t, d]) => (
            <li key={t} className="flex items-start gap-2.5">
              <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--m-accent)]" />
              <p className="text-[13px] text-[var(--m-ink)] leading-snug">
                <span className="font-semibold">{t}</span>
                <span className="text-[var(--m-ink-3)]"> — {d}</span>
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {["Payments", "Reliability", "Code review"].map((t) => (
            <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--m-clay-soft)] text-[var(--m-clay-deep)]">
              {t}
            </span>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-[var(--m-border-soft)] flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--m-ink-3)] tabular-nums">
          <span><span className="font-semibold text-[var(--m-ink-2)]">142</span> commits</span>
          <span><span className="font-semibold text-[var(--m-ink-2)]">23</span> PRs (18 merged)</span>
          <span><span className="font-semibold text-[var(--m-ink-2)]">31</span> reviews</span>
          <span><span className="font-semibold text-[var(--m-ink-2)]">5</span> repos</span>
        </div>
        <p className="mt-3 text-[10.5px] text-[var(--m-ink-4)] text-center">
          Generated from your real GitHub activity — never invented.
        </p>
      </div>
    </div>
  );
}

/* ============================ HOW IT WORKS ============================ */

function HowItWorks() {
  const steps: Array<{ n: string; title: string; body: string }> = [
    { n: "1", title: "Connect GitHub", body: "One click. Marina reads your commits, PRs and reviews — nothing else, and only yours." },
    { n: "2", title: "Marina writes your journal", body: "Your work is summarised into a private, searchable record — including the reviews and fixes that usually go uncredited." },
    { n: "3", title: "Generate your packet", body: "At review or 1:1 time, turn any window into an evidence-backed summary you can paste in. Receipts included." },
  ];
  return (
    <section id="how" className="max-w-6xl mx-auto px-6 py-16 md:py-20">
      <Reveal>
        <div className="max-w-2xl">
          <p className="text-[11px] tracking-[0.18em] uppercase text-[var(--m-accent)] font-medium mb-3">How it works</p>
          <h2 className="font-display text-[34px] md:text-[46px] leading-[1.04] tracking-tight text-[var(--m-ink)]">
            From your real work to{" "}
            <span className="italic brand-gradient-text">your next promotion.</span>
          </h2>
        </div>
      </Reveal>
      <div className="mt-12 grid md:grid-cols-3 gap-5">
        {steps.map((s, i) => (
          <Reveal key={s.n} delay={i * 100}>
            <div className="h-full rounded-2xl border border-[var(--m-border)] bg-white p-6 shadow-[var(--m-shadow-sm)]">
              <span className="inline-flex w-9 h-9 rounded-xl bg-[var(--m-accent-soft)] text-[var(--m-accent-2)] items-center justify-center font-display text-[18px]">
                {s.n}
              </span>
              <h3 className="font-display text-[22px] leading-tight text-[var(--m-ink)] mt-4">{s.title}</h3>
              <p className="text-[14px] text-[var(--m-ink-2)] leading-relaxed mt-2">{s.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ============================ FEATURES ============================ */

function Features() {
  const items: Array<{ eyebrow: string; title: string; body: string; tone: "sage" | "clay" | "gold" }> = [
    {
      eyebrow: "Work journal",
      title: "Everything you did, remembered for you.",
      body: "A private timeline of your commits, PRs, reviews and focus — auto-written, searchable, and yours forever. No more \"what did I even do last quarter?\"",
      tone: "sage",
    },
    {
      eyebrow: "Review & 1:1 packet",
      title: "Walk into any review with receipts.",
      body: "Turn any date range into an evidence-backed accomplishments doc — highlights, themes, the numbers — ready to paste into a review, a 1:1, or a brag doc.",
      tone: "clay",
    },
    {
      eyebrow: "Focus tracking",
      title: "See where your time actually goes.",
      body: "Add the desktop agent and Marina shows your focus vs. distractions and your peak hours — entirely private to you, never your employer.",
      tone: "gold",
    },
  ];
  const dot = { sage: "var(--m-accent)", clay: "var(--m-clay)", gold: "var(--m-gold)" };
  return (
    <section id="features" className="bg-[var(--m-bg-soft)] border-y border-[var(--m-border)]">
      <div className="max-w-6xl mx-auto px-6 py-16 md:py-24">
        <Reveal>
          <div className="max-w-2xl mb-12">
            <p className="text-[11px] tracking-[0.18em] uppercase text-[var(--m-clay)] font-medium mb-3">What you get</p>
            <h2 className="font-display text-[34px] md:text-[48px] leading-[1.04] tracking-tight text-[var(--m-ink)]">
              Your work, finally{" "}
              <span className="italic brand-gradient-text">on the record.</span>
            </h2>
          </div>
        </Reveal>
        <div className="grid md:grid-cols-3 gap-5 items-stretch">
          {items.map((it, i) => (
            <Reveal key={it.eyebrow} delay={i * 100} className="h-full">
              <div className="h-full rounded-2xl p-7 border border-[var(--m-border)] bg-white shadow-[var(--m-shadow-sm)] relative overflow-hidden lift-on-hover">
                <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-40" style={{ background: dot[it.tone] }} />
                <p className="text-[10.5px] tracking-[0.18em] uppercase font-semibold relative" style={{ color: dot[it.tone] }}>
                  {it.eyebrow}
                </p>
                <h3 className="mt-4 font-display text-[23px] leading-tight text-[var(--m-ink)] relative">{it.title}</h3>
                <p className="mt-2 text-[14px] text-[var(--m-ink-2)] leading-relaxed relative">{it.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================ TRUST BAND ============================ */

function TrustBand() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-14 md:py-16">
      <Reveal>
        <div className="rounded-2xl border border-[var(--m-border)] bg-white p-7 md:p-9">
          <p className="text-[11px] tracking-[0.18em] uppercase text-[var(--m-accent)] font-medium mb-3">Yours, and only yours</p>
          <h2 className="font-display text-[26px] md:text-[32px] leading-tight tracking-tight text-[var(--m-ink)] max-w-2xl">
            This isn&rsquo;t monitoring. It&rsquo;s your career, documented.
          </h2>
          <ul className="mt-6 grid sm:grid-cols-2 gap-x-8 gap-y-3">
            {[
              "Private by default — nothing is shared with anyone unless you choose to.",
              "Works with zero employer involvement — no admin, no company account.",
              "Your data and your journal stay yours, even if you change jobs.",
              "Free forever for individuals. Connect in under a minute.",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-[14px] text-[var(--m-ink-2)] leading-snug">
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="mt-0.5 shrink-0 text-[var(--m-accent)]">
                  <path d="M5 13l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </section>
  );
}

/* ============================ FINAL CTA ============================ */

function FinalCta() {
  return (
    <section className="relative isolate overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{ background: "linear-gradient(135deg, #1f3d2c 0%, #2f5240 35%, #3f6b54 65%, #c19a4d 100%)" }}
      />
      <div className="max-w-4xl mx-auto px-6 py-20 md:py-24 text-center text-white">
        <Reveal>
          <h2 className="font-display text-[36px] md:text-[52px] leading-[1.02] tracking-tight">
            Start getting credit
            <br />
            <span className="italic">for your work.</span>
          </h2>
          <p className="mt-5 text-[15px] md:text-[17px] text-white/85 max-w-xl mx-auto leading-relaxed">
            Connect GitHub and see your last 90 days written up in under a minute. Free, private, yours.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4">
            <a href="#get-started" className="inline-flex items-center gap-2 bg-white text-[var(--m-ink)] hover:bg-white/95 px-6 py-3 rounded-lg text-[14.5px] font-semibold shadow-lg transition">
              Start free
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <p className="text-[12.5px] text-white/70">
              Are you a manager or HR?{" "}
              <a href="/company" className="underline underline-offset-2 hover:text-white">See Marina for teams →</a>
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ============================ FOOTER ============================ */

function Footer() {
  return (
    <footer className="border-t border-[var(--m-border)] bg-[var(--m-bg)]">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="font-display text-[17px] text-[var(--m-ink)] tracking-tight">MARINA</span>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-[var(--m-ink-3)]">
          <a href="#how" className="hover:text-[var(--m-ink)]">How it works</a>
          <a href="#features" className="hover:text-[var(--m-ink)]">Features</a>
          <a href="/company" className="hover:text-[var(--m-ink)]">For companies</a>
          <a href="/security" className="hover:text-[var(--m-ink)]">Security</a>
          <a href="/privacy" className="hover:text-[var(--m-ink)]">Privacy</a>
        </nav>
        <p className="text-[12px] text-[var(--m-ink-4)]">© {new Date().getFullYear()} Project MARINA</p>
      </div>
    </footer>
  );
}

/* ============================ LOGO ============================ */

function Logo() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.svg" width={28} height={28} alt="" aria-hidden className="block object-contain" />
  );
}
