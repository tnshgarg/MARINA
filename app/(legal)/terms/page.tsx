export const metadata = { title: 'Terms of Service · MARINA' }

export default function TermsPage() {
  return (
    <>
      <h1 className="text-[28px] font-semibold text-slate-900 mb-2">Terms of Service</h1>
      <p className="text-[12px] text-slate-500 mb-8">Last updated: 6 June 2026</p>

      <p>
        These Terms govern your use of <strong>Project MARINA</strong>. By creating an account, paying for the
        Service, or installing the agent, you accept these Terms. If you&apos;re accepting on behalf of an
        organization, you confirm you have authority to bind that organization.
      </p>

      <h2 className="text-[18px] font-semibold mt-8 mb-2">1. The Service</h2>
      <p>
        MARINA provides an AI-assisted workforce intelligence platform: a web dashboard plus
        Mac/Windows agents for activity sampling, punch-in/out, break and leave management, and
        AI-generated narratives + verification.
      </p>

      <h2 className="text-[18px] font-semibold mt-8 mb-2">2. Acceptable use</h2>
      <p>You agree NOT to:</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Install or run the agent on a device whose user has not explicitly consented in the agent&apos;s on-device flow.</li>
        <li>Use the Service to monitor any person who is not your employee or contractor under a written agreement.</li>
        <li>Attempt to reverse-engineer, scrape, or circumvent the Service.</li>
        <li>Resell or sublicense the Service without a separate written agreement with us.</li>
      </ul>

      <h2 className="text-[18px] font-semibold mt-8 mb-2">3. Customer responsibilities</h2>
      <p>
        You are the Data Fiduciary under India&apos;s DPDP Act. You are responsible for:
      </p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Notifying employees that MARINA is in use and obtaining lawful basis (typically a signed Acceptable Use Policy — we provide a template).</li>
        <li>Configuring optional features (window titles, screenshots) in compliance with your local laws and any applicable works-council requirements.</li>
        <li>Promptly removing offboarded employees and revoking devices.</li>
      </ul>

      <h2 className="text-[18px] font-semibold mt-8 mb-2">4. Fees and payment</h2>
      <p>
        Pricing is published at <a href="/pricing">marina.in/pricing</a>. Invoices are issued by
        Project MARINA Private Limited (GSTIN: TBD) at 18% GST. Annual prepay receives a discount.
        Late payments accrue interest at 1.5% per month.
      </p>

      <h2 className="text-[18px] font-semibold mt-8 mb-2">5. Termination</h2>
      <p>
        Either party may terminate for convenience with 30 days&apos; notice. We retain the right
        to suspend the Service for material breach (e.g., non-payment, abuse) on 7 days&apos; notice.
        On termination, your data is retained for 30 days then permanently erased.
      </p>

      <h2 className="text-[18px] font-semibold mt-8 mb-2">6. Warranties and disclaimers</h2>
      <p>
        The Service is provided &quot;as is&quot;. We don&apos;t guarantee that AI-generated narratives
        or verification scores are accurate — they are decision-support outputs, not authoritative
        labels. Customers must apply human judgement before acting on them.
      </p>

      <h2 className="text-[18px] font-semibold mt-8 mb-2">7. Liability</h2>
      <p>
        Subject to applicable law, our total liability for any claim is limited to the fees you
        paid in the 12 months preceding the event. We exclude liability for indirect,
        consequential, or punitive damages.
      </p>

      <h2 className="text-[18px] font-semibold mt-8 mb-2">8. Governing law</h2>
      <p>
        These Terms are governed by the laws of India. Exclusive jurisdiction is the courts of
        Bengaluru, Karnataka.
      </p>

      <p className="mt-8 text-[13px] text-slate-500">
        Questions? Email <code>legal@marina.in</code>.
      </p>
    </>
  )
}
