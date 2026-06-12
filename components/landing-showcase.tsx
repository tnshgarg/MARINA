/**
 * Landing-page "see it in action" mockup blocks. Pure SSR — no client JS.
 *
 * Each mockup is a hand-tuned approximation of the real product surface so
 * visitors get a strong taste of MARINA before signing up. The shapes match
 * the in-app components (status pills, sage/clay tone, action verbs) so the
 * transition from landing to product feels seamless.
 *
 * If a real surface is redesigned, update its mockup here too — the marketing
 * page should never lie about what's behind the login.
 */

export function BlockerResolverMockup() {
  return (
    <MockupShell label="Blocker Resolver · Acme">
      <div className="px-5 pt-4 pb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[var(--m-bad)] flex items-center gap-1.5">
              <span className="relative inline-flex">
                <span className="absolute inset-0 rounded-full bg-[var(--m-bad)]/40 animate-ping" />
                <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-[var(--m-bad)]" />
              </span>
              Active blocker · 47 min
            </p>
            <p className="font-display text-[19px] text-[var(--m-ink)] mt-1.5 leading-tight">
              Priya is waiting on <span className="italic text-[var(--m-clay-deep)]">@arjun</span>
            </p>
            <p className="text-[12.5px] text-[var(--m-ink-3)] mt-1">
              Brand review pending sign-off · marketing
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 text-[11px] font-medium px-2 py-1 rounded-md bg-white border border-[var(--m-border)] text-[var(--m-ink-3)] hover:text-[var(--m-ink)]"
            disabled
          >
            ✕
          </button>
        </div>

        {/* Context strip */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <ContextTile label="Last activity" value="11 min ago" />
          <ContextTile label="On a call" value="Yes · Zoom" />
          <ContextTile label="Slack last seen" value="2 hr ago" />
        </div>

        {/* Actions */}
        <div className="mt-4 space-y-2">
          <PrimaryAction>Unblock teammate</PrimaryAction>
          <div className="grid grid-cols-3 gap-2">
            <SecondaryAction icon="ping">Nudge @arjun</SecondaryAction>
            <SecondaryAction icon="route">Route to teammate</SecondaryAction>
            <SecondaryAction icon="note">Suggest fix</SecondaryAction>
          </div>
        </div>

        {/* Thread preview */}
        <div className="mt-4 pt-3 border-t border-[var(--m-border-soft)]">
          <p className="text-[10px] uppercase tracking-wider text-[var(--m-ink-4)] mb-2">
            Conversation
          </p>
          <ThreadBubble
            tone="ink"
            name="Tanish"
            time="just now"
            text="Routed to @sneha — she covers brand while Arjun's on leave."
          />
          <ThreadBubble
            tone="clay"
            name="Sneha"
            time="20 sec ago"
            text="On it. Pulling the deck — back in 10."
          />
        </div>
      </div>
    </MockupShell>
  )
}

export function ScrumModeMockup() {
  return (
    <MockupShell label="Scrum Mode · Engineering">
      <div className="px-5 pt-4 pb-5">
        <div className="flex items-baseline justify-between mb-3">
          <p className="font-display text-[19px] text-[var(--m-ink)] leading-tight">
            Standup · Tue 9:32 AM
          </p>
          <p className="text-[11px] text-[var(--m-ink-3)] tabular-nums">
            3 of 7 covered · <span className="text-[var(--m-accent)] font-medium">4 min in</span>
          </p>
        </div>

        {/* Person card */}
        <div className="rounded-xl border border-[var(--m-accent)]/40 bg-gradient-to-br from-[var(--m-accent-soft)] to-white p-4 shadow-[var(--m-shadow-sm)]">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-9 h-9 rounded-md bg-[var(--m-accent)] text-white text-[13px] font-semibold inline-flex items-center justify-center">
              R
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-semibold text-[var(--m-ink)]">Ravi Iyer</p>
              <p className="text-[11px] text-[var(--m-ink-3)]">Backend · 4 of 7</p>
            </div>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--m-good-soft)] text-[var(--m-good)]">
              ▶ now covering
            </span>
          </div>

          <ScrumLine label="Yesterday" tone="ink">
            Shipped auth-rate-limit refactor (PR #482) + paired with Vikram on the GST invoice job.
          </ScrumLine>
          <ScrumLine label="Today" tone="accent">
            Wire pagination on /admin/audit-logs, code-review for Priya's webhook signature change.
          </ScrumLine>
          <ScrumLine label="Blocker" tone="bad">
            Need staging Neon creds rotated — pinged Devops, no reply.
          </ScrumLine>
        </div>

        {/* Queue strip */}
        <div className="mt-3 flex items-center gap-1.5 overflow-hidden">
          {['T', 'A', 'P', 'R', 'S', 'V', 'K'].map((letter, i) => {
            const covered = i < 3
            const active = i === 3
            return (
              <span
                key={i}
                className={`shrink-0 w-7 h-7 rounded-md inline-flex items-center justify-center text-[10.5px] font-semibold ${
                  active
                    ? 'bg-[var(--m-accent)] text-white ring-2 ring-[var(--m-accent)]/30'
                    : covered
                      ? 'bg-[var(--m-good-soft)] text-[var(--m-good)]'
                      : 'bg-[var(--m-bg-soft)] text-[var(--m-ink-3)]'
                }`}
              >
                {letter}
              </span>
            )
          })}
          <span className="ml-auto text-[10px] text-[var(--m-ink-4)] tabular-nums">
            ← → to navigate · space to mark
          </span>
        </div>
      </div>
    </MockupShell>
  )
}

