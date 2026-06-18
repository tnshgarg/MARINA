'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Initial = {
  name: string
  hasSlack: boolean
  holidayRegion: string
  avatarMode: 'hero' | 'photo'
  workdayStartHour: number
  workdayEndHour: number
  plan: 'free' | 'team' | 'scale'
  trialEndsAt: string | null
  logoUrl: string | null
  leavePolicy: Record<string, number> | null
}

export default function OrgSettingsClient({
  orgId,
  initial,
  regions,
}: {
  orgId: number
  initial: Initial
  regions: Array<{ key: string; label: string }>
}) {
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [slackWebhook, setSlackWebhook] = useState('')
  const [hasSlack, setHasSlack] = useState(initial.hasSlack)
  const [region, setRegion] = useState(initial.holidayRegion)
  const [avatarMode, setAvatarMode] = useState<'hero' | 'photo'>(initial.avatarMode)
  const [workStart, setWorkStart] = useState(initial.workdayStartHour)
  const [workEnd, setWorkEnd] = useState(initial.workdayEndHour)
  const [casualDays, setCasualDays] = useState(initial.leavePolicy?.casual ?? 12)
  const [sickDays, setSickDays] = useState(initial.leavePolicy?.sick ?? 12)
  const [earnedDays, setEarnedDays] = useState(initial.leavePolicy?.earned ?? 15)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  async function save(patch: Record<string, unknown>, label: string) {
    setBusy(label)
    setError(null)
    try {
      const res = await fetch(`/api/orgs/${orgId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'failed')
      setSavedAt(new Date())
      router.refresh()
      return true
    } catch (e) {
      setError(String(e))
      return false
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Org name */}
      <section className="rounded-xl border border-[var(--m-border)] bg-white p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-[13.5px] font-semibold text-[var(--m-ink)]">Workspace name</h2>
            <p className="mt-1 text-[12.5px] text-[var(--m-ink-3)]">Shown in the sidebar and on email invites.</p>
          </div>
          <button
            className="px-3 py-1.5 rounded-md bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white text-[12.5px] font-medium disabled:opacity-50 transition"
            disabled={busy !== null || name.trim() === initial.name}
            onClick={() => save({ name }, 'name')}
          >
            {busy === 'name' ? 'Saving…' : 'Save'}
          </button>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
          className="input mt-4"
        />
      </section>

      {/* Workspace logo */}
      <OrgLogoSection orgId={orgId} initialLogoUrl={initial.logoUrl} />

      {/* Slack notifications */}
      <section className="rounded-xl border border-[var(--m-border)] bg-white p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-[13.5px] font-semibold text-[var(--m-ink)]">Slack notifications</h2>
            <p className="mt-1 text-[12.5px] text-[var(--m-ink-3)]">
              Get pinged when employees take a break, request leave, or flag themselves blocked.
              {hasSlack && <span className="ml-1 text-emerald-600 font-medium">· Configured</span>}
            </p>
          </div>
        </div>
        <label className="app-eyebrow block mt-4 mb-1">Incoming webhook URL</label>
        <input
          type="url"
          value={slackWebhook}
          onChange={(e) => setSlackWebhook(e.target.value)}
          placeholder="https://hooks.slack.com/services/T00.../B00.../..."
          className="input"
        />
        <p className="mt-2 text-[12px] text-[var(--m-ink-3)]">
          Create one at <code>api.slack.com/apps</code> → your app → Incoming Webhooks → Add. Paste the URL above.
        </p>
        <div className="flex gap-2 mt-3">
          <button
            className="px-3 py-1.5 rounded-md bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white text-[12.5px] font-medium disabled:opacity-50 transition"
            disabled={busy !== null || slackWebhook.trim().length === 0}
            onClick={async () => {
              const ok = await save({ slackWebhookUrl: slackWebhook }, 'slack')
              if (ok) {
                setSlackWebhook('')
                setHasSlack(true)
              }
            }}
          >
            {busy === 'slack' ? 'Saving…' : hasSlack ? 'Replace webhook' : 'Connect Slack'}
          </button>
          {hasSlack && (
            <button
              className="btn-bad"
              disabled={busy !== null}
              onClick={async () => {
                if (!confirm('Disconnect Slack notifications?')) return
                const ok = await save({ slackWebhookUrl: null }, 'slack-disconnect')
                if (ok) setHasSlack(false)
              }}
            >
              {busy === 'slack-disconnect' ? 'Disconnecting…' : 'Disconnect'}
            </button>
          )}
        </div>
      </section>

      {/* Holiday region */}
      <section className="rounded-xl border border-[var(--m-border)] bg-white p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-[13.5px] font-semibold text-[var(--m-ink)]">Public holiday calendar</h2>
            <p className="mt-1 text-[12.5px] text-[var(--m-ink-3)]">Seeds the leave + insights views with India national + state holidays.</p>
          </div>
          <button
            className="px-3 py-1.5 rounded-md bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white text-[12.5px] font-medium disabled:opacity-50 transition"
            disabled={busy !== null || region === initial.holidayRegion}
            onClick={() => save({ holidayRegion: region }, 'region')}
          >
            {busy === 'region' ? 'Saving…' : 'Save'}
          </button>
        </div>
        <select value={region} onChange={(e) => setRegion(e.target.value)} className="select mt-4 max-w-xs">
          {regions.map((r) => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>
      </section>

      {/* Leave policy — annual paid-leave allowance per type. Drives the
          balance shown to employees when they request leave. */}
      <section className="rounded-xl border border-[var(--m-border)] bg-white p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-[13.5px] font-semibold text-[var(--m-ink)]">Leave policy</h2>
            <p className="mt-1 text-[12.5px] text-[var(--m-ink-3)]">
              Annual paid-leave allowance per type (in days). Employees see their remaining balance only when requesting leave.
            </p>
          </div>
          <button
            className="px-3 py-1.5 rounded-md bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white text-[12.5px] font-medium disabled:opacity-50 transition"
            disabled={busy !== null}
            onClick={() =>
              save(
                { leavePolicy: { casual: casualDays, sick: sickDays, earned: earnedDays } },
                'leavePolicy',
              )
            }
          >
            {busy === 'leavePolicy' ? 'Saving…' : 'Save'}
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 max-w-md">
          {([
            ['Casual', casualDays, setCasualDays],
            ['Sick', sickDays, setSickDays],
            ['Earned', earnedDays, setEarnedDays],
          ] as const).map(([label, val, setVal]) => (
            <div key={label}>
              <label className="text-[11px] uppercase tracking-wide text-[var(--m-ink-3)] font-medium block mb-1">{label}</label>
              <input
                type="number"
                min={0}
                max={365}
                value={val}
                onChange={(e) => setVal(Math.max(0, Math.min(365, Number(e.target.value) || 0)))}
                className="input w-full"
              />
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11.5px] text-[var(--m-ink-4)]">
          This is the workspace default. Per-employee overrides are coming next.
        </p>
      </section>

      {/* Avatar mode */}
      <section className="rounded-xl border border-[var(--m-border)] bg-white p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-[13.5px] font-semibold text-[var(--m-ink)]">Avatar style</h2>
            <p className="mt-1 text-[12.5px] text-[var(--m-ink-3)]">Choose how teammates appear across dashboards.</p>
          </div>
          <button
            className="px-3 py-1.5 rounded-md bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white text-[12.5px] font-medium disabled:opacity-50 transition"
            disabled={busy !== null || avatarMode === initial.avatarMode}
            onClick={() => save({ avatarMode }, 'avatar')}
          >
            {busy === 'avatar' ? 'Saving…' : 'Save'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4 max-w-md">
          <label className={`cursor-pointer rounded-xl border p-4 transition-all ${avatarMode === 'hero' ? 'border-[var(--m-accent)] bg-[var(--m-accent-soft)]' : 'border-[var(--m-border)] hover:border-[var(--m-border)]'}`}>
            <input
              type="radio"
              name="avatar"
              value="hero"
              checked={avatarMode === 'hero'}
              onChange={() => setAvatarMode('hero')}
              className="sr-only"
            />
            <p className="text-[14px] font-medium text-[var(--m-ink)]">Pixel hero</p>
            <p className="text-[12px] text-[var(--m-ink-3)] mt-1">Iron Man, Spider-Man, etc. Fun for Gen-Z teams.</p>
          </label>
          <label className={`cursor-pointer rounded-xl border p-4 transition-all ${avatarMode === 'photo' ? 'border-[var(--m-accent)] bg-[var(--m-accent-soft)]' : 'border-[var(--m-border)] hover:border-[var(--m-border)]'}`}>
            <input
              type="radio"
              name="avatar"
              value="photo"
              checked={avatarMode === 'photo'}
              onChange={() => setAvatarMode('photo')}
              className="sr-only"
            />
            <p className="text-[14px] font-medium text-[var(--m-ink)]">GitHub photo</p>
            <p className="text-[12px] text-[var(--m-ink-3)] mt-1">Real profile pictures. Better for enterprise HR.</p>
          </label>
        </div>
      </section>

      {/* Workday */}
      <section className="rounded-xl border border-[var(--m-border)] bg-white p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-[13.5px] font-semibold text-[var(--m-ink)]">Workday hours</h2>
            <p className="mt-1 text-[12.5px] text-[var(--m-ink-3)]">Used to flag punch-ins / punch-outs outside the expected window.</p>
          </div>
          <button
            className="px-3 py-1.5 rounded-md bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white text-[12.5px] font-medium disabled:opacity-50 transition"
            disabled={busy !== null || (workStart === initial.workdayStartHour && workEnd === initial.workdayEndHour)}
            onClick={() => save({ workdayStartHour: workStart, workdayEndHour: workEnd }, 'workday')}
          >
            {busy === 'workday' ? 'Saving…' : 'Save'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4 max-w-sm">
          <div>
            <label className="app-eyebrow block mb-1">Start hour</label>
            <select value={workStart} onChange={(e) => setWorkStart(Number(e.target.value))} className="select">
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{i}:00</option>
              ))}
            </select>
          </div>
          <div>
            <label className="app-eyebrow block mb-1">End hour</label>
            <select value={workEnd} onChange={(e) => setWorkEnd(Number(e.target.value))} className="select">
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{i}:00</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Plan & Billing — currently just the early-bird redemption surface.
          A fuller billing UI (invoices, change plan) will land alongside the
          Razorpay subscription flow; for now the most-asked-for piece is the
          promo code box for founding-customer free access. */}
      <PlanAndBilling orgId={orgId} plan={initial.plan} trialEndsAt={initial.trialEndsAt} />

      {savedAt && !error && (
        <p className="text-[12px] text-emerald-600">Saved at {savedAt.toLocaleTimeString()}</p>
      )}
      {error && <p className="text-[12px] text-rose-600">{error}</p>}
    </div>
  )
}

function PlanAndBilling({
  orgId,
  plan,
  trialEndsAt,
}: {
  orgId: number
  plan: 'free' | 'team' | 'scale'
  trialEndsAt: string | null
}) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const planLabel = plan === 'free' ? 'Free' : plan === 'team' ? 'Team' : 'Scale'
  const expiry = trialEndsAt ? new Date(trialEndsAt) : null
  const lifetime = plan !== 'free' && trialEndsAt === null

  async function redeem(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/orgs/${orgId}/billing/redeem-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'failed')
      if (data.ok) {
        setSuccess(data.message)
        setCode('')
        router.refresh()
      } else {
        setError(data.message || 'Could not redeem code.')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-xl border border-[var(--m-border)] bg-white p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[13.5px] font-semibold text-[var(--m-ink)]">Plan &amp; billing</h2>
          <p className="mt-1 text-[12.5px] text-[var(--m-ink-3)]">
            You&rsquo;re currently on{' '}
            <span className="font-medium text-[var(--m-ink)]">{planLabel}</span>
            {lifetime
              ? ' — free forever (founding-customer grant).'
              : expiry
                ? ` until ${expiry.toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}.`
                : '.'}
          </p>
        </div>
      </div>

      {/* Early-bird code redemption. Tucked inside a <details> so it doesn't
          dominate the page — but discoverable for the customers we hand
          codes to. */}
      <details className="mt-4 group" open={plan === 'free'}>
        <summary className="cursor-pointer text-[12.5px] text-[var(--m-ink-2)] hover:text-[var(--m-ink)] select-none list-none flex items-center gap-1.5">
          <svg
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="transition-transform group-open:rotate-90"
          >
            <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Have an early-bird code?
        </summary>

        <form onSubmit={redeem} className="mt-3 flex gap-2 max-w-md">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="MARINA50"
            maxLength={64}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="input flex-1 tracking-widest font-mono uppercase"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || code.trim().length < 3}
            className="px-3.5 py-1.5 rounded-md bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white text-[12.5px] font-medium disabled:opacity-50 transition whitespace-nowrap"
          >
            {busy ? 'Checking…' : 'Redeem'}
          </button>
        </form>
        <p className="mt-2 text-[11.5px] text-[var(--m-ink-3)]">
          We hand these to design partners and our first 50 organisations. If you&rsquo;ve been
          promised one but lost it, email{' '}
          <a href="mailto:thetanishgarg@gmail.com" className="text-[var(--m-ink-2)] underline">
            thetanishgarg@gmail.com
          </a>
          .
        </p>

        {success && (
          <p className="mt-3 text-[12.5px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
            {success}
          </p>
        )}
        {error && (
          <p className="mt-3 text-[12.5px] text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}
      </details>
    </section>
  )
}

/**
 * Workspace logo upload — owner-only. Lives in its own section above the
 * Slack / Holidays / Workday cards. The chosen file goes to the shared
 * `/api/uploads/org-logo` endpoint; the URL is persisted on `orgs.logoUrl`
 * and picked up by the sidebar on the next render.
 */
function OrgLogoSection({
  orgId,
  initialLogoUrl,
}: {
  orgId: number
  initialLogoUrl: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(initialLogoUrl)
  const fileRef = useRef<HTMLInputElement>(null)

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('orgId', String(orgId))
      const res = await fetch('/api/uploads/org-logo', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'upload failed')
      setPreview(data.url)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <section className="rounded-xl border border-[var(--m-border)] bg-white p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[13.5px] font-semibold text-[var(--m-ink)]">Workspace logo</h2>
          <p className="mt-1 text-[12.5px] text-[var(--m-ink-3)]">
            Replaces the brand mark in the sidebar for everyone in this workspace. SVG, PNG,
            WebP or JPEG up to 3 MB.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 flex-wrap">
        <div className="w-14 h-14 rounded-xl bg-white border border-[var(--m-border)] flex items-center justify-center overflow-hidden">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Logo preview" className="w-full h-full object-contain" />
          ) : (
            <span className="text-[10.5px] text-[var(--m-ink-4)]">No logo</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="px-3 py-1.5 rounded-md bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white text-[12.5px] font-medium disabled:opacity-50 transition"
        >
          {busy ? 'Uploading…' : preview ? 'Replace logo' : 'Upload logo'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={upload}
          className="hidden"
        />
      </div>

      {error && <p className="mt-3 text-[12px] text-rose-600">{error}</p>}
    </section>
  )
}
