import { loadAllOrgKpis, formatUsd, formatAgo } from '@/lib/admin/analytics'
import { WorkspacesClient } from './client'

export const dynamic = 'force-dynamic'

export default async function AdminWorkspacesPage() {
  const orgs = await loadAllOrgKpis()
  return (
    <div>
      <header className="mb-7">
        <p className="text-[11px] tracking-widest uppercase text-amber-400/80 font-semibold">
          Founder console
        </p>
        <h1 className="font-display text-[32px] leading-tight mt-1 text-white">Workspaces</h1>
        <p className="text-[13.5px] text-slate-400 mt-1">
          Every org on the platform · {orgs.length} total.
        </p>
      </header>

      <WorkspacesClient
        orgs={orgs.map((o) => ({
          ...o,
          spendUsd: formatUsd(o.aiSpendCentsThisMonth),
          lastActivityFmt: formatAgo(o.lastActivityAt),
        }))}
      />
    </div>
  )
}
