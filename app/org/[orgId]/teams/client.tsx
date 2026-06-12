'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CharacterAvatar } from '@/components/character-avatar'
import { Modal } from '@/components/modal'
import { useToast } from '@/components/toast'
import { TutorialHint } from '@/components/tutorial-hint'
import OrgChart from './org-chart'

type Member = {
  membershipId: number
  userId: number
  login: string
  name: string | null
  characterKey: string | null
  avatarUrl: string | null
  role: string
  discipline: string
  jobTitle: string | null
  /** Legacy "primary" manager — kept around for things like leave routing
   * that need a single target. */
  reportsToMembershipId: number | null
  /** All managers (multi-manager). The org chart uses this; if it's
   * missing we fall back to `[reportsToMembershipId]`. */
  managerMembershipIds: number[]
}

type Team = {
  id: number
  name: string
  description: string | null
  managerMembershipId: number | null
  color: string | null
  memberMembershipIds: number[]
}

type Tab = 'teams' | 'chart'

/**
 * Combined Teams + Org chart surface. Two tabs in one route — the data
 * shape is the same, just two ways to look at it. Edit access for both
 * tabs lives behind the `canEdit` flag (manage_members capability).
 */
export default function TeamsClient({
  orgId,
  viewerUserId,
  viewerMembershipId,
  canEdit,
  members,
  teams: initialTeams,
}: {
  orgId: number
  viewerUserId: number
  viewerMembershipId: number
  canEdit: boolean
  members: Member[]
  teams: Team[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('teams')
  const [teams, setTeams] = useState<Team[]>(initialTeams)
  const [editing, setEditing] = useState<Team | 'new' | null>(null)
  void viewerUserId

  const myTeams = useMemo(
    () => teams.filter((t) => t.memberMembershipIds.includes(viewerMembershipId)),
    [teams, viewerMembershipId],
  )

  // The reports-to chain above the viewer — useful for the "who do I report
  // to" employee section even when the chart isn't open.
  const reportsToChain = useMemo(() => {
    const byId = new Map(members.map((m) => [m.membershipId, m]))
    const chain: Member[] = []
    let cur = byId.get(viewerMembershipId)?.reportsToMembershipId ?? null
    let safety = 0
    while (cur && safety++ < 10) {
      const next = byId.get(cur)
      if (!next) break
      chain.push(next)
      cur = next.reportsToMembershipId
    }
    return chain
  }, [members, viewerMembershipId])

  async function deleteTeam(team: Team) {
    if (!confirm(`Delete team "${team.name}"? Members stay in the org.`)) return
    const res = await fetch(`/api/orgs/${orgId}/teams/${team.id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.push({ kind: 'error', title: 'Delete failed' })
      return
    }
    setTeams((ts) => ts.filter((t) => t.id !== team.id))
    toast.push({ kind: 'success', title: 'Team deleted' })
  }

  return (
    <>
      <div className="mb-3 flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="app-h1">Teams</h1>
          <p className="mt-1.5 text-[13px] text-slate-600">
            Sub-groups inside your workspace. Build them around projects, products, or pods —
            employees can be on multiple teams.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-700 text-white text-[12.5px] font-medium transition"
          >
            + New team
          </button>
        )}
      </div>

      <div className="mb-4">
        <TutorialHint id="teams-intro" title="Teams + Chart" tone="sage">
          Use <b>Teams</b> to group people by project or pod. Use <b>Chart</b> to define
          who-reports-to-who across the whole org — drag any box onto another to create a
          reports-to edge. Both views are exportable.
        </TutorialHint>
      </div>

      {/* Manager handout — print-to-PDF setup guide + app download links.
          We show this to every viewer (employees use it for their own
          install too), and surface it prominently so HR doesn't have to
          hunt for it on the marketing site. */}
      <SetupGuideCard canEdit={canEdit} />

      {/* Tab strip */}
      <div className="mb-4 inline-flex bg-white border border-slate-200 rounded-lg p-0.5">
        <TabButton active={tab === 'teams'} onClick={() => setTab('teams')}>
          Teams <span className="ml-1 text-slate-400 tabular-nums">{teams.length}</span>
        </TabButton>
        <TabButton active={tab === 'chart'} onClick={() => setTab('chart')}>
          Org chart
        </TabButton>
      </div>

      {tab === 'teams' && (
        <>
          {/* "Your teams" pill — shown to everyone so employees can confirm
              what they're on. */}
          {myTeams.length > 0 && (
            <section className="mb-5 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
                You&apos;re on
              </p>
              <div className="flex flex-wrap gap-1.5">
                {myTeams.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 text-[11.5px] font-medium px-2 py-0.5 rounded-full bg-[var(--m-accent-soft)] text-[var(--m-accent-2)]"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: t.color ?? 'var(--m-accent)' }}
                    />
                    {t.name}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* "Who you report to" pill */}
          {reportsToChain.length > 0 && (
            <section className="mb-5 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
                You report to
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {reportsToChain.map((m, i) => (
                  <span key={m.membershipId} className="inline-flex items-center gap-1.5">
                    <CharacterAvatar
                      characterKey={m.characterKey}
                      imageUrl={m.avatarUrl}
                      size={20}
                    />
                    <span className="text-[12.5px] text-slate-800">{m.name ?? `@${m.login}`}</span>
                    {i < reportsToChain.length - 1 && (
                      <span className="text-slate-300">→</span>
                    )}
                  </span>
                ))}
              </div>
            </section>
          )}

          {teams.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
              <p className="font-display text-[20px] text-[var(--m-ink)] leading-tight">
                No teams yet.
              </p>
              <p className="mt-1.5 text-[13px] text-slate-500">
                {canEdit
                  ? 'Click "+ New team" to spin one up. Teams help group people for standups, reports and DMs.'
                  : 'Ask an admin to set up teams — they help map who works on what.'}
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {teams.map((t) => {
                const teamMembers = members.filter((m) => t.memberMembershipIds.includes(m.membershipId))
                const manager = t.managerMembershipId
                  ? members.find((m) => m.membershipId === t.managerMembershipId)
                  : null
                return (
                  <li
                    key={t.id}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                    style={t.color ? { borderLeftColor: t.color, borderLeftWidth: 4 } : undefined}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-slate-900">{t.name}</p>
                        {t.description && (
                          <p className="text-[12px] text-slate-500 mt-0.5 leading-snug">{t.description}</p>
                        )}
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditing(t)}
                            className="text-[11.5px] text-slate-600 hover:text-slate-900 font-medium"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteTeam(t)}
                            className="text-[11.5px] text-rose-600 hover:text-rose-700 font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>

                    {manager && (
                      <div className="mt-3 flex items-center gap-2 text-[12px]">
                        <span className="text-slate-500">Lead:</span>
                        <CharacterAvatar
                          characterKey={manager.characterKey}
                          imageUrl={manager.avatarUrl}
                          size={20}
                        />
                        <span className="text-slate-800 font-medium">
                          {manager.name ?? `@${manager.login}`}
                        </span>
                      </div>
                    )}

                    <div className="mt-3 flex items-center gap-1 flex-wrap">
                      {teamMembers.slice(0, 8).map((m) => (
                        <span
                          key={m.membershipId}
                          title={m.name ?? m.login}
                          className="inline-block"
                        >
                          <CharacterAvatar
                            characterKey={m.characterKey}
                            imageUrl={m.avatarUrl}
                            size={24}
                          />
                        </span>
                      ))}
                      {teamMembers.length > 8 && (
                        <span className="text-[11px] text-slate-500 ml-1">
                          +{teamMembers.length - 8}
                        </span>
                      )}
                      {teamMembers.length === 0 && (
                        <span className="text-[11.5px] text-slate-400 italic">No members yet.</span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      {tab === 'chart' && (
        <OrgChart members={members} canEdit={canEdit} orgId={orgId} />
      )}

      {editing && (
        <TeamEditor
          orgId={orgId}
          members={members}
          team={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(t) => {
            setTeams((prev) => {
              const ix = prev.findIndex((x) => x.id === t.id)
              if (ix === -1) return [...prev, t]
              const next = [...prev]
              next[ix] = t
              return next
            })
            setEditing(null)
            router.refresh()
          }}
        />
      )}
    </>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-[12.5px] font-medium transition ${
        active
          ? 'bg-slate-900 text-white shadow-sm'
          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  )
}

/* -------------------------- Team editor modal -------------------------- */

function TeamEditor({
  orgId,
  members,
  team,
  onClose,
  onSaved,
}: {
  orgId: number
  members: Member[]
  team: Team | null
  onClose: () => void
  onSaved: (t: Team) => void
}) {
  const toast = useToast()
  const [name, setName] = useState(team?.name ?? '')
  const [description, setDescription] = useState(team?.description ?? '')
  const [color, setColor] = useState(team?.color ?? '#3f6b54')
  const [managerId, setManagerId] = useState<number | null>(team?.managerMembershipId ?? null)
  const [memberIds, setMemberIds] = useState<Set<number>>(
    new Set(team?.memberMembershipIds ?? []),
  )
  const [busy, setBusy] = useState(false)

  function toggle(id: number) {
    setMemberIds((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    setBusy(true)
    try {
      const payload = {
        name,
        description: description || null,
        color,
        managerMembershipId: managerId,
        memberMembershipIds: Array.from(memberIds),
      }
      const url = team
        ? `/api/orgs/${orgId}/teams/${team.id}`
        : `/api/orgs/${orgId}/teams`
      const res = await fetch(url, {
        method: team ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'save failed')
      const saved: Team = team
        ? { ...team, name, description, color, managerMembershipId: managerId, memberMembershipIds: Array.from(memberIds) }
        : {
            id: data.team.id,
            name,
            description,
            color,
            managerMembershipId: managerId,
            memberMembershipIds: Array.from(memberIds),
          }
      onSaved(saved)
    } catch (e) {
      toast.push({
        kind: 'error',
        title: 'Save failed',
        body: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={team ? `Edit ${team.name}` : 'New team'}
      subtitle="Teams are sub-groups inside your workspace — pods, projects, departments."
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy || !name.trim()}
            className="btn-primary"
          >
            {busy ? 'Saving…' : team ? 'Save changes' : 'Create team'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-3">
          <div>
            <label className="app-eyebrow block mb-1.5">Team name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              className="input w-full"
              placeholder="e.g. Mobile · Growth · Customer Support"
            />
          </div>
          <div>
            <label className="app-eyebrow block mb-1.5">Color</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-full h-[38px] rounded-md border border-slate-200 cursor-pointer"
            />
          </div>
        </div>

        <div>
          <label className="app-eyebrow block mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={2}
            className="textarea w-full"
            placeholder="What does this team work on?"
          />
        </div>

        <div>
          <label className="app-eyebrow block mb-1.5">Team lead (optional)</label>
          <select
            value={managerId ?? ''}
            onChange={(e) => setManagerId(e.target.value ? Number(e.target.value) : null)}
            className="select w-full"
          >
            <option value="">No lead</option>
            {members.map((m) => (
              <option key={m.membershipId} value={m.membershipId}>
                {m.name ?? `@${m.login}`} · {m.jobTitle ?? m.discipline}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="app-eyebrow block mb-1.5">Members ({memberIds.size})</label>
          <ul className="max-h-[280px] overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
            {members.map((m) => {
              const checked = memberIds.has(m.membershipId)
              return (
                <li key={m.membershipId}>
                  <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(m.membershipId)}
                      className="w-4 h-4 accent-[var(--m-accent)]"
                    />
                    <CharacterAvatar
                      characterKey={m.characterKey}
                      imageUrl={m.avatarUrl}
                      size={26}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-slate-900 truncate">
                        {m.name ?? `@${m.login}`}
                      </p>
                      <p className="text-[11.5px] text-slate-500 truncate">
                        {m.jobTitle ?? m.discipline}
                      </p>
                    </div>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </Modal>
  )
}

/* -------------------------- Org chart -------------------------- */


/**
 * Onboarding cheat card for managers. Two columns:
 *   1. Print-ready employee setup guide (links to /setup-guide which has a
 *      "Download as PDF" button at the top).
 *   2. Direct download links for the Mac + Windows desktop agent so the
 *      manager can copy-paste them into Slack / email.
 *
 * Always visible to every role — employees use the download links for
 * their own machines, and seeing the guide is good context regardless.
 */
function SetupGuideCard({ canEdit }: { canEdit: boolean }) {
  void canEdit
  return (
    <section className="mb-5 rounded-xl border border-[var(--m-border)] bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-[11px] uppercase tracking-wider text-[var(--m-accent)] font-semibold">
          Manager toolkit
        </p>
        <p className="text-[13.5px] font-semibold text-slate-900 mt-0.5">
          Get your team onto the desktop agent
        </p>
        <p className="text-[12px] text-slate-500 mt-0.5">
          Print the setup guide or copy the download links into your onboarding email.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
        {/* Setup guide */}
        <div className="p-4">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-lg bg-[var(--m-accent-soft)] inline-flex items-center justify-center text-[var(--m-accent)] shrink-0">
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path d="M4 4h12l4 4v12H4z" />
                <path d="M14 4v6h6M8 14h8M8 18h5" strokeLinecap="round" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-slate-900">Employee setup guide</p>
              <p className="text-[12px] text-slate-500 mt-0.5 leading-snug">
                One-page handout — invite → install → pair → first day. Print or save as PDF
                and hand to every new hire.
              </p>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <a
                  href="/setup-guide"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-700 text-white text-[12px] font-medium transition"
                >
                  Open guide
                </a>
                <a
                  href="/setup-guide"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] text-slate-600 hover:text-slate-900 font-medium"
                >
                  Print → Save as PDF
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* App download */}
        <div className="p-4">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-lg bg-[var(--m-clay-soft)] inline-flex items-center justify-center text-[var(--m-clay-deep)] shrink-0">
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-slate-900">Desktop agent download</p>
              <p className="text-[12px] text-slate-500 mt-0.5 leading-snug">
                Direct links you can paste into Slack or email. The agent runs in the menubar
                / system tray — Mac + Windows.
              </p>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <a
                  href="/download"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-700 text-white text-[12px] font-medium transition"
                >
                  Open download page
                </a>
                <button
                  type="button"
                  onClick={() => {
                    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.marina.in'
                    void navigator.clipboard?.writeText(`${origin}/download`)
                  }}
                  className="text-[12px] text-slate-600 hover:text-slate-900 font-medium"
                >
                  Copy share link
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