export function MemberDetailMockup() {
  return (
    <MockupShell label="Anika Roy · Design">
      <div className="px-5 pt-4 pb-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <span className="w-12 h-12 rounded-xl bg-[var(--m-clay-soft)] text-[var(--m-clay-deep)] font-semibold inline-flex items-center justify-center text-[16px]">
            A
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-display text-[18px] text-[var(--m-ink)] leading-tight">Anika Roy</p>
            <p className="text-[11.5px] text-[var(--m-ink-3)] mt-0.5">
              Senior Designer · joined 14 Jan 2024 · reports to Tanish
            </p>
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <Pill tone="good">Working · 4h 12m</Pill>
              <Pill tone="info">Figma · Mobile onboarding</Pill>
              <Pill tone="clay">Productivity 78%</Pill>
            </div>
          </div>
        </div>

        {/* Tab strip */}
        <div className="mt-4 -mx-1 px-1 flex items-center gap-4 border-b border-[var(--m-border-soft)] text-[11.5px]">
          {[
            ['Overview', true],
            ['Attendance', false],
            ['Shifts', false],
            ['Activity', false],
            ['Profile', false],
          ].map(([label, active]) => (
            <span
              key={label as string}
              className={`pb-2 -mb-px ${
                active
                  ? 'text-[var(--m-ink)] border-b-2 border-[var(--m-accent)] font-medium'
                  : 'text-[var(--m-ink-4)]'
              }`}
            >
              {label as string}
            </span>
          ))}
        </div>

        {/* Today story bullets */}
        <p className="mt-3 text-[10px] tracking-wider uppercase text-[var(--m-ink-4)] font-semibold">
          Today
        </p>
        <ul className="mt-1.5 space-y-1.5 text-[12.5px]">
          <li className="flex items-start gap-2 text-[var(--m-ink)]">
            <span className="mt-1 inline-block w-1 h-1 rounded-full bg-[var(--m-clay)]" />
            <span>Finished hi-fi screens for the mobile sign-up flow — 4 frames, 11 components</span>
          </li>
          <li className="flex items-start gap-2 text-[var(--m-ink)]">
            <span className="mt-1 inline-block w-1 h-1 rounded-full bg-[var(--m-accent)]" />
            <span>Reviewed Vikram&rsquo;s dashboard tile redesign — left 6 inline comments</span>
          </li>
          <li className="flex items-start gap-2 text-[var(--m-ink-3)]">
            <span className="mt-1 inline-block w-1 h-1 rounded-full bg-[var(--m-ink-5)]" />
            <span>Off 45 min for lunch · back at 1:15</span>
          </li>
        </ul>

        {/* This week mini chart */}
        <p className="mt-4 text-[10px] tracking-wider uppercase text-[var(--m-ink-4)] font-semibold">
          This week
        </p>
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          {[
            { d: 'Mon', h: 7.2 },
            { d: 'Tue', h: 8.1 },
            { d: 'Wed', h: 6.4 },
            { d: 'Thu', h: 7.8 },
            { d: 'Fri', h: 4.2, today: true },
          ].map((c) => (
            <div key={c.d} className="text-center">
              <div
                className="h-12 rounded-md flex items-end justify-center pb-0.5"
                style={{
                  background: c.today
                    ? 'linear-gradient(180deg, transparent, var(--m-accent-soft))'
                    : 'var(--m-bg-soft)',
                }}
              >
                <div
                  className="w-3 rounded-sm"
                  style={{
                    height: `${(c.h / 9) * 100}%`,
                    background: c.today ? 'var(--m-accent)' : 'var(--m-ink-5)',
                  }}
                />
              </div>
              <p className="mt-1 text-[10px] text-[var(--m-ink-4)] tabular-nums">{c.d}</p>
            </div>
          ))}
        </div>
      </div>
    </MockupShell>
  )
}

