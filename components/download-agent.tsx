'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type OS = 'mac' | 'windows' | 'other'

/**
 * Device-aware "download + connect the Marina desktop agent" card. Detects the
 * visitor's OS and offers the single right installer, then walks them through
 * pairing right here: generate a code → open the app → it connects, and we
 * auto-detect the pairing (polling /api/me/devices) and refresh.
 *
 * Used on the employee dashboard (variant="employee" — "set yourself up") and
 * the manager dashboard (variant="manager" — "you install it, and so does your
 * team"). Render it only while the viewer has no paired device.
 */
export function DownloadAgent({
  macUrl,
  winUrl,
  version,
  variant = 'employee',
}: {
  macUrl: string | null
  winUrl: string | null
  version: string
  variant?: 'employee' | 'manager'
}) {
  const router = useRouter()
  const [detected, setDetected] = useState<OS>('other')
  const [override, setOverride] = useState<OS | null>(null)
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null)
  const [secsLeft, setSecsLeft] = useState(0)
  const [connected, setConnected] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // OS detection runs on the client only (avoids a hydration mismatch — the
  // server renders the neutral 'other' state, the client refines it).
  useEffect(() => {
    const s = `${navigator.userAgent} ${navigator.platform}`.toLowerCase()
    setDetected(/mac|iphone|ipad/.test(s) ? 'mac' : /win/.test(s) ? 'windows' : 'other')
  }, [])

  const os = override ?? detected

  // Pairing-code countdown.
  useEffect(() => {
    if (!pairing) return
    const tick = () => {
      const s = Math.max(0, Math.round((new Date(pairing.expiresAt).getTime() - Date.now()) / 1000))
      setSecsLeft(s)
      if (s <= 0) setPairing(null)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [pairing])

  // While a code is live, poll for the device showing up — that's "connected".
  useEffect(() => {
    if (!pairing || connected) return
    const id = setInterval(async () => {
      try {
        const d = (await fetch('/api/me/devices').then((r) => r.json())) as { devices?: Array<{ revokedAt?: string | null }> }
        if ((d.devices ?? []).some((x) => !x.revokedAt)) {
          setConnected(true)
          clearInterval(id)
          setTimeout(() => router.refresh(), 1400)
        }
      } catch {
        /* keep polling */
      }
    }, 3000)
    return () => clearInterval(id)
  }, [pairing, connected, router])

  async function generateCode() {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/agent/pair/initiate', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'failed')
      setPairing({ code: data.code, expiresAt: data.expiresAt })
    } catch {
      setErr('Could not generate a code — please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (connected) {
    return (
      <section className="app-card app-card-lg border-[var(--m-good)]/40 bg-[var(--m-good-soft)]/40">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex w-8 h-8 rounded-full bg-[var(--m-good)] text-white items-center justify-center">
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} aria-hidden>
              <path d="M5 13l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <p className="app-h2">Desktop agent connected</p>
            <p className="app-sub mt-0.5">You&rsquo;re all set — refreshing your dashboard…</p>
          </div>
        </div>
      </section>
    )
  }

  const macBtn = (
    <DownloadButton
      url={macUrl}
      label="Download for Mac"
      hint=".dmg · Apple Silicon + Intel"
      icon={<AppleIcon />}
    />
  )
  const winBtn = (
    <DownloadButton
      url={winUrl}
      label="Download for Windows"
      hint=".exe · Windows 10/11"
      icon={<WindowsIcon />}
    />
  )

  return (
    <section className="app-card app-card-lg relative overflow-hidden">
      <div aria-hidden className="absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl opacity-20" style={{ background: 'var(--m-accent)' }} />
      <div className="relative">
        <p className="app-eyebrow">Desktop agent · v{version}</p>
        <h2 className="font-display text-[22px] leading-tight text-[var(--m-ink)] mt-0.5">
          {variant === 'manager' ? 'Install the Marina desktop agent' : 'Set up the Marina desktop agent'}
        </h2>
        <p className="app-sub mt-1 max-w-xl">
          {variant === 'manager'
            ? 'A tiny menu-bar app that tracks focus time & attendance automatically — no status forms. You install it on your machine, and your team installs the same app (they get this prompt on their dashboard too).'
            : 'A tiny menu-bar app so Marina tracks your focus time & attendance automatically — no manual logging. Two steps: download it, then connect it below.'}
        </p>

        {/* Step 1 — download (device-aware) */}
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wider text-[var(--m-ink-4)] font-semibold mb-2">
            1 · Download for your computer
          </p>
          {os === 'other' ? (
            <div className="flex flex-wrap gap-2">
              {macBtn}
              {winBtn}
            </div>
          ) : (
            <>
              {os === 'mac' ? macBtn : winBtn}
              <button
                type="button"
                onClick={() => setOverride(os === 'mac' ? 'windows' : 'mac')}
                className="ml-3 text-[12.5px] text-[var(--m-ink-3)] hover:text-[var(--m-accent)] underline underline-offset-2"
              >
                Using {os === 'mac' ? 'Windows' : 'a Mac'} instead?
              </button>
            </>
          )}
        </div>

        {/* Step 2 — connect / pair */}
        <div className="mt-5">
          <p className="text-[11px] uppercase tracking-wider text-[var(--m-ink-4)] font-semibold mb-2">
            2 · Connect it
          </p>
          {!pairing ? (
            <div className="flex items-center gap-3 flex-wrap">
              <button type="button" onClick={generateCode} disabled={busy} className="btn-sage text-[13px] disabled:opacity-60">
                {busy ? 'Generating…' : 'Generate pairing code'}
              </button>
              <span className="text-[12.5px] text-[var(--m-ink-3)]">Open the app → “Pair this device” → enter the code.</span>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--m-accent)]/30 bg-[var(--m-accent-soft)]/40 p-4">
              <p className="text-[12.5px] text-[var(--m-ink-2)]">In the Marina app, choose <span className="font-medium">Pair this device</span> and enter:</p>
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <span className="font-mono text-[26px] tracking-[0.3em] font-semibold text-[var(--m-ink)] bg-white border border-[var(--m-border)] rounded-lg px-4 py-1.5">
                  {pairing.code}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--m-ink-3)]">
                  <span className="marina-pulse w-3.5 h-3.5 inline-flex items-center justify-center">
                    <span className="marina-pulse-core" />
                    <span className="marina-pulse-ring" />
                  </span>
                  Waiting for your device… expires in {Math.floor(secsLeft / 60)}:{String(secsLeft % 60).padStart(2, '0')}
                </span>
              </div>
            </div>
          )}
          {err && <p className="mt-2 text-[12px] text-[var(--m-bad)]">{err}</p>}
        </div>

        <p className="mt-4 text-[11.5px] text-[var(--m-ink-4)]">
          {variant === 'manager' ? (
            <>
              Share the <Link href="/setup-guide" className="text-[var(--m-accent)] hover:underline">one-page setup guide</Link> with new hires ·{' '}
            </>
          ) : null}
          Need install help or another platform? <Link href="/download" className="text-[var(--m-accent)] hover:underline">All downloads & steps</Link>
        </p>
      </div>
    </section>
  )
}

