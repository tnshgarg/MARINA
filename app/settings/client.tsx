'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Settings = {
  trackingPausedAt: string | null
  windowTitlesEnabled: boolean
  consentAt: string | null
}

type Device = {
  id: number
  label: string
  platform: string
  tokenPrefix: string
  agentVersion: string | null
  pairedAt: string
  lastSeenAt: string | null
  revokedAt: string | null
}

type PairingCode = {
  code: string
  expiresAt: string
  ttlSeconds: number
}

export default function SettingsClient({
  initialSettings,
  initialDevices,
  googleConnected,
}: {
  initialSettings: Settings
  initialDevices: Device[]
  googleConnected: boolean
}) {
  const router = useRouter()
  const [settings, setSettings] = useState(initialSettings)
  const [devices, setDevices] = useState(initialDevices)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pairing, setPairing] = useState<PairingCode | null>(null)
  const [remaining, setRemaining] = useState<number>(0)
  const [copiedCode, setCopiedCode] = useState(false)
  const [calendar, setCalendar] = useState({ connected: googleConnected })
  const [calendarStatus, setCalendarStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!pairing) return
    const tick = () => {
      const ms = new Date(pairing.expiresAt).getTime() - Date.now()
      setRemaining(Math.max(0, Math.floor(ms / 1000)))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [pairing])

  // Pick up calendar=connected / calendar_error from the OAuth callback redirect.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const p = new URLSearchParams(window.location.search)
    const ok = p.get('calendar')
    const err = p.get('calendar_error')
    if (ok === 'connected') {
      setCalendarStatus('Google Calendar connected. Initial sync running…')
    } else if (err) {
      setCalendarStatus(`Calendar connect failed: ${err}`)
    }
    // Clean up the URL so reloads don't keep showing the toast.
    if (ok || err) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  async function syncCalendar() {
    setBusy('cal-sync')
    setCalendarStatus(null)
    try {
      const res = await fetch('/api/me/calendar/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      setCalendarStatus(
        `Synced · ${data.inserted ?? 0} new, ${data.updated ?? 0} updated. ${data.attendanceMarked ?? 0} marked attended.`,
      )
    } catch (e) {
      setCalendarStatus(`Sync failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  async function disconnectCalendar() {
    if (!confirm('Disconnect Google Calendar? Synced meetings will be purged.')) return
    setBusy('cal-disconnect')
    try {
      const res = await fetch('/api/me/calendar/disconnect', { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setCalendar({ connected: false })
      setCalendarStatus('Disconnected.')
      router.refresh()
    } catch (e) {
      setCalendarStatus(`Disconnect failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  async function patchSettings(patch: Partial<{ paused: boolean; windowTitlesEnabled: boolean }>) {
    setBusy('settings')
    setError(null)
    try {
      const res = await fetch('/api/me/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'failed')
      setSettings(data.settings)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(null)
    }
  }

  async function generateCode() {
    setBusy('pair')
    setError(null)
    try {
      const res = await fetch('/api/agent/pair/initiate', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'failed')
      setPairing({ code: data.code, expiresAt: data.expiresAt, ttlSeconds: data.ttlSeconds })
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(null)
    }
  }

  async function refreshDevices() {
    const res = await fetch('/api/me/devices')
    if (res.ok) {
      const data = await res.json()
      setDevices(data.devices)
    }
  }

  // Poll devices while pairing modal is open.
  useEffect(() => {
    if (!pairing) return
    const id = setInterval(refreshDevices, 3000)
    return () => clearInterval(id)
  }, [pairing])

  async function revoke(id: number) {
    if (!confirm('Revoke this device? The agent will stop being able to send data.')) return
    setBusy(`revoke-${id}`)
    setError(null)
    try {
      const res = await fetch(`/api/me/devices/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'failed')
      await refreshDevices()
      router.refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(null)
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 1500)
    } catch {
      // ignore
    }
  }

  const paused = !!settings.trackingPausedAt
  const activeDevices = devices.filter((d) => !d.revokedAt)

  return (
    <div className="max-w-3xl space-y-5">
      <SettingsRow
        title="Tracking"
        body="When paused, the agent stops sampling and the server discards any in-flight uploads."
        action={
          <button
            onClick={() => patchSettings({ paused: !paused })}
            disabled={busy === 'settings'}
            className={
              paused
                ? 'px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[12.5px] font-medium disabled:opacity-50 transition'
                : 'px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-700 text-white text-[12.5px] font-medium disabled:opacity-50 transition'
            }
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
        }
        footer={
          paused && settings.trackingPausedAt
            ? `Paused since ${new Date(settings.trackingPausedAt).toLocaleString()}`
            : null
        }
      />

      <SettingsRow
        title="Window titles"
        body="Off by default. When on, the agent includes the foreground window title with each sample so managers can see e.g. which file is being edited."
        action={
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.windowTitlesEnabled}
              disabled={busy === 'settings'}
              onChange={(e) => patchSettings({ windowTitlesEnabled: e.target.checked })}
              className="w-4 h-4 accent-[var(--m-accent)]"
            />
            <span className="text-[12px] text-slate-600">
              {settings.windowTitlesEnabled ? 'On' : 'Off'}
            </span>
          </label>
        }
      />

      <SettingsRow
        title="Pair a Mac"
        body="Install the MARINA Mac agent, generate a one-time code, and paste it into the agent within 10 minutes."
        action={
          <button
            onClick={generateCode}
            disabled={busy === 'pair'}
            className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-700 text-white text-[12.5px] font-medium disabled:opacity-50 transition"
          >
            {busy === 'pair' ? 'Generating…' : 'Generate code'}
          </button>
        }
      >
        {pairing && (
          <div className="mt-4 rounded-lg bg-[var(--m-accent-soft)]/70 border border-[var(--m-accent)]/20 p-3">
            <p className="text-[11.5px] text-[var(--m-accent-2)] font-medium">
              Pairing code · valid for {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
            </p>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <code className="text-[20px] font-semibold tracking-[0.3em] text-[var(--m-ink)] font-mono">
                {pairing.code}
              </code>
              <button
                onClick={() => copyCode(pairing.code)}
                className="px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-[11.5px] font-medium text-slate-700 transition"
              >
                {copiedCode ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="mt-2 text-[11.5px] text-slate-500">
              Anyone with this code can pair a device to your account. It vanishes the moment a device pairs.
            </p>
          </div>
        )}
        {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}
      </SettingsRow>

      <SettingsRow
        title="Google Calendar"
        body="Connect your Google Calendar so MARINA can show today's meetings, give you a heads-up before they start, and reconcile attendance from your activity."
        action={
          calendar.connected ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={syncCalendar}
                disabled={busy === 'cal-sync'}
                className="px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[12.5px] font-medium disabled:opacity-50 transition"
              >
                {busy === 'cal-sync' ? 'Syncing…' : 'Sync now'}
              </button>
              <button
                onClick={disconnectCalendar}
                disabled={busy === 'cal-disconnect'}
                className="px-3 py-1.5 rounded-md bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 text-[12.5px] font-medium disabled:opacity-50 transition"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <a
              href="/api/connect/google/start?return_to=/settings"
              className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-700 text-white text-[12.5px] font-medium transition inline-block"
            >
              Connect
            </a>
          )
        }
      >
        {calendarStatus && (
          <p
            className={`mt-3 text-[12px] ${
              calendarStatus.includes('failed') ? 'text-rose-600' : 'text-emerald-700'
            }`}
          >
            {calendarStatus}
          </p>
        )}
      </SettingsRow>

      {/* Custom avatar upload — uploaded photo overrides the pixel
          character everywhere CharacterAvatar is used. */}
      <AvatarSection />

      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-baseline justify-between">
          <h2 className="text-[13px] font-semibold text-slate-900">
            Paired devices
            <span className="ml-1.5 text-slate-400 tabular-nums">{activeDevices.length}</span>
          </h2>
        </div>
        {devices.length === 0 ? (
          <p className="px-4 py-5 text-[12.5px] text-slate-500">No devices paired yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {devices.map((d) => (
              <li key={d.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-slate-900">
                    {d.label}{' '}
                    <span className="text-[11px] text-slate-500 font-normal">
                      {d.platform}{d.agentVersion ? ` · ${d.agentVersion}` : ''}
                    </span>
                  </p>
                  <p className="text-[11.5px] text-slate-500">
                    {d.tokenPrefix}… · paired {new Date(d.pairedAt).toLocaleString()}
                  </p>
                  <p className="text-[11.5px] text-slate-500">
                    {d.revokedAt
                      ? `Revoked ${new Date(d.revokedAt).toLocaleString()}`
                      : d.lastSeenAt
                        ? `Last seen ${new Date(d.lastSeenAt).toLocaleString()}`
                        : 'Not seen yet'}
                  </p>
                </div>
                {!d.revokedAt && (
                  <button
                    onClick={() => revoke(d.id)}
                    disabled={busy === `revoke-${d.id}`}
                    className="px-2.5 py-1 rounded-md bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 text-[11.5px] font-medium disabled:opacity-50 transition"
                  >
                    {busy === `revoke-${d.id}` ? 'Revoking…' : 'Revoke'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {settings.consentAt && (
        <p className="text-[11.5px] text-slate-500">
          Consent on file from {new Date(settings.consentAt).toLocaleString()}.
        </p>
      )}

      <section className="rounded-xl border border-rose-200 bg-white p-5">
        <h2 className="text-[14px] font-semibold text-rose-700">Danger zone</h2>
        <p className="text-[12.5px] text-slate-500 mt-1">
          Your data is yours. Download or permanently delete it under your DPDP Act 2023 rights.
        </p>
        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-200 p-4">
            <h3 className="text-[13px] font-semibold text-slate-900">Export my data</h3>
            <p className="text-[12px] text-slate-500 mt-1 leading-snug">
              Download a JSON dump of every row tied to your account — profile, GitHub events,
              activity, shifts, breaks, leaves, narratives.
            </p>
            <a
              href="/api/me/export"
              download
              className="mt-3 inline-flex px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[12px] font-medium transition"
            >
              Download JSON
            </a>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-4">
            <h3 className="text-[13px] font-semibold text-rose-700">Delete my account</h3>
            <p className="text-[12px] mt-1 text-rose-800/80 leading-snug">
              Permanently erase your account and all associated data. This cannot be undone. If you
              own an org with other members, you must transfer ownership first.
            </p>
            <button
              onClick={async () => {
                const typed = prompt(
                  'This permanently erases your account and all data — it cannot be undone.\n\nType your username to confirm:',
                )
                if (!typed) return
                try {
                  const res = await fetch('/api/me/account', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ confirm: typed.trim() }),
                  })
                  const data = await res.json()
                  if (!res.ok) {
                    alert(data?.error || 'Failed to delete account')
                    return
                  }
                  window.location.href = '/'
                } catch (e) {
                  alert('Delete failed: ' + String(e))
                }
              }}
              className="mt-3 px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-[12px] font-medium transition"
            >
              Delete my account
            </button>
          </div>
        </div>
      </section>

      <p className="text-[11px] text-slate-400 mt-2">
        Want a Data Processing Agreement? See <a href="/dpa" className="underline">/dpa</a>.
      </p>
    </div>
  )
}

/**
 * Standard settings row: title + description left, action control right, optional
 * children below for inline expansions (e.g. the pairing-code reveal).
 */
function SettingsRow({
  title,
  body,
  action,
  footer,
  children,
}: {
  title: string
  body: string
  action: React.ReactNode
  footer?: string | null
  children?: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1 max-w-[440px]">
          <h2 className="text-[13.5px] font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-[12.5px] text-slate-500 leading-relaxed">{body}</p>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
      {footer && <p className="mt-2 text-[12px] text-amber-700">{footer}</p>}
      {children}
    </section>
  )
}

/**
 * Avatar upload section. Lets the user replace their pixel character with a
 * real photo (or anything else they want — JPEG / PNG / WebP / GIF). The
 * upload is sent as multipart/form-data; on success we hard-refresh so the
 * sidebar avatar updates immediately.
 *
 * Reset wipes the avatarUrl so the pixel character takes over again.
 */
function AvatarSection() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/uploads/avatar', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'upload failed')
      setSuccess('Avatar updated.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function reset() {
    if (!confirm('Reset to your pixel character?')) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/uploads/avatar', { method: 'DELETE' })
      if (!res.ok) throw new Error('reset failed')
      setSuccess('Reset to pixel character.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-[13.5px] font-semibold text-slate-900">Profile photo</h2>
      <p className="mt-1 text-[12.5px] text-slate-500">
        Upload a real photo if you&apos;d rather skip the pixel character. JPEG, PNG, WebP or
        GIF — up to 2 MB.
      </p>
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-700 text-white text-[12.5px] font-medium disabled:opacity-50 transition"
        >
          {busy ? 'Uploading…' : 'Choose photo'}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={busy}
          className="px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-[12.5px] font-medium text-slate-700 disabled:opacity-50 transition"
        >
          Use pixel character
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={upload}
          className="hidden"
        />
      </div>
      {success && <p className="mt-3 text-[12px] text-emerald-700">{success}</p>}
      {error && <p className="mt-3 text-[12px] text-rose-600">{error}</p>}
    </section>
  )
}
