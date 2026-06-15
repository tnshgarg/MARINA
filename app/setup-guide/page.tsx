import Link from 'next/link'
import type { Metadata } from 'next'
import SetupGuidePrintButton from './print-button'

export const metadata: Metadata = {
  title: 'MARINA · Employee setup guide',
  description:
    'Print-ready employee setup guide for the MARINA desktop agent. Share this with new hires on day one.',
}

/**
 * Printable employee setup guide. The page is designed for browser
 * print-to-PDF (⌘P → Save as PDF). All chrome — header, footer, navigation
 * — is hidden in print via the `.no-print` class.
 *
 * Linked from the public /download page AND from the in-product Teams
 * page so managers can hand it to new hires either way.
 */
export default function SetupGuidePage() {
  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .guide-page { padding: 0 !important; box-shadow: none !important; border: 0 !important; }
        }
        @page { size: A4; margin: 16mm; }
      `}</style>

      {/* Toolbar — hidden in print */}
      <div className="no-print sticky top-0 z-20 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
            Employee setup guide
          </p>
          <p className="text-[13px] text-slate-800">Print this and hand it to every new hire on day one.</p>
        </div>
        <div className="flex items-center gap-2">
          <SetupGuidePrintButton />
          <Link
            href="/download"
            className="px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[12.5px] font-medium transition"
          >
            ← Download page
          </Link>
        </div>
      </div>

      <div className="bg-[var(--m-bg)] min-h-screen py-6">
        <article className="guide-page max-w-[820px] mx-auto bg-white border border-slate-200 rounded-md shadow-sm p-12 text-slate-900">
          {/* Letterhead */}
          <div className="flex items-center gap-3 pb-5 mb-6 border-b border-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" width={36} height={36} alt="" className="block object-contain" />
            <div>
              <p className="font-display text-[26px] leading-tight text-slate-900">
                MARINA
              </p>
              <p className="text-[11.5px] text-slate-500">AI Chief of Staff · Employee setup guide</p>
            </div>
          </div>

          <p className="font-display text-[26px] leading-tight">Welcome to MARINA.</p>
          <p className="mt-3 text-[14px] text-slate-800 leading-relaxed">
            This guide gets the desktop agent running on your work computer. It takes about
            <strong> 10 minutes</strong> end-to-end and only needs to be done once per device.
          </p>

          <hr className="my-6 border-slate-200" />

          <Section title="What MARINA does">
            <ul className="text-[13.5px] text-slate-800 space-y-1.5 leading-relaxed">
              <li>· You get credit for what you ship — the agent watches focus time, apps, breaks.</li>
              <li>· You don&apos;t write status updates — MARINA drafts them from your real activity.</li>
              <li>· Standups stop wasting time — Scrum Mode pre-fills yesterday / today / blockers.</li>
              <li>· One click when you&apos;re stuck — your manager sees blockers instantly.</li>
            </ul>
            <p className="mt-3 text-[12.5px] text-slate-600 leading-relaxed">
              <strong>What it does NOT do:</strong> read your messages, emails, files, or browser history.
              No screenshots unless you explicitly opt in. No tracking outside your working hours.
              You can pause anytime.
            </p>
          </Section>

          <Section title="Before you start">
            <p className="text-[13.5px] text-slate-800 leading-relaxed">You&apos;ll need:</p>
            <ul className="mt-2 text-[13.5px] text-slate-800 space-y-1 list-disc pl-5 leading-relaxed">
              <li>A Mac (macOS 13 Ventura or later) <strong>or</strong> a Windows 10/11 PC.</li>
              <li>Your work email — the same one your HR used to invite you.</li>
              <li>About 10 minutes.</li>
            </ul>
          </Section>

          <Section title="Step 1 — Accept your invite (3 min)">
            <ol className="text-[13.5px] text-slate-800 space-y-1.5 list-decimal pl-5 leading-relaxed">
              <li>Find the email titled <em>“You&apos;re invited to join [Workspace] on MARINA”</em>.</li>
              <li>Click <strong>Open your workspace</strong>.</li>
              <li>Choose a sign-in method: GitHub (engineers), Google (Workspace teams), or email magic link.</li>
              <li>Pick a character avatar — your teammates spot you across the product. You can change it anytime.</li>
              <li>Fill in: discipline, job title, joining date, and (optional) birthday.</li>
            </ol>
          </Section>

          <Section title="Step 2 — Install the desktop agent (4 min)">
            <div className="grid grid-cols-2 gap-5 mt-1">
              <div>
                <p className="text-[12px] uppercase tracking-wider font-semibold text-[var(--m-accent)]">
                  On Mac
                </p>
                <ol className="mt-1.5 text-[12.5px] text-slate-800 space-y-1 list-decimal pl-5 leading-snug">
                  <li>Download <strong>MARINA.dmg</strong> from <code className="font-mono text-[11.5px] bg-slate-100 px-1 rounded">marina.in/download</code>.</li>
                  <li>Open the DMG and drag MARINA.app to Applications.</li>
                  <li>Open it once — click <strong>Open</strong> on the Gatekeeper prompt.</li>
                  <li>Grant <strong>Accessibility</strong> (System Settings → Privacy &amp; Security → Accessibility).</li>
                  <li>The MARINA leaf appears in your menubar (top right).</li>
                </ol>
              </div>
              <div>
                <p className="text-[12px] uppercase tracking-wider font-semibold text-[var(--m-clay-deep)]">
                  On Windows
                </p>
                <ol className="mt-1.5 text-[12.5px] text-slate-800 space-y-1 list-decimal pl-5 leading-snug">
                  <li>Download <strong>MARINA-Setup.exe</strong> from <code className="font-mono text-[11.5px] bg-slate-100 px-1 rounded">marina.in/download</code>.</li>
                  <li>Run the installer. Click <strong>Yes</strong> on SmartScreen if it appears.</li>
                  <li>MARINA starts in the system tray (bottom right, click <strong>^</strong> to expand).</li>
                  <li>Pin it to the tray: right-click the tray → Taskbar settings → toggle MARINA on.</li>
                </ol>
              </div>
            </div>
          </Section>

          <Section title="Step 3 — Pair the agent (1 min)">
            <ol className="text-[13.5px] text-slate-800 space-y-1.5 list-decimal pl-5 leading-relaxed">
              <li>Click the MARINA leaf icon — it says <em>“Not paired yet”</em>.</li>
              <li>Click <strong>Pair this device</strong>. A 6-digit code appears (valid for 5 min).</li>
              <li>On the web at <code className="font-mono text-[11.5px] bg-slate-100 px-1 rounded">app.marina.in</code>, open <strong>Settings → Devices</strong>.</li>
              <li>Click <strong>Pair new device</strong>, type the code, hit <strong>Pair</strong>.</li>
              <li>The agent says <strong>“Paired — welcome, [your name]”</strong>. You&apos;re set.</li>
            </ol>
          </Section>

          <Section title="Step 4 — Your first day (2 min)">
            <p className="text-[13.5px] text-slate-800 leading-relaxed">
              The shortcuts that matter (right-click the leaf icon to see the full menu):
            </p>
            <table className="mt-2 w-full text-[12.5px]">
              <tbody>
                <ShortcutRow keys="⌘⇧L / Ctrl+Shift+L" what="Mark work as done — quick deliverable log" />
                <ShortcutRow keys="⌘⇧B / Ctrl+Shift+B" what="Take a break (Coffee / Lunch / Personal / Blocked)" />
                <ShortcutRow keys="⌘⇧P / Ctrl+Shift+P" what="Pause tracking temporarily" />
                <ShortcutRow keys="⌘⇧M / Ctrl+Shift+M" what="Show today&apos;s meetings" />
                <ShortcutRow keys="⌘↩ / Ctrl+Enter" what="Join your next meeting" />
                <ShortcutRow keys="⌘⇧/ / Ctrl+Shift+/" what="Show all shortcuts" />
              </tbody>
            </table>
            <p className="mt-3 text-[12.5px] text-slate-600 leading-relaxed">
              Your day: punch in when you open your laptop · log deliverables with ⌘⇧L when you finish
              something · mark yourself blocked if you&apos;re stuck · punch out at end of day.
            </p>
          </Section>

          <Section title="Optional but recommended">
            <ul className="text-[13.5px] text-slate-800 space-y-1.5 list-disc pl-5 leading-relaxed">
              <li><strong>Connect Google Calendar</strong> — see meetings in the agent.</li>
              <li><strong>Connect GitHub</strong> (engineers) — PRs and commits show up automatically.</li>
              <li><strong>Set working days</strong> — for hybrid / 4-day weeks.</li>
              <li><strong>Quiet hours</strong> — MARINA queues notifications outside your window.</li>
            </ul>
          </Section>

          <Section title="What your manager sees">
            <div className="grid grid-cols-2 gap-5 text-[12.5px] leading-relaxed">
              <div>
                <p className="font-semibold text-[var(--m-good)] mb-1">Yes</p>
                <ul className="space-y-1 list-disc pl-5 text-slate-800">
                  <li>Punch in / out times</li>
                  <li>Focus % during your shift</li>
                  <li>App categories you used</li>
                  <li>What you marked as done</li>
                  <li>Working / paused / blocked / off state</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-[var(--m-bad)] mb-1">No</p>
                <ul className="space-y-1 list-disc pl-5 text-slate-800">
                  <li>Messages, emails, document contents</li>
                  <li>Window titles or URLs (unless opted in)</li>
                  <li>Screenshots (unless opted in)</li>
                  <li>Anything during pause or off-hours</li>
                </ul>
              </div>
            </div>
          </Section>

          <Section title="Help">
            <p className="text-[12.5px] text-slate-700 leading-relaxed">
              · Can&apos;t sign in or pair? Email <code className="font-mono text-[11.5px] bg-slate-100 px-1 rounded">thetanishgarg@gmail.com</code> — we usually reply within an hour during IST business hours.<br />
              · Found a bug? Desktop agent menu → <em>Report an issue</em> — logs attach automatically.<br />
              · Security / privacy questions? <code className="font-mono text-[11.5px] bg-slate-100 px-1 rounded">thetanishgarg@gmail.com</code> · <code className="font-mono text-[11.5px] bg-slate-100 px-1 rounded">thetanishgarg@gmail.com</code>
            </p>
          </Section>

          <hr className="my-6 border-slate-200" />
          <p className="text-[11px] text-slate-400 text-center">
            We hope MARINA makes your work life better. If anything feels off, tell us — we ship
            fixes weekly. — The MARINA team
          </p>
        </article>
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 break-inside-avoid">
      <h2 className="font-display text-[18px] text-[var(--m-ink)] leading-tight mb-2">{title}</h2>
      {children}
    </section>
  )
}

function ShortcutRow({ keys, what }: { keys: string; what: string }) {
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="py-1.5 pr-3 font-mono text-[11.5px] text-slate-700 whitespace-nowrap w-44">
        {keys}
      </td>
      <td className="py-1.5 text-slate-800">{what}</td>
    </tr>
  )
}
