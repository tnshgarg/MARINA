'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Initial = {
  name: string
  hasSlack: boolean
  holidayRegion: string
  avatarMode: 'hero' | 'photo'
  workdayStartHour: number
  workdayEndHour: number
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
    <div className="space-y-6 max-w-3xl">
      {/* Org name */}
      <section className="app-card app-card-lg hover-lift">
        <div className="section-title-row">
          <div>
            <h2 className="app-h2">Workspace name</h2>
            <p className="app-sub mt-1">Shown in the sidebar and on email invites.</p>
          </div>
          <button
            className="btn-primary"
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

      {/* Slack notifications */}
      <section className="app-card app-card-lg hover-lift">
        <div className="section-title-row">
          <div>
            <h2 className="app-h2">Slack notifications</h2>
            <p className="app-sub mt-1">
              Get pinged when employees take a break, request leave, or punch out with a suspicious summary.
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
        <p className="app-sub mt-2 text-[12px]">
          Create one at <code>api.slack.com/apps</code> → your app → Incoming Webhooks → Add. Paste the URL above.
        </p>
        <div className="flex gap-2 mt-3">
          <button
            className="btn-primary"
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
      <section className="app-card app-card-lg hover-lift">
        <div className="section-title-row">
          <div>
            <h2 className="app-h2">Public holiday calendar</h2>
            <p className="app-sub mt-1">Seeds the leave + insights views with India national + state holidays.</p>
          </div>
          <button
            className="btn-primary"
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

      {/* Avatar mode */}
      <section className="app-card app-card-lg hover-lift">
        <div className="section-title-row">
          <div>
            <h2 className="app-h2">Avatar style</h2>
            <p className="app-sub mt-1">Choose how teammates appear across dashboards.</p>
          </div>
          <button
            className="btn-primary"
            disabled={busy !== null || avatarMode === initial.avatarMode}
            onClick={() => save({ avatarMode }, 'avatar')}
          >
            {busy === 'avatar' ? 'Saving…' : 'Save'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4 max-w-md">
          <label className={`cursor-pointer rounded-xl border p-4 transition-all ${avatarMode === 'hero' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}>
            <input
              type="radio"
              name="avatar"
              value="hero"
              checked={avatarMode === 'hero'}
              onChange={() => setAvatarMode('hero')}
              className="sr-only"
            />
            <p className="text-[14px] font-medium text-slate-900">Pixel hero</p>
            <p className="text-[12px] text-slate-500 mt-1">Iron Man, Spider-Man, etc. Fun for Gen-Z teams.</p>
          </label>
          <label className={`cursor-pointer rounded-xl border p-4 transition-all ${avatarMode === 'photo' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}>
            <input
              type="radio"
              name="avatar"
              value="photo"
              checked={avatarMode === 'photo'}
              onChange={() => setAvatarMode('photo')}
              className="sr-only"
            />
            <p className="text-[14px] font-medium text-slate-900">GitHub photo</p>
            <p className="text-[12px] text-slate-500 mt-1">Real profile pictures. Better for enterprise HR.</p>
          </label>
        </div>
      </section>

      {/* Workday */}
      <section className="app-card app-card-lg hover-lift">
        <div className="section-title-row">
          <div>
            <h2 className="app-h2">Workday hours</h2>
            <p className="app-sub mt-1">Used to flag punch-ins / punch-outs outside the expected window.</p>
          </div>
          <button
            className="btn-primary"
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

      {savedAt && !error && (
        <p className="text-[12px] text-emerald-600">Saved at {savedAt.toLocaleTimeString()}</p>
      )}
      {error && <p className="text-[12px] text-rose-600">{error}</p>}
    </div>
  )
}
