'use client'

import { useEffect, useState } from 'react'
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
}: {
  initialSettings: Settings
  initialDevices: Device[]
}) {
  const router = useRouter()
  const [settings, setSettings] = useState(initialSettings)
  const [devices, setDevices] = useState(initialDevices)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pairing, setPairing] = useState<PairingCode | null>(null)
  const [remaining, setRemaining] = useState<number>(0)
  const [copiedCode, setCopiedCode] = useState(false)

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
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <section className="app-card app-card-lg">
        <div className="section-title-row flex-wrap gap-3">
          <div>
            <h2 className="app-h2">Tracking</h2>
            <p className="app-sub mt-1">
              When paused, the agent stops sampling and the server discards any in-flight uploads.
            </p>
          </div>
          <button
            onClick={() => patchSettings({ paused: !paused })}
            disabled={busy === 'settings'}
            className={paused ? 'btn-good' : 'btn-primary'}
          >
            {paused ? 'Resume tracking' : 'Pause tracking'}
          </button>
        </div>
        {paused && settings.trackingPausedAt && (
          <p className="mt-2 text-[12px] text-amber-700">
            Paused since {new Date(settings.trackingPausedAt).toLocaleString()}
          </p>
        )}
      </section>

      <section className="app-card app-card-lg">
        <div className="section-title-row flex-wrap gap-3">
          <div>
            <h2 className="app-h2">Window titles</h2>
            <p className="app-sub mt-1 max-w-md">
              Off by default. When on, the agent includes the foreground window title with each
              sample so managers can see e.g. which file is being edited.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.windowTitlesEnabled}
              disabled={busy === 'settings'}
              onChange={(e) => patchSettings({ windowTitlesEnabled: e.target.checked })}
              className="w-4 h-4 accent-indigo-600"
            />
            <span className="text-[12px] text-slate-600">
              {settings.windowTitlesEnabled ? 'On' : 'Off'}
            </span>
          </label>
        </div>
      </section>

      <section className="app-card app-card-lg">
        <div className="section-title-row flex-wrap gap-3">
          <div>
            <h2 className="app-h2">Pair a Mac</h2>
            <p className="app-sub mt-1 max-w-md">
              Install the MARINA Mac agent, generate a one-time code, and paste it into the agent
              within 10 minutes.
            </p>
          </div>
          <button onClick={generateCode} disabled={busy === 'pair'} className="btn-primary">
            {busy === 'pair' ? 'Generating…' : 'Generate pairing code'}
          </button>
        </div>
        {pairing && (
          <div className="mt-4 rounded-2xl bg-indigo-50 border border-indigo-100 p-4">
            <p className="text-[12px] text-indigo-700 font-medium">
              Pairing code · valid for {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
            </p>
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <code className="text-[22px] font-semibold tracking-[0.3em] text-indigo-900 font-mono">
                {pairing.code}
              </code>
              <button onClick={() => copyCode(pairing.code)} className="btn-secondary">
                {copiedCode ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="mt-3 text-[12px] text-slate-500">
              Anyone with this code can pair a device to your account. It vanishes the moment a
              device pairs.
            </p>
          </div>
        )}
        {error && <p className="mt-3 text-[12px] text-rose-600">{error}</p>}
      </section>

      <section className="app-card">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="app-h2">Paired devices · {activeDevices.length}</h2>
        </div>
        {devices.length === 0 ? (
          <p className="px-5 py-6 app-sub">No devices paired yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {devices.map((d) => (
              <li key={d.id} className="px-5 py-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[14px] font-medium text-slate-900">
                    {d.label}{' '}
                    <span className="text-[11px] text-slate-500 font-normal">
                      {d.platform}{d.agentVersion ? ` · ${d.agentVersion}` : ''}
                    </span>
                  </p>
                  <p className="text-[12px] text-slate-500">
                    {d.tokenPrefix}… · paired {new Date(d.pairedAt).toLocaleString()}
                  </p>
                  <p className="text-[12px] text-slate-500">
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
                    className="btn-bad"
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
        <p className="text-[12px] text-slate-500">
          Consent on file from {new Date(settings.consentAt).toLocaleString()}.
        </p>
      )}

      <section className="app-card app-card-lg" style={{ borderColor: '#fecaca' }}>
        <h2 className="app-h2" style={{ color: '#b91c1c' }}>Danger zone</h2>
        <p className="app-sub mt-1 mb-4">
          Your data is yours. Download or permanently delete it under your DPDP Act 2023 rights.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="app-h3">Export my data</h3>
            <p className="app-sub mt-1 text-[12px]">
              Download a JSON dump of every row tied to your account — profile, GitHub events,
              activity, shifts, breaks, leaves, narratives.
            </p>
            <a
              href="/api/me/export"
              download
              className="btn-secondary mt-3 inline-flex"
            >
              ↓ Download JSON
            </a>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
            <h3 className="app-h3" style={{ color: '#b91c1c' }}>Delete my account</h3>
            <p className="text-[12px] mt-1 text-rose-800/80">
              Permanently erase your account and all associated data. This cannot be undone. If you
              own an org with other members, you must transfer ownership first.
            </p>
            <button
              onClick={async () => {
                if (!confirm('Permanently delete your account and all data? This cannot be undone.')) return
                if (!confirm('Final confirmation. Click OK to delete.')) return
                try {
                  const res = await fetch('/api/me/account', { method: 'DELETE' })
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
              className="btn-bad mt-3"
            >
              Delete my account
            </button>
          </div>
        </div>
      </section>

      <p className="text-[11px] text-slate-400 text-center mt-2">
        Want a Data Processing Agreement? See <a href="/dpa" className="underline">/dpa</a>.
      </p>
    </div>
  )
}