export function ActivityFeedMockup() {
  return (
    <MockupShell label="Activity feed · Today">
      <div className="px-5 pt-4 pb-5">
        <div className="flex items-baseline justify-between mb-2">
          <p className="font-display text-[18px] text-[var(--m-ink)] leading-tight">
            What happened today
          </p>
          <p className="text-[11px] text-[var(--m-ink-3)]">12 events · live</p>
        </div>
        <div className="-mx-5 px-5 max-h-[360px] overflow-hidden">
          <ol className="relative ml-2 pl-4 border-l border-[var(--m-border)]">
            <FeedEvent
              tone="good"
              time="2 min ago"
              who="Priya N."
              verb="shipped"
              what="Fix double-submit on leave form (PR #491)"
              meta="acme/web"
            />
            <FeedEvent
              tone="clay"
              time="6 min ago"
              who="Anika R."
              verb="marked done"
              what="Hi-fi screens for mobile onboarding"
              meta="design"
            />
            <FeedEvent
              tone="bad"
              time="14 min ago"
              who="Arjun M."
              verb="is blocked"
              what="Waiting on staging credentials"
              meta="47 min stuck"
            />
            <FeedEvent
              tone="info"
              time="22 min ago"
              who="Vikram S."
              verb="closed a deal"
              what="Hexagon Tech · ₹14L MRR"
              meta="sales"
            />
            <FeedEvent
              tone="accent"
              time="36 min ago"
              who="Ravi I."
              verb="started a focus block"
              what="Pagination on /admin/audit-logs"
              meta="engineering"
            />
          </ol>
        </div>
      </div>
    </MockupShell>
  )
}

/**
 * Teams + Org chart mockup. Two mini-views in one card: a teams pill row
 * on top, then a compressed reports-to tree underneath. Reads in 3 seconds
 * what the in-product feature actually does.
 */
