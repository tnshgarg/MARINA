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

  // Poll devices while pairing modal is open so a successful pair appears.
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
    } catch {
      // ignore
    }
  }

  const paused = !!settings.trackingPausedAt
  const activeDevices = devices.filter((d) => !d.revokedAt)

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Tracking</h2>
            <p className="mt-1 text-xs text-zinc-500">
              When paused, the agent stops sampling and the server discards any in-flight uploads.
            </p>
          </div>
          <button
            onClick={() => patchSettings({ paused: !paused })}
            disabled={busy === 'settings'}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              paused
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900'
            } disabled:opacity-50`}
          >
            {paused ? 'Resume tracking' : 'Pause tracking'}
          </button>
        </div>
        {paused && settings.trackingPausedAt && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            Paused since {new Date(settings.trackingPausedAt).toLocaleString()}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Window titles</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Off by default. When on, the agent includes the foreground window title with each
              sample so managers can see e.g. which file is being edited. Sensitive — keep it off
              unless your team explicitly opts in.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.windowTitlesEnabled}
              disabled={busy === 'settings'}
              onChange={(e) => patchSettings({ windowTitlesEnabled: e.target.checked })}
              className="size-4"
            />
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              {settings.windowTitlesEnabled ? 'On' : 'Off'}
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Pair a Mac</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Install the Project MARINA Mac agent, then click below to generate a one-time code.
              Paste it into the agent&apos;s pairing window within 10 minutes.
            </p>
          </div>
          <button
            onClick={generateCode}
            disabled={busy === 'pair'}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {busy === 'pair' ? 'Generating…' : 'Generate pairing code'}
          </button>
        </div>
        {pairing && (
          <div className="mt-4 rounded border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-xs text-zinc-500">Pairing code (valid for {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')})</p>
            <div className="mt-2 flex items-center gap-3">
              <code className="text-2xl font-mono tracking-[0.3em] text-zinc-900 dark:text-zinc-100">
                {pairing.code}
              </code>
              <button
                onClick={() => copyCode(pairing.code)}
                className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
              >
                Copy
              </button>
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">
              This code grants pairing — anyone with it can pair a device to your account. It vanishes
              the moment a device pairs. Once a device shows up below, you can close this.
            </p>
          </div>
        )}
        {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Paired devices ({activeDevices.length})
        </h2>
        {devices.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No devices paired yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-900">
            {devices.map((d) => (
              <li key={d.id} className="py-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {d.label}{' '}
                    <span className="text-xs text-zinc-500">
                      ({d.platform}{d.agentVersion ? ` · ${d.agentVersion}` : ''})
                    </span>
                  </p>
                  <p className="text-xs text-zinc-500">
                    {d.tokenPrefix}… · paired {new Date(d.pairedAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-zinc-500">
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
                    className="text-xs rounded border border-rose-300 px-2 py-1 text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300"
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
        <p className="text-xs text-zinc-500">
          Consent on file from {new Date(settings.consentAt).toLocaleString()}.
        </p>
      )}
    </div>
  )
}
