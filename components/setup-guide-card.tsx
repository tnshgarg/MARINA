'use client'

/**
 * Onboarding cheat card for managers ("Manager toolkit"). Two columns:
 *   1. Print-ready employee setup guide (links to /setup-guide which has a
 *      "Download as PDF" button at the top).
 *   2. Direct download links for the Mac + Windows desktop agent so the
 *      manager can copy-paste them into Slack / email.
 *
 * Lives on the Members page — that's where managers onboard people, so the
 * setup guide + agent download links belong next to the roster and invites.
 */
export function SetupGuideCard() {
  return (
    <section className="mb-5 rounded-xl border border-[var(--m-border)] bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--m-border-soft)]">
        <p className="text-[11px] uppercase tracking-wider text-[var(--m-accent)] font-semibold">
          Manager toolkit
        </p>
        <p className="text-[13.5px] font-semibold text-[var(--m-ink)] mt-0.5">
          Get your team onto the desktop agent
        </p>
        <p className="text-[12px] text-[var(--m-ink-3)] mt-0.5">
          Print the setup guide or copy the download links into your onboarding email.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[var(--m-border-soft)]">
        {/* Setup guide */}
        <div className="p-4">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-lg bg-[var(--m-accent-soft)] inline-flex items-center justify-center text-[var(--m-accent)] shrink-0">
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path d="M4 4h12l4 4v12H4z" />
                <path d="M14 4v6h6M8 14h8M8 18h5" strokeLinecap="round" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[var(--m-ink)]">Employee setup guide</p>
              <p className="text-[12px] text-[var(--m-ink-3)] mt-0.5 leading-snug">
                One-page handout — invite → install → pair → first day. Print or save as PDF
                and hand to every new hire.
              </p>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <a
                  href="/setup-guide"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 rounded-md bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white text-[12px] font-medium transition"
                >
                  Open guide
                </a>
                <a
                  href="/setup-guide"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] text-[var(--m-ink-2)] hover:text-[var(--m-ink)] font-medium"
                >
                  Print → Save as PDF
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* App download */}
        <div className="p-4">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-lg bg-[var(--m-clay-soft)] inline-flex items-center justify-center text-[var(--m-clay-deep)] shrink-0">
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[var(--m-ink)]">Desktop agent download</p>
              <p className="text-[12px] text-[var(--m-ink-3)] mt-0.5 leading-snug">
                Direct links you can paste into Slack or email. The agent runs in the menubar
                / system tray — Mac + Windows.
              </p>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <a
                  href="/download"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 rounded-md bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white text-[12px] font-medium transition"
                >
                  Open download page
                </a>
                <button
                  type="button"
                  onClick={() => {
                    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://marina.team'
                    void navigator.clipboard?.writeText(`${origin}/download`)
                  }}
                  className="text-[12px] text-[var(--m-ink-2)] hover:text-[var(--m-ink)] font-medium"
                >
                  Copy share link
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
