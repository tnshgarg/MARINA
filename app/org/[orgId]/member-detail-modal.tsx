'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CharacterAvatar } from '@/components/character-avatar'
import { Modal } from '@/components/modal'
import { useToast } from '@/components/toast'

type StorySceneKind =
  | 'shift_start' | 'shift_end' | 'meeting' | 'coding' | 'design' | 'comms'
  | 'reading' | 'browsing' | 'media' | 'break' | 'leave' | 'idle' | 'mixed' | 'unknown'

type Scene = {
  startAt: string
  endAt: string
  kind: StorySceneKind
  label: string
  detail?: string
}

type Detail = {
  user: {
    id: number
    login: string
    name: string | null
    email: string | null
    characterKey: string | null
    hasGithub: boolean
    lastSyncedAt: string | null
    lastSyncError: string | null
  }
  role: string
  narrative: {
    body: string
    signal: 'High' | 'Steady' | 'Low' | 'Blocked'
    createdAt: string
    provider: string
    model: string
  } | null
  story: {
    narrative: string
    scenes: Scene[]
    generatedAt: string
  } | null
  githubEvents: Array<{
    id: number
    type: 'commit' | 'pr_opened' | 'pr_reviewed' | 'issue_closed'
    repo: string
    title: string
    url: string
    occurredAt: string
  }>
  recentBreaks: Array<{
    id: number
    category: string
    reason: string
    startedAt: string
    endedAt: string | null
    waitingOnExternal: string | null
  }>
  recentLeaves: Array<{
    id: number
    startDate: string
    endDate: string
    leaveType: string
    reason: string
    status: 'pending' | 'approved' | 'denied' | 'cancelled'
    decidedNote: string | null
  }>
  latestShift: {
    id: number
    punchedInAt: string
    punchedOutAt: string | null
    workSummary: string | null
    verificationStatus: string
    verificationScore: number | null
  } | null
}

const SCENE_COLOR: Record<StorySceneKind, string> = {
  shift_start: '#cbd5e1',
  shift_end: '#cbd5e1',
  meeting: '#6366f1',
  coding: '#10b981',
  design: '#ec4899',
  comms: '#0ea5e9',
  reading: '#a855f7',
  browsing: '#94a3b8',
  media: '#f97316',
  break: '#f59e0b',
  leave: '#fbbf24',
  idle: '#cbd5e1',
  mixed: '#84cc16',
  unknown: '#cbd5e1',
}

const TYPE_LABEL: Record<string, string> = {
  commit: 'commit',
  pr_opened: 'PR opened',
  pr_reviewed: 'review',
  issue_closed: 'issue closed',
}

