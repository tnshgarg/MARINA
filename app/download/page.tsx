import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Download MARINA · Mac + Windows desktop agent',
  description:
    'Download the MARINA desktop agent for Mac (Apple Silicon + Intel) or Windows 10/11. The agent runs in the menubar, handles punch-in/out, focus tracking, and integrates with the web dashboard.',
}

/**
 * Public download page. Two cards — Mac + Windows — each with a direct
 * download link, system requirements, and the first-time install steps.
 *
 * URLs are read from env so the build deployment can swap in the latest
 * artifact without a code change. Defaults point at the canonical
 * download host (marina.team/download/...) for documentation / preview
 * builds.
 */
export default function DownloadPage() {
  // Real download URLs live in env so we can swap the artifact host without a
  // code change (GitHub Releases, Vercel Blob, S3 etc.). When unset — which is
  // the case during early-access — we render a "Notify me" CTA instead of a
  // broken link, since the binaries aren't published yet.
  const macUrl = process.env.NEXT_PUBLIC_MAC_DOWNLOAD_URL ?? null
  const winUrl = process.env.NEXT_PUBLIC_WIN_DOWNLOAD_URL ?? null
  const version = process.env.NEXT_PUBLIC_AGENT_VERSION ?? '0.9.0 (beta)'
  const releasedAt = process.env.NEXT_PUBLIC_AGENT_RELEASED_AT ?? 'soon'

  return (
    <main className="min-h-screen paper text-[var(--m-ink)]">
      <Nav />

      <section className="max-w-5xl mx-auto px-6 pt-16 pb-12 text-center">
        <p className="text-[11px] tracking-[0.18em] uppercase text-[var(--m-clay)] font-medium">
          Desktop agent · v{version}
        </p>
        <h1 className="mt-4 font-display text-[40px] md:text-[56px] leading-[1.05] tracking-tight">
          Bring MARINA to your{' '}
          <span className="italic brand-gradient-text">desktop</span>
        </h1>
        <p className="mt-5 max-w-2xl mx-auto text-[15px] md:text-[16px] text-[var(--m-ink-2)] leading-relaxed">
          A tiny menubar app. Punch in, mark work as done, log breaks, and let MARINA
          watch focus time — without ever filling a status form.
        </p>
        <p className="mt-3 text-[11.5px] text-[var(--m-ink-4)]">
          Released {releasedAt} · macOS 13+ and Windows 10/11 · Free — no account needed to install.
        </p>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="grid md:grid-cols-2 gap-5">
          {/* macOS */}
          <PlatformCard
            tone="sage"
            title="MARINA for Mac"
            sub="Apple Silicon (M-series) + Intel · Universal 2 binary"
            requirements={[
              'macOS 13 Ventura or later · Apple Silicon or Intel',
              'About 250 MB of disk space',
              'Accessibility permission (macOS asks on first run)',
            ]}
            steps={[
              'Download the DMG and drag Marina to your Applications folder.',
              "First launch: right-click Marina → Open, then click Open to confirm (it's an independent build, so macOS asks once).",
              'If macOS says the app is "damaged", open Terminal and run  xattr -cr /Applications/Marina.app  then open it again.',
              'Click the leaf icon in the menubar → Pair this device, and enter the 6-digit code from Settings → Devices on the web app.',
            ]}
            url={macUrl}
            buttonLabel="Download for Mac"
            buttonHint=".dmg · Universal 2 (Apple Silicon + Intel)"
            icon={<AppleIcon />}
          />

          {/* Windows */}
          <PlatformCard
            tone="clay"
            title="MARINA for Windows (beta)"
            sub="Windows 10 / 11 · x64"
            requirements={[
              'Windows 10 (1809) or Windows 11 · 64-bit',
              'About 120 MB of disk space',
              'Tracks apps, focus, idle & locked time — no extra permissions',
            ]}
            steps={[
              'Download MARINA-Setup.exe and run it.',
              'Windows SmartScreen will warn (we\'re not code-signed yet): click "More info" → "Run anyway".',
              'MARINA starts in your system tray (bottom-right, click the ^ to expand).',
              'Right-click the leaf icon → Pair this device, then enter the 6-digit code from Settings → Devices on the web app.',
            ]}
            url={winUrl}
            buttonLabel="Download for Windows"
            buttonHint=".exe · x64 · Windows 10/11"
            icon={<WindowsIcon />}
          />
        </div>

        <section className="mt-12 grid md:grid-cols-3 gap-4">
          <Pillar
            label="Lightweight"
            body="Single binary, lives in the menubar / system tray. Less than 0.2% CPU at idle."
          />
          <Pillar
            label="Private by default"
            body="Window titles are off by default. No screen capture. Pause anytime."
          />
          <Pillar
            label="Cross-platform"
            body="Mac today, with Windows in beta — same shortcuts, same break dialog, same Done log."
          />
        </section>

        <section className="mt-12 rounded-2xl border border-[var(--m-border)] bg-[var(--m-bg-soft)] px-6 py-7 text-center">
          <p className="text-[11px] tracking-[0.18em] uppercase text-[var(--m-accent)] font-semibold">
            For HRs and managers
          </p>
          <h2 className="mt-2 font-display text-[24px] md:text-[28px] leading-tight">
            Print and share the employee setup guide
          </h2>
          <p className="mt-3 max-w-xl mx-auto text-[14px] text-[var(--m-ink-2)] leading-relaxed">
            A one-page handout with the install, pair, and first-day flow. Give it to every new
            hire so they&apos;re running by lunch on day one.
          </p>
          <Link
            href="/setup-guide"
            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white text-[14px] font-medium transition"
          >
            Open setup guide →
          </Link>
        </section>

        <section className="mt-12 max-w-2xl mx-auto text-center">
          <h3 className="font-display text-[20px] text-[var(--m-ink)] leading-tight">
            Need something else?
          </h3>
          <p className="mt-2 text-[13px] text-[var(--m-ink-3)] leading-relaxed">
            Linux build, custom MDM rollout, air-gapped install, or a Slack-only experience without
            the agent — drop us a line at{' '}
            <a href="mailto:thetanishgarg@gmail.com" className="text-[var(--m-accent)] hover:text-[var(--m-accent-2)]">
              thetanishgarg@gmail.com
            </a>{' '}
            and we&apos;ll point you the right way.
          </p>
        </section>
      </section>

      <Footer />
    </main>
  )
}

