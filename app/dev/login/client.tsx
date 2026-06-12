'use client'

import { useState } from 'react'
import { CharacterAvatar } from '@/components/character-avatar'

type DevUser = {
  id: number
  login: string
  name: string | null
  email: string | null
  characterKey: string | null
  orgs: Array<{ orgName: string; role: string }>
}

export default function DevLoginClient({
  users,
  devSignIn,
}: {
  users: DevUser[]
  devSignIn: (fd: FormData) => Promise<void>
}) {
  const [query, setQuery] = useState('')

  const filtered = users.filter((u) => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      u.login.toLowerCase().includes(q) ||
      (u.name ?? '').toLowerCase().includes(q) ||
      (u.email ?? '').toLowerCase().includes(q) ||
      u.orgs.some((o) => o.orgName.toLowerCase().includes(q))
    )
  })

  return (
    <>
      <input
        type="search"
        placeholder="Search by name, login, email, org…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="input mb-6"
      />

      {filtered.length === 0 && (
        <p className="text-center text-slate-500 py-10">No matching users.</p>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((u) => (
          <form key={u.id} action={devSignIn}>
            <input type="hidden" name="userId" value={u.id} />
            <button
              type="submit"
              className="w-full text-left rounded-2xl border border-slate-200 bg-white p-4 hover:border-[var(--m-accent)]/40 hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <div className="flex items-center gap-3 mb-2">
                <CharacterAvatar characterKey={u.characterKey} size={42} />
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-slate-900 truncate">
                    {u.name ?? `@${u.login}`}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">@{u.login}</p>
                </div>
              </div>
              {u.email && (
                <p className="text-[11px] text-slate-500 truncate">{u.email}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-1">
                {u.orgs.length === 0 ? (
                  <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    No org
                  </span>
                ) : (
                  u.orgs.map((o) => (
                    <span
                      key={`${o.orgName}-${o.role}`}
                      className={`text-[10px] px-2 py-0.5 rounded-full ${
                        o.role === 'owner'
                          ? 'bg-[var(--m-clay-soft)] text-[var(--m-clay-deep)]'
                          : o.role === 'manager'
                            ? 'bg-[var(--m-accent-soft)] text-[var(--m-accent-2)]'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {o.orgName} · {o.role}
                    </span>
                  ))
                )}
              </div>
            </button>
          </form>
        ))}
      </div>
    </>
  )
}