export function MemberDetailModal({
  orgId,
  membershipId,
  initialName,
  open,
  onClose,
  isManager,
}: {
  orgId: number
  membershipId: number | null
  initialName: string
  open: boolean
  onClose: () => void
  isManager: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !membershipId) return
    let cancelled = false
    setLoading(true)
    setErr(null)
    setDetail(null)
    ;(async () => {
      try {
        const res = await fetch(`/api/orgs/${orgId}/members/${membershipId}/detail`)
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
        if (!cancelled) setDetail(data as Detail)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, orgId, membershipId])

  async function sync() {
    if (!membershipId || !detail) return
    setBusy(true)
    try {
      const res = await fetch(`/api/orgs/${orgId}/members/${membershipId}/sync`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string })?.error || `HTTP ${res.status}`)
      toast.push({ kind: 'success', title: `Synced ${detail.user.name ?? `@${detail.user.login}`}` })
      router.refresh()
    } catch (e) {
      toast.push({ kind: 'error', title: 'Sync failed', body: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  async function brief() {
    if (!membershipId || !detail) return
    setBusy(true)
    try {
      const res = await fetch(
        `/api/orgs/${orgId}/members/${membershipId}/narrative?provider=groq`,
        { method: 'POST' },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string })?.error || `HTTP ${res.status}`)
      toast.push({ kind: 'success', title: `Brief generated` })
      // Reload detail
      const fresh = await fetch(`/api/orgs/${orgId}/members/${membershipId}/detail`)
      if (fresh.ok) setDetail(await fresh.json())
      router.refresh()
    } catch (e) {
      toast.push({ kind: 'error', title: 'Brief failed', body: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        detail ? (
          <span className="flex items-center gap-2.5">
            <CharacterAvatar characterKey={detail.user.characterKey} size={28} />
            <span>{detail.user.name ?? `@${detail.user.login}`}</span>
          </span>
        ) : (
          initialName
        )
      }
      subtitle={detail ? `${detail.role} · @${detail.user.login}` : 'Loading…'}
      footer={
        isManager && detail ? (
          <>
            <button
              type="button"
              onClick={sync}
              disabled={busy || !detail.user.hasGithub}
              className="px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[12.5px] font-medium disabled:opacity-50 transition"
            >
              {busy ? '…' : 'Sync GitHub'}
            </button>
            <button
              type="button"
              onClick={brief}
              disabled={busy}
              className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-700 text-white text-[12.5px] font-medium disabled:opacity-50 transition"
            >
              {busy ? '…' : 'Regenerate brief'}
            </button>
          </>
        ) : null
      }
    >
      {loading && <p className="text-[13px] text-slate-500 py-4">Loading details…</p>}
      {err && <p className="text-[13px] text-rose-600 py-4">{err}</p>}

      {detail && (
        <div className="space-y-5">
          {detail.story?.scenes && detail.story.scenes.length > 0 && (
            <Section title="Today's timeline" hint={`Generated ${timeAgo(detail.story.generatedAt)}`}>
              <TimelineRibbon scenes={detail.story.scenes} />
              <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {detail.story.scenes.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-slate-700">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: SCENE_COLOR[s.kind] }} />
                    <span>
                      <span className="text-slate-500 tabular-nums">
                        {fmtClock(s.startAt)}–{fmtClock(s.endAt)}
                      </span>{' '}
                      <span className="font-medium text-slate-900">{s.label}</span>
                      {s.detail && <span className="text-slate-500"> · {s.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {detail.narrative && (
            <Section title="Latest brief" hint={`${detail.narrative.signal} · ${timeAgo(detail.narrative.createdAt)}`}>
              <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-line">
                {detail.narrative.body}
              </p>
            </Section>
          )}

          {detail.latestShift && (
            <Section title="Latest shift">
              <p className="text-[12.5px] text-slate-700">
                {fmtDate(detail.latestShift.punchedInAt)} · in at {fmtClock(detail.latestShift.punchedInAt)}
                {detail.latestShift.punchedOutAt
                  ? ` → out at ${fmtClock(detail.latestShift.punchedOutAt)}`
                  : ' · ongoing'}
              </p>
              {detail.latestShift.workSummary && (
                <p className="mt-1.5 text-[12.5px] text-slate-600 leading-snug whitespace-pre-line">
                  {detail.latestShift.workSummary}
                </p>
              )}
            </Section>
          )}

          <Section
            title="GitHub activity"
            hint={
              detail.user.lastSyncedAt
                ? `Last sync ${timeAgo(detail.user.lastSyncedAt)}`
                : detail.user.hasGithub
                  ? 'Never synced'
                  : 'No GitHub linked'
            }
          >
            {detail.githubEvents.length === 0 ? (
              <p className="text-[12.5px] text-slate-500">No activity in the last 7 days.</p>
            ) : (
              <ul className="space-y-1.5 max-h-56 overflow-y-auto">
                {detail.githubEvents.map((e) => (
                  <li key={e.id} className="flex items-baseline gap-2 text-[12px]">
                    <span className="shrink-0 inline-flex items-center w-16 text-slate-500">
                      {TYPE_LABEL[e.type] ?? e.type}
                    </span>
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-900 hover:text-indigo-600 truncate"
                    >
                      {e.title}
                    </a>
                    <span className="ml-auto shrink-0 text-[11px] text-slate-400">{timeAgo(e.occurredAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {detail.recentBreaks.length > 0 && (
            <Section title="Recent breaks">
              <ul className="space-y-1.5">
                {detail.recentBreaks.slice(0, 6).map((b) => (
                  <li key={b.id} className="flex items-baseline gap-2 text-[12px] text-slate-700">
                    <span className="shrink-0 text-slate-500 w-16 capitalize">{b.category}</span>
                    <span className="truncate">{b.reason}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-slate-400">{timeAgo(b.startedAt)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {detail.recentLeaves.length > 0 && (
            <Section title="Recent leaves">
              <ul className="space-y-1.5">
                {detail.recentLeaves.slice(0, 5).map((l) => (
                  <li key={l.id} className="flex items-baseline gap-2 text-[12px] text-slate-700">
                    <span className="shrink-0 text-slate-500 w-20 capitalize">{l.leaveType}</span>
                    <span className="text-slate-900">{fmtRange(l.startDate, l.endDate)}</span>
                    <span className={`ml-auto shrink-0 pill ${pillFor(l.status)}`}>{l.status}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </Modal>
  )
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

function TimelineRibbon({ scenes }: { scenes: Scene[] }) {
  if (scenes.length === 0) return null
  const start = new Date(scenes[0]!.startAt).getTime()
  const end = new Date(scenes[scenes.length - 1]!.endAt).getTime()
  const span = Math.max(1, end - start)
  return (
    <div className="rounded-md overflow-hidden h-3 flex bg-slate-100 border border-slate-200">
      {scenes.map((s, i) => {
        const w = (new Date(s.endAt).getTime() - new Date(s.startAt).getTime()) / span * 100
        return (
          <div
            key={i}
            className="h-full"
            style={{ width: `${w}%`, background: SCENE_COLOR[s.kind] }}
            title={`${fmtClock(s.startAt)}–${fmtClock(s.endAt)} · ${s.label}`}
          />
        )
      })}
    </div>
  )
}

function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}
function fmtRange(s: string, e: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  const a = new Date(s + 'T00:00:00').toLocaleDateString(undefined, opts)
  const b = new Date(e + 'T00:00:00').toLocaleDateString(undefined, opts)
  return s === e ? a : `${a} – ${b}`
}
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
function pillFor(s: string): string {
  if (s === 'approved') return 'pill-good'
  if (s === 'denied') return 'pill-bad'
  if (s === 'cancelled') return 'pill-slate'
  return 'pill-warn'
}