function PlatformCard({
  tone,
  title,
  sub,
  requirements,
  steps,
  url,
  buttonLabel,
  buttonHint,
  icon,
}: {
  tone: 'sage' | 'clay'
  title: string
  sub: string
  requirements: string[]
  steps: string[]
  url: string | null
  buttonLabel: string
  buttonHint: string
  icon: React.ReactNode
}) {
  const accent =
    tone === 'sage'
      ? { ring: 'border-[var(--m-accent)]/30', bg: 'bg-[var(--m-accent-soft)]/40', glow: 'var(--m-accent)' }
      : { ring: 'border-[var(--m-clay)]/30', bg: 'bg-[var(--m-clay-soft)]/40', glow: 'var(--m-clay)' }

  return (
    <article
      className={`rounded-2xl border ${accent.ring} bg-white p-6 shadow-[var(--m-shadow-sm)] relative overflow-hidden`}
    >
      <div
        aria-hidden
        className={`absolute -top-16 -right-16 w-40 h-40 rounded-full blur-3xl opacity-30 ${accent.bg}`}
        style={{ background: accent.glow }}
      />
      <div className="relative">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-10 h-10 rounded-xl bg-[var(--m-bg-soft)] inline-flex items-center justify-center text-[var(--m-ink)]">
            {icon}
          </span>
          <div>
            <h2 className="font-display text-[24px] leading-tight">{title}</h2>
            <p className="text-[12px] text-[var(--m-ink-3)] mt-0.5">{sub}</p>
          </div>
        </div>

        {url ? (
          <>
            <a
              href={url}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white text-[14px] font-medium transition w-full justify-center"
            >
              ↓ {buttonLabel}
            </a>
            <p className="mt-2 text-[11px] text-[var(--m-ink-4)] text-center">{buttonHint}</p>
          </>
        ) : (
          <>
            <a
              href={`mailto:thetanishgarg@gmail.com?subject=${encodeURIComponent(`Notify me when ${title} ships`)}&body=${encodeURIComponent(`Hi — please email me when the ${title} build is ready to download.`)}`}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white border-2 border-[var(--m-ink)] hover:bg-[var(--m-bg-soft)] text-[var(--m-ink)] text-[14px] font-medium transition w-full justify-center"
            >
              Notify me when it&apos;s ready
            </a>
            <p className="mt-2 text-[11px] text-[var(--m-ink-4)] text-center">
              Build in private beta · Public release coming
            </p>
          </>
        )}

        <div className="mt-5">
          <p className="text-[10.5px] tracking-[0.18em] uppercase text-[var(--m-ink-4)] font-semibold mb-2">
            System requirements
          </p>
          <ul className="space-y-1.5 text-[13px] text-[var(--m-ink-2)]">
            {requirements.map((r) => (
              <li key={r} className="flex items-start gap-2">
                <span className="mt-1.5 w-1 h-1 rounded-full bg-[var(--m-ink-5)] shrink-0" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5">
          <p className="text-[10.5px] tracking-[0.18em] uppercase text-[var(--m-ink-4)] font-semibold mb-2">
            First-time setup
          </p>
          <ol className="space-y-2 text-[13px] text-[var(--m-ink-2)]">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span
                  className="shrink-0 w-5 h-5 rounded-full inline-flex items-center justify-center text-[10.5px] font-semibold text-white tabular-nums"
                  style={{ background: accent.glow }}
                >
                  {i + 1}
                </span>
                <span className="leading-snug">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </article>
  )
}

function Pillar({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-xl border border-[var(--m-border)] bg-white p-4">
      <p className="text-[10.5px] tracking-[0.18em] uppercase text-[var(--m-accent)] font-semibold">{label}</p>
      <p className="mt-1.5 text-[13.5px] text-[var(--m-ink-2)] leading-relaxed">{body}</p>
    </div>
  )
}

function Nav() {
  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-[var(--m-bg)]/75 border-b border-[var(--m-border)]/50">
      <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" width={28} height={28} alt="MARINA" className="block object-contain" />
          <span className="font-display text-[18px] leading-none text-[var(--m-ink)] tracking-tight">MARINA</span>
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-[13.5px] text-[var(--m-ink-2)]">
          <Link href="/#product" className="hover:text-[var(--m-ink)] transition-colors">Product</Link>
          <Link href="/#pricing" className="hover:text-[var(--m-ink)] transition-colors">Early access</Link>
          <Link href="/download" className="text-[var(--m-ink)] font-medium">Download</Link>
          <Link href="/security" className="hover:text-[var(--m-ink)] transition-colors">Security</Link>
        </nav>
        <Link href="/" className="btn-primary">Sign in</Link>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="border-t border-[var(--m-border)] bg-[var(--m-bg)]">
      <div className="max-w-7xl mx-auto px-6 py-8 flex items-center justify-between flex-wrap gap-3 text-[11.5px] text-[var(--m-ink-4)]">
        <p>© 2026 Project MARINA Private Limited. All rights reserved.</p>
        <p>
          <Link href="/privacy" className="hover:text-[var(--m-ink)]">Privacy</Link>
          {' · '}
          <Link href="/security" className="hover:text-[var(--m-ink)]">Security</Link>
          {' · '}
          <a href="mailto:thetanishgarg@gmail.com" className="hover:text-[var(--m-ink)]">thetanishgarg@gmail.com</a>
        </p>
      </div>
    </footer>
  )
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 384 512" width="22" height="22" fill="currentColor" aria-hidden>
      <path d="M318 268c-1-69 56-103 59-105-32-47-82-53-100-54-43-4-83 25-105 25-22 0-55-25-90-24-46 1-89 27-113 68-48 84-12 207 35 274 23 33 50 70 86 69 35-1 48-22 89-22 41 0 53 22 89 22 37-1 60-34 82-67 26-38 37-75 38-77-1-1-73-28-70-109zM254 80c19-23 32-55 28-87-28 1-62 19-82 41-18 20-34 53-30 84 31 2 63-16 84-38z" />
    </svg>
  )
}

function WindowsIcon() {
  return (
    <svg viewBox="0 0 448 512" width="22" height="22" fill="currentColor" aria-hidden>
      <path d="M0 93.7l183-25.2v177.4H0V93.7zm0 324.6l183 25.2V268.4H0v149.9zm203 28L448 480V268H203v178.3zm0-410v177.5h245V32L203 38.3z" />
    </svg>
  )
}
