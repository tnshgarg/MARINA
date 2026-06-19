'use client'

import { useEffect, useState } from 'react'

type Channel = { id: string; name: string; isPrivate: boolean }

/**
 * Picks the org's Slack default channel (where the brief / standups /
 * celebrations / digest post). Loads the channel list from the bot and saves
 * the selection.
 */
export default function ChannelPicker({ orgId, current }: { orgId: number; current: string | null }) {
  const [channels, setChannels] = useState<Channel[] | null>(null)
  const [selected, setSelected] = useState(current ?? '')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let alive = true
    fetch(`/api/orgs/${orgId}/slack/channel`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        if (Array.isArray(d.channels)) {
          setChannels(d.channels)
          if (d.current) setSelected(d.current)
        } else {
          setLoadError(d.error ?? 'Could not load channels')
        }
      })
      .catch(() => alive && setLoadError('Could not load channels'))
    return () => {
      alive = false
    }
  }, [orgId])

  async function save() {
    if (!selected) return
    setSaving(true)
    setStatus('idle')
    try {
      const r = await fetch(`/api/orgs/${orgId}/slack/channel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channelId: selected }),
      })
      setStatus(r.ok ? 'saved' : 'error')
    } catch {
      setStatus('error')
    }
    setSaving(false)
  }

  if (loadError) return <p className="text-[12.5px] text-[var(--m-bad)]">{loadError}</p>
  if (channels === null) return <p className="text-[12.5px] text-[var(--m-ink-3)]">Loading channels…</p>

  return (
    <div className="flex flex-col gap-2">
      <select
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value)
          setStatus('idle')
        }}
        className="input text-[13px]"
      >
        <option value="">Pick a channel…</option>
        {channels.map((c) => (
          <option key={c.id} value={c.id}>
            #{c.name}
            {c.isPrivate ? ' (private)' : ''}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!selected || saving}
          className="btn-sage text-[12.5px] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save channel'}
        </button>
        {status === 'saved' && <span className="text-[12px] text-[var(--m-good)]">Saved</span>}
        {status === 'error' && (
          <span className="text-[12px] text-[var(--m-bad)]">Couldn&apos;t save — make sure Marina is in that channel.</span>
        )}
      </div>
    </div>
  )
}
