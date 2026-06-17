import { MarinaMark } from './marina-mark'

/**
 * Marina's morning brief — the hero of the manager dashboard.
 *
 * Instead of a bare "Good morning, Tanish" title, Marina greets the manager
 * personally and tells them, in one warm grounded line, exactly what (if
 * anything) needs them today — then signs it. This is the "first glance"
 * moment: a chief of staff who already read the room, not a dashboard.
 */
export function MarinaBrief({ greeting, line }: { greeting: string; line: string }) {
  return (
    <div className="mb-6 rounded-2xl border border-[var(--m-border)] bg-gradient-to-br from-[var(--m-accent-soft)]/70 via-white to-white p-5 flex items-start gap-4 shadow-[var(--m-shadow-sm)]">
      <MarinaMark size={38} className="mt-0.5" label="Marina" />
      <div className="min-w-0">
        <h1 className="app-h1">{greeting}</h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--m-ink-2)] max-w-2xl">{line}</p>
        <p className="mt-2 font-display italic text-[13px] text-[var(--m-ink-4)]">
          — Marina, your chief of staff
        </p>
      </div>
    </div>
  )
}

/**
 * Build Marina's one-line read of the morning from the dashboard snapshot.
 * Deterministic + grounded in real numbers (no model call) so the hero is
 * instant, free, and never hallucinates — but written in her voice: warm,
 * proactive, never alarmist.
 */
export function marinaBriefLine(s: {
  blockedOnYouCount: number
  blockerCount: number
  activeCount: number
  totalMembers: number
  onLeaveCount: number
}): string {
  const shipping = `${s.activeCount} of ${s.totalMembers} shipping`
  const leave = s.onLeaveCount ? `, ${s.onLeaveCount} on leave` : ''

  if (s.totalMembers === 0) {
    return "Your team's just getting set up. Invite a few people and I'll start watching the work so you don't have to."
  }
  if (s.blockedOnYouCount > 0) {
    const who = s.blockedOnYouCount === 1 ? 'teammate is' : 'teammates are'
    return `Heads up — ${s.blockedOnYouCount} ${who} waiting on you. ${cap(shipping)} today. Want to clear those first?`
  }
  if (s.blockerCount > 0) {
    const b = s.blockerCount === 1 ? 'blocker' : 'blockers'
    return `${s.blockerCount} ${b} to clear and ${shipping} today — I'd start with whoever's been stuck longest.`
  }
  if (s.activeCount >= Math.ceil(s.totalMembers * 0.6)) {
    return `Smooth morning — ${shipping}${leave}. Nothing needs you right now, so go do your own work.`
  }
  return `Quiet so far — ${shipping}${leave}. I'll flag anything the moment it needs you.`
}

function cap(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1)
}