function DownloadButton({ url, label, hint, icon }: { url: string | null; label: string; hint: string; icon: React.ReactNode }) {
  if (!url) {
    return (
      <div className="inline-flex flex-col">
        <a
          href={`mailto:thetanishgarg@gmail.com?subject=${encodeURIComponent(`Notify me: ${label}`)}`}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border-2 border-[var(--m-ink)] hover:bg-[var(--m-bg-soft)] text-[var(--m-ink)] text-[13.5px] font-medium transition"
        >
          {icon} Notify me when it&rsquo;s ready
        </a>
      </div>
    )
  }
  return (
    <span className="inline-flex flex-col">
      <a
        href={url}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white text-[13.5px] font-medium transition"
      >
        {icon} {label}
      </a>
      <span className="mt-1 text-[11px] text-[var(--m-ink-4)] text-center">{hint}</span>
    </span>
  )
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 384 512" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M318 268c-1-69 56-103 59-105-32-47-82-53-100-54-43-4-83 25-105 25-22 0-55-25-90-24-46 1-89 27-113 68-48 84-12 207 35 274 23 33 50 70 86 69 35-1 48-22 89-22 41 0 53 22 89 22 37-1 60-34 82-67 26-38 37-75 38-77-1-1-73-28-70-109zM254 80c19-23 32-55 28-87-28 1-62 19-82 41-18 20-34 53-30 84 31 2 63-16 84-38z" />
    </svg>
  )
}
function WindowsIcon() {
  return (
    <svg viewBox="0 0 448 512" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M0 93.7l183-25.2v177.4H0V93.7zm0 324.6l183 25.2V268.4H0v149.9zm203 28L448 480V268H203v178.3zm0-410v177.5h245V32L203 38.3z" />
    </svg>
  )
}
