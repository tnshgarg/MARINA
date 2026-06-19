'use client'

import { useEffect, useState } from 'react'

type Channel = { id: string; name: string; isPrivate: boolean }

/**
 * Sets the org's two Slack channels: the announcements channel (brief,
 * celebrations, digest) and the scrum channel (standups). Loads the bot's
 * channel list once and saves each independently.
 */
export default function ChannelPicker({
  orgId,
  defaultChannel,
  scrumChannel,
}: {
  orgId: number
  defaultChannel: string | null
  scrumChannel: string | null
}) {
  const [channels, setChannels] = useState<Channel[] | null>(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let alive = true
    fetch(`/api/orgs/${orgId}/slack/channel`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        if (Array.isArray(d.channels)) setChannels(d.channels)
        else setLoadError(d.error ?? 'Could not load channels')
      })
      .catch(() => alive && setLoadError('Could not load channels'))
    return () => {
      alive = false
    }
  }, [orgId])

  if (loadError) return <p className="text-[12.5px] text-[var(--m-bad)]">{loadError}</p>
  if (channels === null) return <p className="text-[12.5px] text-[var(--m-ink-3)]">Loading channels…</p>

  return (
    <div className="flex flex-col gap-3.5">
      <Row
        orgId={orgId}
        kind="default"
        label="Announcements & celebrations"
        hint="Birthdays, work anniversaries, the morning brief and the weekly digest."
        channels={channels}
        current={defaultChannel}
      />
      <Row
        orgId={orgId}
        kind="scrum"
        label="Standups & scrum"
        hint="Where /marina standup posts. Falls back to the announcements channel."
        channels={channels}
        current={scrumChannel}
      />
    </div>
  )
}

function Row({
  orgId,
  kind,
  label,
  hint,
  channels,
  current,
}: {
  orgId: number
  kind: 'default' | 'scrum'
  label: string
  hint: string
  channels: Channel[]
  current: string | null
}) {
  const [selected, setSelected] = useState(current ?? '')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  async function save() {
    if (!selected) return
    setSaving(true)
    setStatus('idle')
    try {
      const r = await fetch(`/api/orgs/${orgId}/slack/channel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channelId: selected, kind }),
      })
      setStatus(r.ok ? 'saved' : 'error')
    } catch {
      setStatus('error')
    }
    setSaving(false)
  }

  return (
    <div>
      <p className="text-[12.5px] font-semibold text-[var(--m-ink)]">{label}</p>
      <p className="text-[11px] text-[var(--m-ink-4)] mb-1.5 leading-snug">{hint}</p>
      <div className="flex items-center gap-2">
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value)
            setStatus('idle')
          }}
          className="input text-[13px] flex-1"
        >
          <option value="">Pick a channel…</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.name}
              {c.isPrivate ? ' (private)' : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={save}
          disabled={!selected || saving}
          className="btn-sage text-[12.5px] disabled:opacity-50 shrink-0"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {status === 'saved' && <p className="text-[12px] text-[var(--m-good)] mt-1">Saved</p>}
      {status === 'error' && (
        <p className="text-[12px] text-[var(--m-bad)] mt-1">Couldn&apos;t save — make sure Marina is in that channel.</p>
      )}
    </div>
  )
}