export function TeamsMockup() {
  // Minimal node — name, title, role chip color.
  const nodes = [
    { x: 110, y: 16, n: 'Tanish', t: 'CEO', tone: 'gold' },
    { x: 218, y: 16, n: 'Maya', t: 'CTO', tone: 'gold' },
    { x: 30, y: 110, n: 'Aisha', t: 'Head of People', tone: 'sage' },
    { x: 138, y: 110, n: 'Rahul', t: 'Eng Manager', tone: 'sage' },
    { x: 246, y: 110, n: 'Priya', t: 'Head of Product', tone: 'sage' },
    { x: 12, y: 204, n: 'Sid', t: 'Support Lead', tone: 'neutral' },
    { x: 80, y: 204, n: 'Arjun', t: 'Backend', tone: 'neutral' },
    { x: 148, y: 204, n: 'Logan', t: 'Frontend', tone: 'neutral' },
    { x: 216, y: 204, n: 'Sneha', t: 'Designer', tone: 'neutral' },
    { x: 284, y: 204, n: 'Tara', t: 'PM', tone: 'neutral' },
  ] as const

  // Connectors as orthogonal paths from a parent (px, py) to a child (cx, cy)
  const edges: Array<[number, number, number, number]> = [
    [148, 60, 64, 110],   // Tanish → Aisha
    [148, 60, 172, 110],  // Tanish → Rahul
    [256, 60, 280, 110],  // Maya → Priya
    [64, 154, 46, 204],   // Aisha → Sid
    [172, 154, 114, 204], // Rahul → Arjun
    [172, 154, 182, 204], // Rahul → Logan
    [280, 154, 250, 204], // Priya → Sneha
    [280, 154, 318, 204], // Priya → Tara
  ]

  return (
    <MockupShell label="Teams + Org chart · Acme">
      <div className="px-5 pt-4 pb-5">
        {/* Team pills */}
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <p className="font-display text-[18px] text-[var(--m-ink)] leading-tight">
            Five teams, one chart
          </p>
          <span className="text-[10.5px] text-[var(--m-ink-4)] uppercase tracking-wider">5 teams · 16 people</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          <TeamPill color="var(--m-accent)" label="Engineering · 6" />
          <TeamPill color="var(--m-clay)" label="Design + Product · 4" />
          <TeamPill color="var(--m-gold)" label="Go-to-market · 5" />
          <TeamPill color="#7c2d12" label="People + Ops · 6" />
          <TeamPill color="#1f3d2c" label="Founders · 2" />
        </div>

        {/* Chart */}
        <div className="relative rounded-lg border border-[var(--m-border-soft)] bg-[radial-gradient(circle_at_1px_1px,_rgba(15,23,42,0.06)_1px,_transparent_0)] bg-[length:14px_14px] h-[260px] overflow-hidden">
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 360 260"
            className="absolute inset-0"
            aria-hidden
          >
            <g
              fill="none"
              stroke="#cbd5e1"
              strokeWidth={1.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {edges.map(([sx, sy, tx, ty], i) => {
                const mid = (sy + ty) / 2
                return (
                  <path
                    key={i}
                    d={`M ${sx} ${sy} L ${sx} ${mid} L ${tx} ${mid} L ${tx} ${ty}`}
                  />
                )
              })}
            </g>
            {nodes.map((n, i) => (
              <ChartNode key={i} x={n.x} y={n.y} name={n.n} title={n.t} tone={n.tone} />
            ))}
          </svg>
        </div>

        {/* Caption */}
        <p className="mt-3 text-[11px] text-[var(--m-ink-4)] text-center">
          Drag any card onto another to set reports-to · export as SVG · print to share
        </p>
      </div>
    </MockupShell>
  )
}

function TeamPill({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-white border border-[var(--m-border-soft)] text-[var(--m-ink-2)]">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

function ChartNode({
  x,
  y,
  name,
  title,
  tone,
}: {
  x: number
  y: number
  name: string
  title: string
  tone: 'gold' | 'sage' | 'neutral'
}) {
  const fill =
    tone === 'gold' ? '#fdf6e7' : tone === 'sage' ? '#eaf2ed' : '#ffffff'
  const stroke =
    tone === 'gold' ? 'rgba(193,154,77,0.45)' : tone === 'sage' ? 'rgba(63,107,84,0.4)' : '#e2e8f0'
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect
        width={64}
        height={44}
        rx={8}
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
      />
      <text x={32} y={20} fontSize={9.5} fontWeight={600} fill="#0f172a" textAnchor="middle">
        {name}
      </text>
      <text x={32} y={32} fontSize={7.5} fill="#64748b" textAnchor="middle">
        {title}
      </text>
    </g>
  )
}

/* ============================ shared bits ============================ */

function MockupShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      {/* Decorative depth offset */}
      <div className="absolute inset-0 translate-x-3 translate-y-4 rounded-[20px] bg-[var(--m-bg-soft)] border border-[var(--m-border)] -z-10" />
      <div className="relative rounded-[20px] bg-white border border-[var(--m-border)] shadow-[var(--m-shadow-xl)] overflow-hidden">
        {/* Chrome */}
        <div className="flex items-center gap-1.5 px-5 pt-4">
          <span className="w-2.5 h-2.5 rounded-full bg-[#e5e0d4]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#e5e0d4]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#e5e0d4]" />
          <span className="ml-3 text-[10.5px] tracking-wider uppercase text-[var(--m-ink-4)]">
            {label}
          </span>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-[var(--m-good)] font-medium">
            <span className="relative inline-flex">
              <span className="absolute inset-0 rounded-full bg-[var(--m-good)]/40 animate-ping" />
              <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-[var(--m-good)]" />
            </span>
            live
          </span>
        </div>
        {children}
      </div>
    </div>
  )
}

function ContextTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--m-border-soft)] bg-[var(--m-bg-soft)]/50 px-2.5 py-2">
      <p className="text-[9.5px] uppercase tracking-wider text-[var(--m-ink-4)]">{label}</p>
      <p className="mt-0.5 text-[12px] text-[var(--m-ink)] font-medium">{value}</p>
    </div>
  )
}

