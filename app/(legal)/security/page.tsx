import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Security · MARINA',
  description:
    "How MARINA protects your team's data — encryption, tenant isolation, access control, and India DPDP compliance.",
}

export default function SecurityPage() {
  return (
    <>
      <p className="text-[11px] tracking-[0.2em] uppercase text-[var(--m-accent)] font-semibold mb-3">
        Security overview
      </p>
      <h1 className="font-display text-[40px] md:text-[52px] leading-[1.05] tracking-tight text-[var(--m-ink)]">
        We take security <span className="italic">like it's our day job</span>
      </h1>
      <p className="mt-5 text-[16px] text-[var(--m-ink-2)] leading-relaxed">
        Engineering teams trust MARINA with their most sensitive signals — what
        their developers shipped, who's blocked, what they did during the day.
        Here's exactly how we protect that.
      </p>

      <Pillar
        title="Encryption everywhere"
        body={[
          'TLS 1.3 in transit. AES-256-GCM at rest (Neon-managed). Browser-to-server traffic uses HSTS with a 1-year max-age.',
          'Agent + API bearer tokens are 32 random bytes, stored only as SHA-256 hashes. Plaintext is never persisted server-side. The Mac agent encrypts its local token via macOS Keychain (Electron safeStorage).',
          'Pairing codes: 40-bit entropy, single-use, 10-minute TTL, hashed at rest.',
        ]}
      />

      <Pillar
        title="Tenant isolation"
        body={[
          "Every read from user-level data tables is scoped to the org's active-membership window. A teammate in two orgs can never leak data across them, even on shared GitHub events.",
          'Every API route runs through `requireMembership(orgId, minRole)` before touching data. Integration tests verify boundaries hold on every deploy.',
        ]}
      />

      <Pillar
        title="Privacy-respecting tracking"
        body={[
          'The Mac/Windows agent samples application focus every 30s. Window titles are off by default — opt-in per org. No keystroke logging, ever.',
          'Disclosed-randomized screenshots: 2–4 per active hour, with a visible flash. Each is auto-deleted after 48 hours; only AI-derived labels persist.',
          'Tracking only runs between punch-in and punch-out. Pausing is a single click. Workplace-surveillance consent is recorded with timestamp + IP + policy version on agent install.',
        ]}
      />

      <Pillar
        title="Access control + audit"
        body={[
          'Three roles: owner, manager, member. Members never see other members\' data. Managers see the team dashboard, decide leaves, view analytics. Only owners can change org settings or remove members.',
          'Single Sign-On with Google Workspace and Microsoft 365 on the Scale tier. SCIM provisioning on request.',
          'Every privileged action — leave decision, member removal, role change, billing change, settings change — writes to an immutable audit log retained for 7 years.',
        ]}
      />

      <Pillar
        title="Vulnerability handling"
        body={[
          'Submit security reports to thetanishgarg@gmail.com. We acknowledge within 24 hours and patch high-severity issues within 7 days.',
          'Automated dependency scans on every commit (Dependabot + npm audit). Annual penetration tests.',
        ]}
      />

      <Pillar
        title="Compliance"
        body={[
          'Digital Personal Data Protection Act 2023 (India): compliant by design. Data Principal rights (access, correction, erasure) are self-service in the app.',
          'SOC 2 Type 1 audit in progress with Sprinto · target Q4 2026.',
          'India-region data residency available on the Scale tier (Neon Mumbai).',
        ]}
      />

      <div className="mt-12 rounded-2xl border border-[var(--m-border)] bg-white p-6 shadow-[var(--m-shadow-sm)]">
        <h3 className="font-display text-[20px] text-[var(--m-ink)] mb-2">
          Need our DPA, SOC 2 letter, or sub-processor list?
        </h3>
        <p className="text-[14px] text-[var(--m-ink-2)] leading-relaxed">
          Email{' '}
          <a className="text-[var(--m-accent)] underline" href="mailto:thetanishgarg@gmail.com">
            thetanishgarg@gmail.com
          </a>
          . We typically respond within one business day. Self-serve downloads coming Q1 2026.
        </p>
      </div>

      <div className="mt-6 grid sm:grid-cols-2 gap-3">
        <ContactCard title="thetanishgarg@gmail.com" body="Vulnerability reports + security questions" />
        <ContactCard title="thetanishgarg@gmail.com" body="Data protection officer (DPDP § 10)" />
      </div>
    </>
  )
}

function Pillar({ title, body }: { title: string; body: string[] }) {
  return (
    <section className="mt-12">
      <h2 className="font-display text-[28px] text-[var(--m-ink)] tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3">
        {body.map((p, i) => (
          <p key={i} className="text-[14.5px] text-[var(--m-ink-2)] leading-relaxed">
            {p}
          </p>
        ))}
      </div>
    </section>
  )
}

function ContactCard({ title, body }: { title: string; body: string }) {
  return (
    <a
      href={`mailto:${title}`}
      className="rounded-xl border border-[var(--m-border)] bg-white p-4 hover:border-[var(--m-ink-4)] transition"
    >
      <p className="font-mono text-[13.5px] text-[var(--m-ink)]">{title}</p>
      <p className="text-[12px] text-[var(--m-ink-3)] mt-0.5">{body}</p>
    </a>
  )
}
