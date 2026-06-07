export const metadata = { title: 'Security · MARINA' }

export default function SecurityPage() {
  return (
    <>
      <h1 className="text-[28px] font-semibold text-slate-900 mb-2">Security at MARINA</h1>
      <p className="text-[12px] text-slate-500 mb-8">Last updated: 6 June 2026</p>

      <p>
        Our customers trust us with employee-level data. We treat security as a first-class
        engineering concern. This page is the honest version — what&apos;s in place today, what we&apos;re
        actively building, and what is explicitly out of scope.
      </p>

      <h2 className="text-[18px] font-semibold mt-8 mb-2">Today</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>All traffic over TLS 1.3.</li>
        <li>Bearer tokens (agent + API): generated as 32 random bytes, stored only as SHA-256 hash. Plaintext is never persisted server-side.</li>
        <li>Mac agent local token: encrypted via Electron <code>safeStorage</code> (macOS Keychain).</li>
        <li>Pairing codes: 40-bit entropy, single-use, 10-minute TTL, SHA-256-hashed at rest.</li>
        <li>Rate limiting on every agent endpoint (sliding window per token).</li>
        <li>Audit log of every privileged action (member invite, member remove, leave decision, device revocation, org settings change, account deletion).</li>
        <li>Append-only screenshot retention: raw images auto-deleted after 48 hours; only AI-derived labels persist.</li>
        <li>Role-based access: owner / manager / member. Members can&apos;t see other members&apos; data.</li>
        <li>Workplace surveillance consent gate on agent install — recorded with timestamp + IP + policy version.</li>
        <li>Auto-pause when paused or off-clock — sampler and screenshotter stop server-discarded if late.</li>
      </ul>

      <h2 className="text-[18px] font-semibold mt-8 mb-2">In flight</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>SOC 2 Type 1 — engaged Sprinto, target Q4 2026.</li>
        <li>Google Workspace + Microsoft Entra SSO for the Scale tier.</li>
        <li>Apple Developer Program code-signing + notarization for the Mac DMG.</li>
        <li>India-region data residency option (AWS Mumbai) under custom contract.</li>
        <li>Bug bounty via security.txt — disclosure to <code>security@marina.in</code>, response within 24h.</li>
      </ul>

      <h2 className="text-[18px] font-semibold mt-8 mb-2">Out of scope (intentionally)</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Covert surveillance. Every observability feature has explicit on-device consent.</li>
        <li>Keylogging or file content scraping.</li>
        <li>On-prem deployment (we don&apos;t support air-gapped installs at v1).</li>
      </ul>

      <h2 className="text-[18px] font-semibold mt-8 mb-2">Reporting</h2>
      <p>
        Disclose vulnerabilities to <code>security@marina.in</code>. We commit to:
      </p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Acknowledging receipt within 24 hours.</li>
        <li>Assigning severity and timeline within 5 business days.</li>
        <li>Crediting researchers in our security disclosure page (with consent).</li>
      </ul>

      <p className="mt-6">
        See also: <a href="/privacy">/privacy</a> · <a href="/dpa">/dpa</a> · <a href="/sub-processors">/sub-processors</a>
      </p>
    </>
  )
}
