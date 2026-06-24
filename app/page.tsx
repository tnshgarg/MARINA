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
 *
 * Built to the same depth/polish as /company: a dark proof strip, a
 * product-forward section with a real mockup, an alternating feature showcase
 * with real product surfaces, a Without/With pain section, and an FAQ — so an
 * individual "gets it" in one scroll instead of reading abstract cards.
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
      <ProofStrip />
      <ProductSection />
      <ShowcaseSection />
      <PainSection />
      <HowItWorks />
      <TrustBand />
      <Faq />
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
          <a href="#product" className="hover:text-[var(--m-ink)] transition-colors">Product</a>
          <a href="#features" className="hover:text-[var(--m-ink)] transition-colors">Features</a>
          <a href="#how" className="hover:text-[var(--m-ink)] transition-colors">How it works</a>
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
                  <CheckIcon />
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

/* ============================ PROOF STRIP ============================ */

/**
 * Dark band of outcome numbers, right under the hero — the individual's payoff,
 * stated as digits. Mirrors /company's ProofStrip so the two pages feel like
 * one product.
 */
function ProofStrip() {
  const stats: Array<{ value: string; suffix?: string; label: string; tone: "sage" | "clay" | "gold" | "ink" }> = [
    { value: "90", suffix: "days", label: "Of your work, written up in one click", tone: "sage" },
    { value: "0", label: "Forms, standups or spreadsheets to keep", tone: "clay" },
    { value: "1", suffix: "min", label: "From connect to your first packet", tone: "gold" },
    { value: "100", suffix: "%", label: "Yours — private, and it leaves with you", tone: "ink" },
  ];
  return (
    <section className="relative bg-[var(--m-ink)] text-white overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 opacity-30"
        style={{ background: "radial-gradient(40% 60% at 50% 50%, rgba(63,107,84,0.5), transparent 70%)" }}
      />
      <div className="relative max-w-6xl mx-auto px-6 py-14 md:py-20">
        <Reveal>
          <p className="text-[10.5px] tracking-[0.22em] uppercase text-white/60 font-medium mb-2 text-center">
            Your work, by the numbers
          </p>
          <h2 className="font-display text-[26px] md:text-[34px] leading-tight tracking-tight text-center max-w-3xl mx-auto">
            What you get the moment you connect.
          </h2>
        </Reveal>
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 90}>
              <ProofStat {...s} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProofStat({ value, suffix, label, tone }: { value: string; suffix?: string; label: string; tone: "sage" | "clay" | "gold" | "ink" }) {
  const color = tone === "sage" ? "#a8d3b9" : tone === "clay" ? "#e8b89a" : tone === "gold" ? "#f5d488" : "#ffffff";
  return (
    <div className="text-center md:text-left">
      <p className="font-display tracking-tight leading-none" style={{ color }}>
        <span className="text-[56px] md:text-[80px]">{value}</span>
        {suffix && <span className="text-[20px] md:text-[28px] ml-1 opacity-90">{suffix}</span>}
      </p>
      <p className="mt-3 text-[13px] md:text-[14px] text-white/70 leading-snug max-w-[210px] mx-auto md:mx-0">
        {label}
      </p>
    </div>
  );
}

/* ============================ PRODUCT SECTION ============================ */

function ProductSection() {
  return (
    <section id="product" className="scroll-mt-20 bg-[var(--m-bg-soft)] border-y border-[var(--m-border)]">
      <div className="max-w-6xl mx-auto px-6 py-20 md:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-5 min-w-0">
            <p className="text-[11px] tracking-[0.18em] uppercase text-[var(--m-clay)] font-medium mb-4">
              This is the product
            </p>
            <h2 className="font-display text-[32px] md:text-[44px] leading-[1.1] tracking-tight">
              Someone asks &ldquo;what did you do?&rdquo; &mdash;{" "}
              <span className="italic brand-gradient-text">it&rsquo;s already written.</span>
            </h2>
            <p className="mt-5 text-[15px] text-[var(--m-ink-2)] leading-relaxed">
              No forms, no end-of-day scramble. Marina reads your real signals &mdash; GitHub, your
              calendar, the deliverables you log &mdash; and assembles a clean, grounded update for any
              window. Copy it to Slack, export a PDF, or paste it into your review. Never invented.
            </p>
            <ul className="mt-6 space-y-2.5 text-[13.5px] text-[var(--m-ink-2)]">
              <Bullet>Real PR titles &amp; commit subjects, not just counts</Bullet>
              <Bullet>Meetings, with who you met &mdash; pulled from your calendar</Bullet>
              <Bullet>The reviews &amp; fixes that usually go uncredited</Bullet>
            </ul>
          </div>
          <div className="lg:col-span-7 min-w-0">
            <UpdateMock />
          </div>
        </div>
      </div>
    </section>
  );
}

/** The generated status update — the wedge feature, shown as the real surface. */
function UpdateMock() {
  return (
    <div className="rounded-2xl bg-white border border-[var(--m-border)] shadow-[var(--m-shadow-lg)] p-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <p className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[var(--m-accent)]">
            Your update
          </p>
          <p className="font-display text-[19px] text-[var(--m-ink)] leading-tight mt-0.5">This week</p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="px-2.5 py-1 rounded-md bg-[var(--m-accent)] text-white font-medium">Copy for Slack</span>
          <span className="px-2.5 py-1 rounded-md border border-[var(--m-border)] text-[var(--m-ink-3)]">.md</span>
          <span className="px-2.5 py-1 rounded-md border border-[var(--m-border)] text-[var(--m-ink-3)]">PDF</span>
        </div>
      </div>

      <MockSection label="Pull requests">
        <MockLine badge="merged" badgeCls="bg-[var(--m-clay-soft)] text-[var(--m-clay-deep)]" text="Fix double-submit on checkout" meta="acme/web" />
        <MockLine badge="open" badgeCls="bg-[var(--m-good-soft)] text-[var(--m-good)]" text="Add idempotency keys to payments" meta="acme/api" />
      </MockSection>

      <MockSection label="Commits">
        <MockLine text="Bump react to 19.2 + migrate compiler" />
        <MockLine text="Retry logic for failed charges" />
      </MockSection>

      <MockSection label="Reviews given">
        <MockLine badge="review" badgeCls="bg-[var(--m-accent-soft)] text-[var(--m-accent-2)]" text="Refactor auth middleware" meta="acme/api" />
      </MockSection>

      <MockSection label="Meetings">
        <MockLine text="Payments sync — with Priya Nair, Dev Shah" meta="45m" />
      </MockSection>

      <MockSection label="Other deliverables" last>
        <MockLine text="Shipped checkout redesign" link="acme/web/pull/482" />
      </MockSection>

      <p className="mt-4 pt-3 border-t border-[var(--m-border-soft)] text-[11.5px] text-[var(--m-ink-3)] tabular-nums">
        <span className="font-semibold text-[var(--m-ink-2)]">31</span> commits ·{" "}
        <span className="font-semibold text-[var(--m-ink-2)]">6</span> PRs ·{" "}
        <span className="font-semibold text-[var(--m-ink-2)]">9</span> reviews ·{" "}
        <span className="font-semibold text-[var(--m-ink-2)]">4</span> meetings
      </p>
    </div>
  );
}

function MockSection({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={last ? "" : "mb-3"}>
      <p className="text-[10px] tracking-[0.12em] uppercase font-semibold text-[var(--m-ink-4)] mb-1.5">{label}</p>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

function MockLine({ badge, badgeCls, text, meta, link }: { badge?: string; badgeCls?: string; text: string; meta?: string; link?: string }) {
  return (
    <li className="flex items-center gap-2 text-[12.5px]">
      {badge && (
        <span className={`shrink-0 text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full ${badgeCls}`}>
          {badge}
        </span>
      )}
      <span className="text-[var(--m-ink)] truncate">{text}</span>
      {link && <span className="text-[11px] text-[var(--m-accent)] truncate">↗ {link}</span>}
      {meta && <span className="ml-auto shrink-0 text-[11px] text-[var(--m-ink-4)] tabular-nums">{meta}</span>}
    </li>
  );
}

/* ============================ SHOWCASE ============================ */

/**
 * The feature gallery — every employee feature shown as the real surface, in
 * alternating layout, each with a verb-driven headline. This is what brings the
 * page to /company depth: visitors see the product, not adjectives.
 */
function ShowcaseSection() {
  const blocks: Array<{
    eyebrow: string;
    title: React.ReactNode;
    body: string;
    bullets: string[];
    mockup: React.ReactNode;
    flip?: boolean;
  }> = [
    {
      eyebrow: "Ask Marina · USP",
      title: (
        <>
          Ask anything about{" "}
          <span className="italic brand-gradient-text">your own work.</span>
        </>
      ),
      body: "Grounded in your real history — answers no generic chatbot can give, because it has never seen what you actually shipped.",
      bullets: [
        "“How many 1:1s with Priya last month?”",
        "Cites your commits, PRs and meetings",
        "Never invented — it only knows your data",
      ],
      mockup: <AskMock />,
    },
    {
      eyebrow: "Review & 1:1 packet",
      title: (
        <>
          Walk into any review{" "}
          <span className="italic brand-gradient-text">with receipts.</span>
        </>
      ),
      body: "Turn any date range into an evidence-backed accomplishments doc — highlights, themes, and the numbers, ready to paste.",
      bullets: [
        "Highlights + themes, written from evidence",
        "Counts the reviews & fixes that go uncredited",
        "Paste into a review, or keep a brag doc",
      ],
      mockup: <ReviewPacketMock />,
      flip: true,
    },
    {
      eyebrow: "Booking link",
      title: (
        <>
          Let anyone{" "}
          <span className="italic brand-gradient-text">grab time with you.</span>
        </>
      ),
      body: "Share one link, Calendly-style. Requests land on your dashboard to approve — accepting drops a Google Calendar invite with a Meet link straight into their inbox.",
      bullets: [
        "One link to share anywhere",
        "You approve every request",
        "Auto Google Calendar invite + Meet link",
      ],
      mockup: <BookingMock />,
    },
    {
      eyebrow: "Time & focus",
      title: (
        <>
          Punch in.{" "}
          <span className="italic brand-gradient-text">Track your own hours.</span>
        </>
      ),
      body: "One tap to start your day, right from the dashboard — no employer, no agent required. Your honest working hours, private to you.",
      bullets: [
        "Web punch in / out, a calm daily ritual",
        "Honest hours — nobody else sees them",
        "Flows into your weekly update automatically",
      ],
      mockup: <HoursMock />,
      flip: true,
    },
    {
      eyebrow: "Your contacts",
      title: (
        <>
          Everyone you work with,{" "}
          <span className="italic brand-gradient-text">one click to meet.</span>
        </>
      ),
      body: "Marina remembers who you meet with and surfaces your same-company colleagues — then lets you book a quick meeting with any of them in two clicks.",
      bullets: [
        "Built automatically from your meetings",
        "Same-company colleagues surfaced for you",
        "Quick-book a Google Meet in two clicks",
      ],
      mockup: <ContactsMock />,
    },
  ];

  return (
    <section id="features" className="bg-[var(--m-bg)]">
      <div className="max-w-6xl mx-auto px-6 py-20 md:py-28">
        <Reveal>
          <div className="max-w-2xl mb-14">
            <p className="text-[11px] tracking-[0.18em] uppercase text-[var(--m-clay)] font-medium mb-4">
              Everything in one place
            </p>
            <h2 className="font-display text-[40px] md:text-[56px] leading-[1.02] tracking-tight">
              Your work, finally{" "}
              <span className="italic brand-gradient-text">on the record.</span>
            </h2>
            <p className="mt-5 text-[15.5px] md:text-[16px] text-[var(--m-ink-2)] leading-relaxed">
              Every screen below is the real product &mdash; the surfaces you live in day to day. No
              stock art, no &ldquo;coming soon.&rdquo;
            </p>
          </div>
        </Reveal>

        <div className="space-y-16 md:space-y-24">
          {blocks.map((b, i) => (
            <Reveal key={i} delay={i * 80}>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
                <div className={`min-w-0 lg:col-span-5 ${b.flip ? "lg:order-2" : ""}`}>
                  <p className="text-[10.5px] tracking-[0.18em] uppercase text-[var(--m-accent)] font-semibold mb-3">
                    {b.eyebrow}
                  </p>
                  <h3 className="font-display text-[28px] md:text-[36px] leading-[1.08] tracking-tight text-[var(--m-ink)]">
                    {b.title}
                  </h3>
                  <p className="mt-4 text-[15px] text-[var(--m-ink-2)] leading-relaxed">{b.body}</p>
                  <ul className="mt-5 space-y-2.5 text-[13.5px] text-[var(--m-ink-2)]">
                    {b.bullets.map((bullet) => (
                      <Bullet key={bullet}>{bullet}</Bullet>
                    ))}
                  </ul>
                </div>
                <div className={`min-w-0 lg:col-span-7 ${b.flip ? "lg:order-1" : ""}`}>{b.mockup}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----- Showcase mockups ----- */

function AskMock() {
  return (
    <div className="rounded-2xl bg-white border border-[var(--m-border)] shadow-[var(--m-shadow-lg)] p-6">
      <div className="flex items-center gap-2.5 mb-4 pb-4 border-b border-[var(--m-border-soft)]">
        <span className="marina-pulse w-7 h-7 rounded-full bg-[var(--m-accent-soft)] inline-flex items-center justify-center">
          <span className="marina-pulse-core" />
          <span className="marina-pulse-ring" />
        </span>
        <p className="text-[13px] font-medium text-[var(--m-ink)]">Ask Marina</p>
        <span className="ml-auto text-[10.5px] text-[var(--m-ink-4)]">grounded in your data</span>
      </div>
      <div className="flex justify-end mb-3">
        <p className="max-w-[80%] text-[13px] bg-[var(--m-accent)] text-white rounded-2xl rounded-br-md px-3.5 py-2 leading-snug">
          How many 1:1s did I have with Priya last month, and what did we cover?
        </p>
      </div>
      <div className="flex justify-start">
        <div className="max-w-[88%] text-[13px] bg-[var(--m-bg-soft)] text-[var(--m-ink)] rounded-2xl rounded-bl-md px-3.5 py-2.5 leading-relaxed">
          You had <span className="font-semibold">4</span> meetings with Priya in May — all 30 min. The
          last was May 28 (&ldquo;Q3 planning&rdquo;). You also reviewed{" "}
          <span className="font-semibold">3</span> of her PRs on the payments migration.
          <span className="block mt-2 text-[11px] text-[var(--m-ink-4)]">
            From your calendar + GitHub — 7 sources cited.
          </span>
        </div>
      </div>
    </div>
  );
}

function BookingMock() {
  return (
    <div className="rounded-2xl bg-white border border-[var(--m-border)] shadow-[var(--m-shadow-lg)] p-6">
      <p className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[var(--m-accent)] mb-1">
        Your booking link
      </p>
      <div className="flex items-center gap-2 mb-5">
        <code className="flex-1 text-[12.5px] bg-[var(--m-bg-soft)] border border-[var(--m-border)] rounded-lg px-3 py-2 text-[var(--m-ink-2)] truncate">
          marina.team/book/aarav
        </code>
        <span className="text-[11px] px-2.5 py-2 rounded-lg border border-[var(--m-border)] text-[var(--m-ink-3)]">Copy</span>
      </div>
      <p className="text-[10.5px] tracking-[0.12em] uppercase font-semibold text-[var(--m-ink-4)] mb-2">
        Pending requests
      </p>
      <div className="rounded-xl border border-[var(--m-border)] p-3.5">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-full bg-[var(--m-clay-soft)] text-[var(--m-clay-deep)] inline-flex items-center justify-center text-[11px] font-semibold">RS</span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-[var(--m-ink)] font-medium leading-tight">Riya Sharma · 30 min</p>
            <p className="text-[11.5px] text-[var(--m-ink-3)]">Thursday, 3:00 PM · &ldquo;portfolio review&rdquo;</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="flex-1 text-center text-[12px] font-medium bg-[var(--m-accent)] text-white rounded-lg py-1.5">Accept &amp; send invite</span>
          <span className="text-[12px] text-[var(--m-ink-3)] border border-[var(--m-border)] rounded-lg px-3 py-1.5">Decline</span>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-[var(--m-ink-4)] text-center">
        Accepting sends a Google Calendar invite with a Meet link.
      </p>
    </div>
  );
}

function HoursMock() {
  return (
    <div className="rounded-2xl bg-white border border-[var(--m-border)] shadow-[var(--m-shadow-lg)] p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[var(--m-accent)]">Today</p>
          <p className="font-display text-[26px] text-[var(--m-ink)] leading-none mt-1 tabular-nums">3h 12m</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium px-2.5 py-1 rounded-full bg-[var(--m-good-soft)] text-[var(--m-good)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--m-good)] m-slow-pulse" />
          Working
        </span>
      </div>
      <div className="flex justify-between text-[9.5px] text-[var(--m-ink-4)] mb-1 tabular-nums">
        <span>9:30 AM</span>
        <span>now</span>
      </div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-[var(--m-bg-soft)]">
        <div style={{ width: "34%", background: "var(--m-accent)" }} />
        <div style={{ width: "10%", background: "var(--m-warn)" }} />
        <div style={{ width: "28%", background: "var(--m-accent)" }} />
        <div style={{ width: "28%", background: "var(--m-bg-soft)" }} />
      </div>
      <div className="mt-5 pt-4 border-t border-[var(--m-border-soft)] flex items-center justify-between">
        <div>
          <p className="text-[11.5px] text-[var(--m-ink-3)]">This week</p>
          <p className="font-display text-[20px] text-[var(--m-ink)] leading-none mt-0.5 tabular-nums">28h 40m</p>
        </div>
        <p className="text-[11px] text-[var(--m-ink-4)] flex items-center gap-1.5 max-w-[180px] text-right leading-snug">
          <LockIcon /> Private to you — never shared with anyone.
        </p>
      </div>
    </div>
  );
}

function ContactsMock() {
  const people: Array<{ name: string; meta: string; init: string; sage?: boolean }> = [
    { name: "Priya Nair", meta: "12 meetings", init: "PN", sage: true },
    { name: "Dev Shah", meta: "8 meetings", init: "DS", sage: true },
    { name: "Riya Sharma", meta: "5 meetings", init: "RS", sage: true },
  ];
  return (
    <div className="rounded-2xl bg-white border border-[var(--m-border)] shadow-[var(--m-shadow-lg)] p-6">
      <p className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[var(--m-accent)] mb-3">
        Your contacts
      </p>
      <ul className="space-y-1.5">
        {people.map((p) => (
          <li key={p.name} className="flex items-center gap-2.5 py-1">
            <span className="w-8 h-8 rounded-full bg-[var(--m-accent-soft)] text-[var(--m-accent-2)] inline-flex items-center justify-center text-[11px] font-semibold">{p.init}</span>
            <span className="text-[13.5px] text-[var(--m-ink)] flex-1">{p.name}</span>
            <span className="text-[11px] text-[var(--m-ink-4)]">{p.meta}</span>
            <span className="text-[11.5px] px-2.5 py-0.5 rounded-md border border-[var(--m-border)] text-[var(--m-accent)]">Book</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 pt-3 border-t border-[var(--m-border-soft)]">
        <p className="text-[10px] uppercase tracking-wider text-[var(--m-ink-4)] font-semibold mb-1.5">From acme.com</p>
        <li className="flex items-center gap-2.5 py-1 list-none">
          <span className="w-8 h-8 rounded-full bg-[var(--m-bg-soft)] text-[var(--m-ink-3)] inline-flex items-center justify-center text-[11px] font-semibold">AK</span>
          <span className="text-[13.5px] text-[var(--m-ink)] flex-1">Ankit Kumar</span>
          <span className="text-[11.5px] px-2.5 py-0.5 rounded-md border border-[var(--m-border)] text-[var(--m-accent)]">Book</span>
        </li>
      </div>
    </div>
  );
}

/* ============================ PAIN ============================ */

function PainSection() {
  return (
    <section className="relative isolate overflow-hidden bg-[var(--m-bg-soft)]/60 border-y border-[var(--m-border)]">
      <div className="max-w-6xl mx-auto px-6 py-20 md:py-24">
        <Reveal>
          <p className="text-[11px] tracking-[0.18em] uppercase text-[var(--m-clay-deep)] font-medium mb-3 text-center">
            Review season, right now
          </p>
          <h2 className="font-display text-[40px] md:text-[58px] leading-[1.02] tracking-tight text-center max-w-3xl mx-auto text-[var(--m-ink)]">
            Stop writing your wins
            <br />
            <span className="italic brand-gradient-text">from memory.</span>
          </h2>
        </Reveal>

        <div className="mt-14 grid md:grid-cols-2 gap-5 items-stretch">
          <Reveal delay={0} className="h-full">
            <article className="h-full rounded-2xl border border-[#f1d5d6] bg-[#fbf2f2]/60 p-7 md:p-9">
              <div className="flex items-center gap-2 mb-6">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--m-bad)] text-white text-[16px] font-bold">
                  ✕
                </span>
                <p className="text-[12px] uppercase tracking-[0.18em] text-[var(--m-bad)] font-semibold">Without Marina</p>
              </div>
              <ul className="space-y-4">
                <PainRow headline="Scramble the night before" sub="Trawling Slack and GitHub for what you did." />
                <PainRow headline="Forget half of Q1 by Q3" sub="The big ship from March? Gone." />
                <PainRow headline="Reviews fixes go uncredited" sub="The unglamorous work that held the team up." />
                <PainRow headline="Wins written from memory" sub="Vague bullets, no evidence." />
                <PainRow headline="Only the loud get noticed" sub="Quiet, steady impact stays invisible." />
              </ul>
              <p className="mt-7 text-[15px] text-[var(--m-bad)] font-semibold tracking-tight">
                You did the work. You can&rsquo;t prove it.
              </p>
            </article>
          </Reveal>

          <Reveal delay={120} className="h-full">
            <article className="h-full rounded-2xl border border-[var(--m-accent)]/40 bg-gradient-to-br from-[var(--m-accent-soft)]/50 to-white p-7 md:p-9 shadow-[var(--m-shadow-xl)] relative">
              <span className="absolute -top-3 right-6 text-[10.5px] tracking-[0.18em] uppercase font-semibold bg-[var(--m-accent)] text-white px-2.5 py-1 rounded-full">
                With Marina
              </span>
              <div className="flex items-center gap-2 mb-6">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--m-accent)] text-white">
                  <CheckIcon size={16} stroke={2.8} />
                </span>
                <p className="text-[12px] uppercase tracking-[0.18em] text-[var(--m-accent)] font-semibold">Receipts mode</p>
              </div>
              <ul className="space-y-4">
                <GainRow headline="Packet ready any day" sub="Any window, in one click." />
                <GainRow headline="Every ship logged" sub="The moment it happens — automatically." />
                <GainRow headline="Reviews & fixes counted" sub="Your real impact, surfaced." />
                <GainRow headline="Wins backed by evidence" sub="Cited, never invented." />
                <GainRow headline="Quiet impact, made visible" sub="The receipts speak for you." />
              </ul>
              <p className="mt-7 text-[15px] text-[var(--m-accent-2)] font-semibold tracking-tight">
                You did the work. Now you can show it.
              </p>
            </article>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function PainRow({ headline, sub }: { headline: string; sub: string }) {
  return (
    <li className="flex items-start gap-3">
      <span aria-hidden className="mt-2 shrink-0 inline-block w-2 h-2 rounded-full bg-[var(--m-bad)]" />
      <div className="leading-snug">
        <p className="text-[16px] font-semibold text-[var(--m-ink)] tracking-tight">{headline}</p>
        <p className="text-[12.5px] text-[var(--m-ink-3)] mt-0.5">{sub}</p>
      </div>
    </li>
  );
}
function GainRow({ headline, sub }: { headline: string; sub: string }) {
  return (
    <li className="flex items-start gap-3">
      <CheckIcon size={16} stroke={2.6} className="mt-1.5 shrink-0 text-[var(--m-accent)]" />
      <div className="leading-snug">
        <p className="text-[16px] font-semibold text-[var(--m-ink)] tracking-tight">{headline}</p>
        <p className="text-[12.5px] text-[var(--m-ink-3)] mt-0.5">{sub}</p>
      </div>
    </li>
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
    <section id="how" className="max-w-6xl mx-auto px-6 py-20 md:py-24">
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
            <div className="lift-on-hover h-full rounded-2xl border border-[var(--m-border)] bg-white p-6 shadow-[var(--m-shadow-sm)]">
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

/* ============================ TRUST BAND ============================ */

function TrustBand() {
  return (
    <section className="max-w-6xl mx-auto px-6 pb-16 md:pb-20">
      <Reveal>
        <div className="rounded-2xl border border-[var(--m-border)] bg-white p-7 md:p-9 shadow-[var(--m-shadow-sm)]">
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
                <CheckIcon size={16} stroke={2.4} className="mt-0.5 shrink-0 text-[var(--m-accent)]" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </section>
  );
}

/* ============================ FAQ ============================ */

function Faq() {
  const items: Array<{ q: string; a: string }> = [
    {
      q: "Is this monitoring me for my employer?",
      a: "No. Marina for individuals has zero employer involvement — there is no admin, no company account, and nobody else can see your data. It exists to give you a record of your own work.",
    },
    {
      q: "What does it actually read?",
      a: "Only what you connect: your GitHub activity (commits, PRs, reviews), your Google Calendar meetings, and the deliverables you log yourself. Nothing else, and only your own.",
    },
    {
      q: "Can it make things up?",
      a: "Never. Every update and packet is assembled deterministically from your real activity and cites its sources. Ask Marina answers only from your data — if it isn't in your history, Marina won't claim it.",
    },
    {
      q: "What happens if I change jobs?",
      a: "Your journal and data stay yours. Marina is tied to you, not your employer — your record leaves with you.",
    },
    {
      q: "Is it really free?",
      a: "Yes — free forever for individuals. No credit card, no trial clock. Connect GitHub and you'll see your last 90 days written up in under a minute.",
    },
  ];
  return (
    <section className="max-w-3xl mx-auto px-6 py-16 md:py-20">
      <Reveal>
        <div className="text-center mb-10">
          <p className="text-[11px] tracking-[0.18em] uppercase text-[var(--m-clay)] font-medium mb-3">FAQ</p>
          <h2 className="font-display text-[32px] md:text-[42px] leading-[1.05] tracking-tight text-[var(--m-ink)]">
            The honest answers.
          </h2>
        </div>
      </Reveal>
      <div className="space-y-3">
        {items.map((it, i) => (
          <Reveal key={it.q} delay={i * 60}>
            <details className="group rounded-2xl border border-[var(--m-border)] bg-white px-5 py-4 open:shadow-[var(--m-shadow-sm)]">
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none">
                <span className="text-[15px] font-medium text-[var(--m-ink)]">{it.q}</span>
                <span className="shrink-0 text-[var(--m-ink-4)] transition-transform group-open:rotate-45 text-[20px] leading-none">+</span>
              </summary>
              <p className="mt-3 text-[14px] text-[var(--m-ink-2)] leading-relaxed">{it.a}</p>
            </details>
          </Reveal>
        ))}
      </div>
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
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-40"
        style={{ background: "radial-gradient(50% 60% at 50% 25%, rgba(255,255,255,0.16), transparent 70%)" }}
      />
      <div className="max-w-4xl mx-auto px-6 py-20 md:py-28 text-center text-white">
        <Reveal>
          <h2 className="font-display text-[40px] md:text-[56px] leading-[1.02] tracking-tight">
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
              <ArrowIcon />
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

/* ============================ SHARED BITS ============================ */

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <svg width={16} height={16} viewBox="0 0 20 20" className="shrink-0 mt-0.5 text-[var(--m-accent)]" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="10" cy="10" r="8" />
        <path d="M6.5 10.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{children}</span>
    </li>
  );
}

function CheckIcon({ size = 14, stroke = 1.8, className = "text-[var(--m-good)]" }: { size?: number; stroke?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} className={className}>
      <path d="M5 13l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="shrink-0 text-[var(--m-ink-4)]" aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
    </svg>
  );
}

/* ============================ LOGO ============================ */

function Logo() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.svg" width={28} height={28} alt="" aria-hidden className="block object-contain" />
  );
}