function PrimaryAction({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled
      className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-[var(--m-accent)] text-white text-[13px] font-medium shadow-[var(--m-shadow-sm)]"
    >
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M5 13l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </button>
  )
}

function SecondaryAction({
  icon,
  children,
}: {
  icon: 'ping' | 'route' | 'note'
  children: React.ReactNode
}) {
  const path =
    icon === 'ping' ? <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
    : icon === 'route' ? <path d="M3 12h6l3-6 4 14 3-8h2" strokeLinecap="round" strokeLinejoin="round" />
    : <path d="M5 4h14v16H5z M9 8h6M9 12h6M9 16h4" strokeLinecap="round" strokeLinejoin="round" />
  return (
    <button
      type="button"
      disabled
      className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg bg-white border border-[var(--m-border)] text-[11.5px] text-[var(--m-ink-2)] font-medium"
    >
      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
        {path}
      </svg>
      {children}
    </button>
  )
}

function ThreadBubble({
  tone,
  name,
  time,
  text,
}: {
  tone: 'ink' | 'clay'
  name: string
  time: string
  text: string
}) {
  const bg = tone === 'ink' ? 'bg-[var(--m-bg-soft)]' : 'bg-[var(--m-clay-soft)]/60'
  const dot = tone === 'ink' ? 'var(--m-ink)' : 'var(--m-clay)'
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
        <span className="text-[11px] font-medium text-[var(--m-ink-2)]">{name}</span>
        <span className="text-[10px] text-[var(--m-ink-4)]">· {time}</span>
      </div>
      <p className={`${bg} text-[12px] text-[var(--m-ink)] rounded-lg px-2.5 py-1.5 leading-snug`}>
        {text}
      </p>
    </div>
  )
}

function ScrumLine({
  label,
  tone,
  children,
}: {
  label: string
  tone: 'ink' | 'accent' | 'bad'
  children: React.ReactNode
}) {
  const color =
    tone === 'ink' ? 'var(--m-ink-3)' :
    tone === 'accent' ? 'var(--m-accent)' :
    'var(--m-bad)'
  return (
    <div className="flex items-start gap-2 mb-1.5 last:mb-0">
      <span
        className="text-[10px] font-semibold uppercase tracking-wider mt-0.5 w-[68px] shrink-0"
        style={{ color }}
      >
        {label}
      </span>
      <p className="text-[12.5px] text-[var(--m-ink)] leading-snug flex-1">{children}</p>
    </div>
  )
}

function Pill({ tone, children }: { tone: 'good' | 'info' | 'clay'; children: React.ReactNode }) {
  const bg =
    tone === 'good' ? 'bg-[var(--m-good-soft)] text-[var(--m-good)]' :
    tone === 'info' ? 'bg-[var(--m-info-soft)] text-[var(--m-info)]' :
    'bg-[var(--m-clay-soft)] text-[var(--m-clay-deep)]'
  return (
    <span className={`inline-flex items-center gap-1 text-[10.5px] font-medium px-2 py-0.5 rounded-full ${bg}`}>
      <span className="inline-block w-1 h-1 rounded-full bg-current" />
      {children}
    </span>
  )
}

function FeedEvent({
  tone,
  time,
  who,
  verb,
  what,
  meta,
}: {
  tone: 'good' | 'bad' | 'info' | 'clay' | 'accent'
  time: string
  who: string
  verb: string
  what: string
  meta: string
}) {
  const dot =
    tone === 'good' ? 'var(--m-good)' :
    tone === 'bad' ? 'var(--m-bad)' :
    tone === 'info' ? 'var(--m-info)' :
    tone === 'clay' ? 'var(--m-clay)' :
    'var(--m-accent)'
  return (
    <li className="relative pb-3 last:pb-0">
      <span
        className="absolute -left-[1.13rem] top-1 w-2.5 h-2.5 rounded-full ring-2 ring-white"
        style={{ background: dot }}
      />
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className="text-[12.5px] font-medium text-[var(--m-ink)]">{who}</span>
        <span className="text-[11.5px] text-[var(--m-ink-3)]">{verb}</span>
        <span className="text-[12.5px] text-[var(--m-ink)] flex-1 min-w-0 truncate">{what}</span>
      </div>
      <p className="text-[10.5px] text-[var(--m-ink-4)] mt-0.5 tabular-nums">
        {time} · {meta}
      </p>
    </li>
  )
}
