"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CharacterAvatar } from "@/components/character-avatar";
import { Modal } from "@/components/modal";
import { TutorialHint } from "@/components/tutorial-hint";
import { useToast } from "@/components/toast";
import { ScheduleMeetingDialog as SharedScheduleMeetingDialog } from "@/components/schedule-meeting-dialog";

type StorySceneKind =
  | "shift_start"
  | "shift_end"
  | "meeting"
  | "coding"
  | "design"
  | "comms"
  | "reading"
  | "browsing"
  | "media"
  | "break"
  | "leave"
  | "idle"
  | "mixed"
  | "unknown";

type Scene = {
  startAt: string;
  endAt: string;
  kind: StorySceneKind;
  label: string;
  detail?: string;
  evidence?: {
    topApp?: string | null;
    activeSeconds?: number;
    idleSeconds?: number;
    githubEvents?: number;
    screenshotLabels?: Record<string, number>;
    breakReason?: string;
  };
};

type Discipline =
  | "engineering"
  | "design"
  | "product"
  | "sales"
  | "support"
  | "marketing"
  | "ops"
  | "hr"
  | "finance"
  | "exec"
  | "other";

type Detail = {
  user: {
    id: number;
    login: string;
    name: string | null;
    email: string | null;
    characterKey: string | null;
    hasGithub: boolean;
    lastSyncedAt: string | null;
    lastSyncError: string | null;
  };
  role: string;
  discipline: Discipline;
  jobTitle: string | null;
  workingDays: boolean[];
  birthdayMmDd: string | null;
  joinedOn: string | null;
  extraCaps: string[];
  narrative: {
    body: string;
    signal: "High" | "Steady" | "Low" | "Blocked";
    createdAt: string;
    provider: string;
    model: string;
  } | null;
  story: {
    narrative: string;
    scenes: Scene[];
    generatedAt: string;
  } | null;
  githubEvents: Array<{
    id: number;
    type: "commit" | "pr_opened" | "pr_reviewed" | "issue_closed";
    repo: string;
    title: string;
    url: string;
    occurredAt: string;
  }>;
  recentBreaks: Array<{
    id: number;
    category: string;
    reason: string;
    startedAt: string;
    endedAt: string | null;
    waitingOnExternal: string | null;
  }>;
  recentLeaves: Array<{
    id: number;
    startDate: string;
    endDate: string;
    leaveType: string;
    reason: string;
    status: "pending" | "approved" | "denied" | "cancelled";
    decidedNote: string | null;
  }>;
  latestShift: {
    id: number;
    punchedInAt: string;
    punchedOutAt: string | null;
    workSummary: string | null;
    verificationStatus: string;
    verificationScore: number | null;
  } | null;
  appUsage: Array<{ app: string; seconds: number }>;
  screenMix: {
    total: number;
    counts: { work: number; non_work: number; ambiguous: number };
    topHints: Array<{ k: string; n: number }>;
    topCategories: Array<{ k: string; n: number }>;
  };
  attendance28d: Array<{
    date: string;
    kind: "present" | "absent" | "leave" | "weekend" | "today" | "future" | "pre_join";
    minutesWorked: number;
    leaveType?: string;
    leaveReason?: string;
  }>;
  shiftSegments: Array<{
    startAt: string;
    endAt: string;
    kind: "work" | "break" | "idle";
    label: string;
    app?: string | null;
    detail?: string;
  }>;
  shiftTotals: { workMin: number; breakMin: number; idleMin: number; lockedMin: number };
  breaks28d: Array<{
    id: number;
    category: string;
    reason: string;
    startedAt: string;
    endedAt: string | null;
    waitingOnExternal: string | null;
  }>;
  last7DaysOutput: Array<{
    date: string;
    commits: number;
    prs: number;
    reviews: number;
    issues: number;
    focusMin: number;
    onlineMin: number;
  }>;
  topRepos: Array<{ repo: string; events: number }>;
  work: {
    windowDays: number;
    hasGithub: boolean;
    prs: Array<{
      title: string;
      url: string;
      repo: string;
      number: number | null;
      status: "open" | "in_review" | "merged" | "closed" | "draft";
      occurredAt: string;
    }>;
    prCounts: {
      open: number;
      in_review: number;
      merged: number;
      closed: number;
      draft: number;
    };
    reviewsGiven: Array<{
      title: string;
      url: string;
      repo: string;
      prAuthor: string | null;
      verdict: string | null;
      occurredAt: string;
    }>;
    reviewsReceived: Array<{
      title: string;
      url: string;
      repo: string;
      reviewer: string;
      verdict: string | null;
      occurredAt: string;
    }>;
    commitCount: number;
    commitRepos: Array<{ repo: string; count: number }>;
    recentCommitTitles: string[];
    blocked: {
      kind: "pr_waiting" | "break";
      title: string;
      detail: string;
      ageDays?: number;
    } | null;
    meetings: { count: number; minutes: number };
  };
  last7Shifts: Array<{
    id: number;
    punchedInAt: string;
    punchedOutAt: string | null;
    totalMin: number;
  }>;
  todayMeetings: Array<{
    id: number;
    title: string;
    startAt: string;
    endAt: string;
    conferenceUrl: string | null;
    rsvpStatus: string | null;
    attendeeCount: number;
  }>;
  risks: Array<{
    kind: "shift" | "output" | "block" | "github" | "idle";
    severity: "low" | "medium" | "high";
    label: string;
  }>;
  weekMeetingsCount: number;
  weekMeetingsMin: number;
  recentDeliverables: Array<{
    id: number;
    title: string;
    detail: string | null;
    url: string | null;
    kind: string | null;
    completedAt: string;
    verificationStatus: "unverified" | "verified" | "mismatch";
  }>;
  devices: Array<{
    id: number;
    label: string;
    platform: string | null;
    agentVersion: string | null;
    pairedAt: string;
    lastSeenAt: string | null;
    revokedAt: string | null;
  }>;
};

const DISCIPLINE_DELIVERABLE_LABEL: Record<Discipline, string> = {
  engineering: "PRs & commits",
  design: "designs & reviews",
  product: "docs & specs",
  sales: "deals & calls",
  support: "tickets resolved",
  marketing: "campaigns shipped",
  ops: "tasks completed",
  hr: "cases handled",
  finance: "reports filed",
  exec: "decisions logged",
  other: "deliverables",
};

/** Capabilities the owner can grant to specific managers via the Profile tab. */
const CAPABILITY_CHOICES: Array<{ key: string; label: string; hint: string }> =
  [
    {
      key: "manage_billing",
      label: "Manage billing",
      hint: "Plan, payment method, invoices.",
    },
    {
      key: "manage_integrations",
      label: "Configure integrations",
      hint: "GitHub allowlist, Slack webhook, calendar.",
    },
    {
      key: "manage_workspace",
      label: "Edit workspace settings",
      hint: "Org name, holidays, workday hours, avatars.",
    },
    {
      key: "view_all_data",
      label: "See everyone's data",
      hint: 'Bypasses the "your reports only" filter.',
    },
    {
      key: "manage_celebrations",
      label: "Edit birthdays & joining dates",
      hint: "Required for HR / People managers.",
    },
    {
      key: "export_data",
      label: "Export reports",
      hint: "CSV / PDF exports of attendance & shifts.",
    },
  ];

const DISCIPLINE_BADGE_LABEL: Record<Discipline, string> = {
  engineering: "Engineering",
  design: "Design",
  product: "Product",
  sales: "Sales",
  support: "Support",
  marketing: "Marketing",
  ops: "Ops",
  hr: "People",
  finance: "Finance",
  exec: "Leadership",
  other: "Team",
};

// Brand-aligned timeline colours. We keep the palette inside the sage / clay
// / gold / olive family so the scene timeline reads as part of MARINA, not
// a Tailwind preset dump.
const SCENE_COLOR: Record<StorySceneKind, string> = {
  shift_start: "#cbd5e1",
  shift_end: "#cbd5e1",
  meeting: "#3f6b54", // sage
  coding: "#10b981",
  design: "#c47b56", // clay
  comms: "#0ea5e9",
  reading: "#c19a4d", // gold
  browsing: "#94a3b8",
  media: "#f97316",
  break: "#f59e0b",
  leave: "#fbbf24",
  idle: "#cbd5e1",
  mixed: "#84cc16",
  unknown: "#cbd5e1",
};

const TYPE_LABEL: Record<string, string> = {
  commit: "commit",
  pr_opened: "PR opened",
  pr_reviewed: "review",
  issue_closed: "issue closed",
};

type OneOnOneBrief = {
  user: { id: number; login: string; name: string | null };
  period: { start: string; end: string };
  wins: Array<{ title: string; detail: string; sourceUrl?: string }>;
  risks: Array<{
    title: string;
    detail: string;
    severity: "low" | "medium" | "high";
  }>;
  questions: string[];
  pastCommitments: string[];
  hasGithub: boolean;
};

export function MemberDetailModal({
  orgId,
  membershipId,
  initialName,
  open,
  onClose,
  isManager,
  isOwner = false,
  viewerUserId,
}: {
  orgId: number;
  membershipId: number | null;
  initialName: string;
  open: boolean;
  onClose: () => void;
  isManager: boolean;
  isOwner?: boolean;
  viewerUserId?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [oneOnOne, setOneOnOne] = useState<OneOnOneBrief | null>(null);
  const [oneOnOneLoading, setOneOnOneLoading] = useState(false);
  // Tabbed navigation — serves both manager + HR personas without forcing them
  // to scroll past sections that aren't relevant to them.
  // Restructured tabs (was Overview/Attendance/Shifts/Activity/Profile):
  //   - Today   : what's happening RIGHT NOW — story, scenes, latest shift, today's meetings.
  //   - Output  : what they're producing — deliverables, GitHub events, 7-day trend.
  //   - Time    : time tracking — attendance strip, shift list, breaks day picker.
  //   - About   : identity + admin — profile, discipline/title, capabilities, dates.
  const [tab, setTab] = useState<"today" | "output" | "time" | "about">(
    "today",
  );
  const [scheduleOpen, setScheduleOpen] = useState(false);

  useEffect(() => {
    if (!open || !membershipId) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setDetail(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/orgs/${orgId}/members/${membershipId}/detail`,
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        if (!cancelled) setDetail(data as Detail);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orgId, membershipId]);

  async function sync() {
    if (!membershipId || !detail) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/orgs/${orgId}/members/${membershipId}/sync`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(
          (data as { error?: string })?.error || `HTTP ${res.status}`,
        );
      toast.push({
        kind: "success",
        title: `Synced ${detail.user.name ?? `@${detail.user.login}`}`,
      });
      router.refresh();
    } catch (e) {
      toast.push({
        kind: "error",
        title: "Sync failed",
        body: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  async function loadOneOnOne() {
    if (!membershipId) return;
    setOneOnOneLoading(true);
    try {
      const res = await fetch(
        `/api/orgs/${orgId}/members/${membershipId}/oneonone`,
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          (data as { error?: string })?.error || `HTTP ${res.status}`,
        );
      setOneOnOne(data as OneOnOneBrief);
    } catch (e) {
      toast.push({
        kind: "error",
        title: "Could not load 1:1 brief",
        body: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setOneOnOneLoading(false);
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
            <CharacterAvatar
              characterKey={detail.user.characterKey}
              name={detail.user.name}
              login={detail.user.login}
              size={28}
            />
            <span>{detail.user.name ?? `@${detail.user.login}`}</span>
          </span>
        ) : (
          initialName
        )
      }
      subtitle={
        detail
          ? `${detail.jobTitle ?? DISCIPLINE_BADGE_LABEL[detail.discipline]} · ${detail.role} · @${detail.user.login}`
          : "Loading…"
      }
      footer={
        isManager && detail ? (
          <>
            {/* GitHub sync is only relevant for engineers with GitHub linked.
                Showing a perpetually-disabled button to a salesperson made the
                product feel like it was built for one role. */}
            {detail.discipline === "engineering" && detail.user.hasGithub && (
              <button
                type="button"
                onClick={sync}
                disabled={busy}
                className="px-3 py-1.5 rounded-md bg-white border border-[var(--m-border)] hover:bg-[var(--m-bg-soft)] text-[var(--m-ink-2)] text-[12.5px] font-medium disabled:opacity-50 transition"
              >
                {busy ? "…" : "Sync GitHub"}
              </button>
            )}
            {detail.user.id !== viewerUserId && (
              <button
                type="button"
                onClick={() => setScheduleOpen(true)}
                disabled={busy}
                className="px-3 py-1.5 rounded-md bg-white border border-[var(--m-border)] hover:bg-[var(--m-bg-soft)] text-[var(--m-ink-2)] text-[12.5px] font-medium disabled:opacity-50 transition"
              >
                Schedule meeting
              </button>
            )}
            {/* "Regenerate brief" removed — the 1:1 prep brief lives in the
                Today tab's own section; a second narrative button here just
                duplicated it and confused people. */}
          </>
        ) : null
      }
    >
      {loading && (
        <p className="text-[13px] text-[var(--m-ink-3)] py-4">Loading details…</p>
      )}
      {err && <p className="text-[13px] text-rose-600 py-4">{err}</p>}

      {detail && (
        <div>
          {/* Sticky tab strip. `-mt-5 pt-5` pulls the opaque white background up
              to cover the scroll container's top padding so nothing peeks out
              behind it when it sticks. z-20 keeps it above layered content.
              (The old always-on "QuickRead" banner was removed — the Today tab's
              TodaySnapshot already surfaces blocked/at-risk state, so a second
              copy up here just duplicated it.) */}
          <div className="sticky top-0 z-20 -mx-6 -mt-5 px-6 pt-5 pb-2 bg-white border-b border-[var(--m-border)] flex items-center mb-5">
            <TabBtn
              label="Today"
              active={tab === "today"}
              onClick={() => setTab("today")}
            />
            <TabBtn
              label="Output"
              active={tab === "output"}
              onClick={() => setTab("output")}
            />
            <TabBtn
              label="Time"
              active={tab === "time"}
              onClick={() => setTab("time")}
            />
            <TabBtn
              label="About"
              active={tab === "about"}
              onClick={() => setTab("about")}
            />
          </div>

          {/* ── TODAY tab ── what's happening RIGHT NOW + the 1:1 prep tool */}
          {tab === "today" && (
            <div className="space-y-5">
              {/* TodaySnapshot always renders — even for a brand-new member
                  with no GitHub, no story, no narrative. It mirrors the info
                  the outer card showed (status, focus, etc.) so the modal
                  never feels emptier than the card you clicked from. */}
              <TodaySnapshot detail={detail} />
              {detail.risks.length > 0 && <RisksStrip risks={detail.risks} />}
              <OneOnOneSection
                brief={oneOnOne}
                loading={oneOnOneLoading}
                onLoad={loadOneOnOne}
                work={detail.work}
              />

              {/* Today's AI story — the headline signal */}
              {detail.story && (
                <Section
                  title="Today's story"
                  hint={`Generated ${timeAgo(detail.story.generatedAt)}`}
                >
                  <p className="text-[13px] text-[var(--m-ink-2)] leading-relaxed whitespace-pre-line">
                    {detail.story.narrative}
                  </p>
                  {detail.story.scenes && detail.story.scenes.length > 0 && (
                    <div className="mt-3">
                      <InteractiveRibbon scenes={detail.story.scenes} />
                      <SceneList scenes={detail.story.scenes} />
                    </div>
                  )}
                </Section>
              )}

              {/* Today's calendar */}
              {detail.todayMeetings.length > 0 && (
                <Section
                  title="Today's meetings"
                  hint={`${detail.todayMeetings.length} on the calendar`}
                >
                  <TodayMeetings meetings={detail.todayMeetings} />
                </Section>
              )}

              {/* Latest narrative — manager brief */}
              {detail.narrative && (
                <Section
                  title="Latest brief"
                  hint={timeAgo(detail.narrative.createdAt)}
                  chip={<SignalPill signal={detail.narrative.signal} />}
                >
                  <NarrativeBullets text={detail.narrative.body} />
                </Section>
              )}
            </div>
          )}

          {/* ── OUTPUT tab ── what they're producing */}
          {tab === "output" && (
            <div className="space-y-5">
              <UniversalSignal detail={detail} />
              {detail.last7DaysOutput.length > 0 && (
                <Section title="7-day trend" hint="output + focus time">
                  <SevenDayTrendStrip
                    days={detail.last7DaysOutput}
                    discipline={detail.discipline}
                    hasGithub={detail.user.hasGithub}
                  />
                </Section>
              )}

              {/* Universal: self-reported deliverables */}
              <Section
                title="Self-reported work"
                hint={
                  detail.recentDeliverables.length > 0
                    ? `${detail.recentDeliverables.length} this fortnight`
                    : "last 14 days"
                }
              >
                {detail.recentDeliverables.length > 0 ? (
                  <DeliverableList items={detail.recentDeliverables} />
                ) : (
                  <p className="text-[12px] text-[var(--m-ink-3)] italic">
                    {detail.user.name ?? `@${detail.user.login}`} hasn't logged
                    any deliverables yet.
                  </p>
                )}
              </Section>

              {/* Screen content mix */}
              {detail.screenMix.total > 0 && (
                <Section
                  title="What the screen showed today"
                  hint={`${detail.screenMix.total} samples`}
                >
                  <ScreenMix mix={detail.screenMix} />
                </Section>
              )}

              {/* App usage */}
              {detail.appUsage.length > 0 && (
                <Section
                  title="Where time went today"
                  hint={`top ${detail.appUsage.length}`}
                >
                  <AppUsageBars usage={detail.appUsage} />
                </Section>
              )}

              {/* The deep GitHub work read — PRs by status, reviews given /
                  received, commit themes, blocked signal, AI summary. */}
              {detail.user.hasGithub ? (
                <WorkView
                  detail={detail}
                  orgId={orgId}
                  membershipId={membershipId!}
                />
              ) : detail.discipline === "engineering" ? (
                <IntegrationTeaser discipline={detail.discipline} />
              ) : null}
            </div>
          )}

          {/* ── TIME tab ── attendance, shifts, breaks */}
          {tab === "time" && (
            <div className="space-y-5">
              <AttendanceTab
                orgId={orgId}
                userId={detail.user.id}
                recentLeaves={detail.recentLeaves}
                attendance28d={detail.attendance28d}
              />
              <ShiftsTab
                orgId={orgId}
                userId={detail.user.id}
                latestShift={detail.latestShift}
                segments={detail.shiftSegments}
                totals={detail.shiftTotals}
                recentShifts={detail.last7Shifts}
              />
              <BreaksDayPicker breaks28d={detail.breaks28d} />
            </div>
          )}

          {/* ── ABOUT tab ── identity + admin */}
          {tab === "about" && (
            <div className="space-y-4">
              <ProfileTab
                detail={detail}
                orgId={orgId}
                membershipId={membershipId!}
                isManager={isManager}
                isOwner={isOwner}
                onSaved={async () => {
                  const fresh = await fetch(
                    `/api/orgs/${orgId}/members/${membershipId}/detail`,
                  );
                  if (fresh.ok) setDetail(await fresh.json());
                }}
              />
              <DevicesPanel
                devices={detail.devices ?? []}
                orgId={orgId}
                membershipId={membershipId!}
                isOwner={isOwner}
                onChanged={async () => {
                  const fresh = await fetch(
                    `/api/orgs/${orgId}/members/${membershipId}/detail`,
                  );
                  if (fresh.ok) setDetail(await fresh.json());
                }}
              />
            </div>
          )}
        </div>
      )}
      {detail && (
        <ScheduleMeetingDialog
          open={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
          orgId={orgId}
          membershipId={membershipId!}
          attendeeName={detail.user.name ?? `@${detail.user.login}`}
        />
      )}
    </Modal>
  );
}

// Local wrapper kept as a thin alias of the shared dialog so the modal's
// existing call-site stays unchanged. The shared component lives in
// components/schedule-meeting-dialog.tsx so the team-card quick-action
// can reuse it without round-tripping through this modal.
function ScheduleMeetingDialog(props: {
  open: boolean;
  onClose: () => void;
  orgId: number;
  membershipId: number;
  attendeeName: string;
}) {
  return <SharedScheduleMeetingDialog {...props} />;
}

// Old in-file implementation, kept for reference. Bypassed by the wrapper
// above — Dead Code Sweep can remove this block when we hit the next pass.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _LegacyScheduleMeetingDialog({
  open,
  onClose,
  orgId,
  membershipId,
  attendeeName,
}: {
  open: boolean;
  onClose: () => void;
  orgId: number;
  membershipId: number;
  attendeeName: string;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(`1:1 with ${attendeeName}`);
  const [agenda, setAgenda] = useState("");
  const [startAt, setStartAt] = useState(() => defaultStart());
  const [durationMin, setDurationMin] = useState(30);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/orgs/${orgId}/members/${membershipId}/schedule-meeting`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            agenda: agenda || null,
            startAt: new Date(startAt).toISOString(),
            durationMin,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      toast.push({
        kind: "success",
        title: "Meeting scheduled",
        body: data.googleError
          ? "In-app only — Google Calendar push failed."
          : data.meeting?.conferenceUrl
            ? "Calendar invite sent with a Meet link."
            : "Calendar invite sent.",
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-4 bg-[var(--m-ink)]/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] font-semibold text-[var(--m-ink)]">
            Schedule a meeting
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--m-ink-4)] hover:text-[var(--m-ink-2)]"
          >
            ✕
          </button>
        </div>
        <p className="text-[12px] text-[var(--m-ink-3)] mb-3">
          We'll send {attendeeName} an in-app notification and an email. If you
          have Google Calendar connected, the event is also added to both
          calendars with a Meet link.
        </p>

        <label className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-3)] block mb-1">
          Title
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          disabled={busy}
          className="input w-full mb-3"
        />

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-3)] block mb-1">
              When
            </label>
            <input
              type="datetime-local"
              value={startAt}
              min={defaultStart()}
              onChange={(e) => setStartAt(e.target.value)}
              disabled={busy}
              className="input w-full"
            />
          </div>
          <div>
            <label className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-3)] block mb-1">
              Length
            </label>
            <select
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              disabled={busy}
              className="select w-full"
            >
              <option value={15}>15 min</option>
              <option value={25}>25 min</option>
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>1 hour</option>
            </select>
          </div>
        </div>

        <label className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-3)] block mb-1">
          Agenda (optional)
        </label>
        <textarea
          value={agenda}
          onChange={(e) => setAgenda(e.target.value)}
          maxLength={2000}
          disabled={busy}
          rows={3}
          placeholder="What do you want to cover?"
          className="textarea w-full mb-3"
        />

        {err && <p className="text-[12px] text-rose-600 mb-2">{err}</p>}

        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !title.trim() || !startAt}
            className="btn-primary"
          >
            {busy ? "Scheduling…" : "Schedule meeting"}
          </button>
        </div>
      </div>
    </div>
  );
}

function defaultStart(): string {
  // 1 hour from now, rounded up to the next 15 min, formatted for datetime-local
  const d = new Date(Date.now() + 60 * 60_000);
  const m = d.getMinutes();
  d.setMinutes(m + ((15 - (m % 15)) % 15));
  d.setSeconds(0);
  d.setMilliseconds(0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function TabBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-3 pb-2 pt-1 text-[13px] font-medium transition border-b-2 ${
        active
          ? "text-[var(--m-ink)] border-[var(--m-ink)]"
          : "text-[var(--m-ink-3)] border-transparent hover:text-[var(--m-ink)] hover:border-[var(--m-ink-5)]"
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Attendance tab — real per-day presence for the last 28 days. Derived
 * server-side from actual shifts + approved leaves. HR's primary view:
 * "Did Ramesh come to work this month, and for how long?"
 */
function AttendanceTab({
  orgId,
  userId,
  recentLeaves,
  attendance28d,
}: {
  orgId: number;
  userId: number;
  recentLeaves: Detail["recentLeaves"];
  attendance28d: Detail["attendance28d"];
}) {
  const STYLE = {
    present: {
      bg: "bg-[var(--m-good-soft)]",
      fg: "text-[var(--m-good)]",
      label: "P",
    },
    absent: {
      bg: "bg-[var(--m-bad-soft)]",
      fg: "text-[var(--m-bad)]",
      label: "A",
    },
    leave: {
      bg: "bg-[var(--m-warn-soft)]",
      fg: "text-[var(--m-warn)]",
      label: "L",
    },
    weekend: {
      bg: "bg-[var(--m-bg-soft)]",
      fg: "text-[var(--m-ink-4)]",
      label: "·",
    },
    today: {
      bg: "bg-[var(--m-accent-soft)]",
      fg: "text-[var(--m-accent)]",
      label: "·",
    },
    future: { bg: "bg-transparent", fg: "text-[var(--m-ink-5)]", label: "" },
    // Days before the member joined the org — show as empty, never crash.
    pre_join: { bg: "bg-transparent", fg: "text-[var(--m-ink-5)]", label: "" },
  };

  const summary = attendance28d.reduce(
    (acc, c) => {
      if (c.kind === "present" || c.kind === "today") {
        if (c.minutesWorked > 0) acc.present++;
        else if (c.kind === "today") {
        } // don't count today as absent
        else acc.absent++;
        if (c.minutesWorked > 0) acc.totalMin += c.minutesWorked;
      } else if (c.kind === "absent") {
        acc.absent++;
      } else if (c.kind === "leave") {
        acc.leave++;
      }
      return acc;
    },
    { present: 0, absent: 0, leave: 0, totalMin: 0 },
  );

  const avgPerPresentDay =
    summary.present > 0 ? Math.round(summary.totalMin / summary.present) : 0;

  return (
    <div className="space-y-5">
      <Section
        title="Last 28 days"
        hint={`${summary.present} present · ${summary.leave} on leave · ${summary.absent} absent`}
      >
        <div className="grid grid-cols-7 gap-1.5">
          {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
            <div
              key={d}
              className="text-[10px] uppercase tracking-wider text-[var(--m-ink-4)] font-semibold text-center pb-1"
            >
              {d}
            </div>
          ))}
          {attendance28d.map((c) => {
            const s = STYLE[c.kind] ?? STYLE.future;
            const day = Number(c.date.slice(-2));
            const tipBits: string[] = [fmtDate(c.date + "T00:00:00")];
            if (c.minutesWorked > 0)
              tipBits.push(humanDuration(c.minutesWorked));
            if (c.kind === "leave")
              tipBits.push(`${c.leaveType} · ${c.leaveReason ?? ""}`);
            else tipBits.push(c.kind);
            return (
              <div
                key={c.date}
                title={tipBits.join(" · ")}
                className={`relative h-12 rounded-md border border-[var(--m-border-soft)] ${s.bg} flex flex-col items-center justify-center`}
              >
                <span
                  className={`text-[11px] font-medium tabular-nums ${s.fg}`}
                >
                  {day}
                </span>
                {(c.kind === "present" || c.kind === "today") &&
                c.minutesWorked > 0 ? (
                  <span
                    className={`text-[9px] font-medium tabular-nums ${s.fg}`}
                  >
                    {Math.round(c.minutesWorked / 60)}h
                  </span>
                ) : c.kind !== "present" && c.kind !== "weekend" && s.label ? (
                  <span
                    className={`text-[9px] font-semibold uppercase tracking-wider ${s.fg}`}
                  >
                    {s.label}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
        {summary.present > 0 && (
          <p className="mt-3 text-[11.5px] text-[var(--m-ink-3)]">
            Total{" "}
            <span className="font-semibold text-[var(--m-ink)] tabular-nums">
              {humanDuration(summary.totalMin)}
            </span>{" "}
            across {summary.present} day{summary.present === 1 ? "" : "s"}
            {" · "}avg{" "}
            <span className="font-semibold text-[var(--m-ink)] tabular-nums">
              {humanDuration(avgPerPresentDay)}
            </span>
            /day
          </p>
        )}
        <Link
          href={`/org/${orgId}/attendance?member=${userId}`}
          className="mt-4 inline-flex text-[12.5px] text-[var(--m-accent)] hover:text-[var(--m-accent-2)] font-medium"
        >
          See full monthly attendance →
        </Link>
      </Section>

      {recentLeaves.length > 0 && (
        <Section title="Recent leaves">
          <ul className="space-y-2">
            {recentLeaves.slice(0, 6).map((l) => (
              <li key={l.id} className="flex items-center gap-3 text-[12.5px]">
                <LeaveTypeChip type={l.leaveType} />
                <span className="text-[var(--m-ink)] font-medium">
                  {fmtRange(l.startDate, l.endDate)}
                </span>
                <span className={`ml-auto shrink-0 pill ${pillFor(l.status)}`}>
                  {l.status}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

/**
 * Shifts tab — latest shift rendered as a segmented timeline with hover
 * labels showing what app the employee was in (or break category) during
 * each window. Above the bar, the segments' labels are shown so the manager
 * can scan productive time at a glance. Minimal palette: sage = working,
 * clay = not working (break/idle).
 */
function ShiftsTab({
  orgId,
  latestShift,
  segments,
  totals,
  recentShifts,
}: {
  orgId: number;
  userId: number;
  latestShift: Detail["latestShift"];
  segments: Detail["shiftSegments"];
  totals: Detail["shiftTotals"];
  recentShifts: Detail["last7Shifts"];
}) {
  return (
    <div className="space-y-5">
      {latestShift && (
        <Section title="Latest shift" hint={fmtDate(latestShift.punchedInAt)}>
          <ShiftSummaryBar shift={latestShift} totals={totals} />
          {segments.length > 0 ? (
            <div className="mt-4">
              <ShiftActivityList segments={segments} />
            </div>
          ) : (
            <p className="mt-4 text-[12px] text-[var(--m-ink-3)] italic">
              No activity windows recorded for this shift yet — the agent may
              not be paired.
            </p>
          )}
          {latestShift.workSummary && (
            <p className="mt-4 text-[12.5px] text-[var(--m-ink-2)] leading-snug whitespace-pre-line bg-[var(--m-bg-soft)] border border-[var(--m-border-soft)] rounded-lg px-3 py-2">
              {latestShift.workSummary}
            </p>
          )}
        </Section>
      )}

      {recentShifts.length > 1 && (
        <Section
          title="This week's shifts"
          hint={`${recentShifts.length} sessions`}
        >
          <RecentShiftsList shifts={recentShifts} />
        </Section>
      )}

      <Section title="See full punch-in / punch-out history">
        <p className="text-[12.5px] text-[var(--m-ink-2)] leading-relaxed">
          Daily punch records and work summaries are kept under the org-wide
          Shifts page.
        </p>
        <Link
          href={`/org/${orgId}/shifts`}
          className="mt-3 inline-flex text-[12.5px] text-[var(--m-accent)] hover:text-[var(--m-accent-2)] font-medium"
        >
          Open Shifts →
        </Link>
      </Section>
    </div>
  );
}

/**
 * Top-of-shift summary: punch-in clock, duration, productive time, breaks.
 * One glance tells the manager whether the day was healthy.
 */
function ShiftSummaryBar({
  shift,
  totals,
}: {
  shift: NonNullable<Detail["latestShift"]>;
  totals: Detail["shiftTotals"];
}) {
  const start = new Date(shift.punchedInAt);
  const end = shift.punchedOutAt ? new Date(shift.punchedOutAt) : null;
  const totalMin = end
    ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
    : null;
  const dur = totalMin != null ? humanDuration(totalMin) : "ongoing";
  const productive = humanDuration(totals.workMin);
  const breakDur = humanDuration(totals.breakMin);
  const idleDur = humanDuration(totals.idleMin);
  const lockedDur = humanDuration(totals.lockedMin);
  const productiveRatio =
    totalMin && totalMin > 0
      ? Math.round((totals.workMin / totalMin) * 100)
      : null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <SummaryTile
        label="In"
        value={fmtClock(shift.punchedInAt)}
        sub={end ? `out ${fmtClock(end.toISOString())}` : "ongoing"}
      />
      <SummaryTile label="On the clock" value={dur} sub={null} />
      <SummaryTile
        label="Working"
        value={productive}
        sub={productiveRatio != null ? `${productiveRatio}% of shift` : null}
        tone="good"
      />
      <SummaryTile label="Idle" value={idleDur} sub="on, no input" />
      <SummaryTile label="Locked / away" value={lockedDur} sub="screen locked" />
      <SummaryTile label="On break" value={breakDur} sub={null} tone="warn" />
    </div>
  );
}

function SummaryTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string | null;
  tone?: "good" | "warn";
}) {
  const accent =
    tone === "good"
      ? "text-[var(--m-good)]"
      : tone === "warn"
        ? "text-[var(--m-warn)]"
        : "text-[var(--m-ink)]";
  return (
    <div className="rounded-lg border border-[var(--m-border-soft)] bg-white px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)]">
        {label}
      </p>
      <p className={`mt-0.5 text-[15px] font-semibold tabular-nums ${accent}`}>
        {value}
      </p>
      {sub && (
        <p className="text-[10.5px] text-[var(--m-ink-4)] mt-0.5">{sub}</p>
      )}
    </div>
  );
}

/**
 * Simple chronological list of "what they were doing" during the shift.
 * Replaces the segmented progress bar — every row owns its own hover area,
 * so no edge cases, no popover positioning, no cursor mismatch. Adjacent
 * rows with the same app/break get coalesced visually.
 */
function ShiftActivityList({
  segments,
}: {
  segments: Detail["shiftSegments"];
}) {
  // For each segment, decide on visual density: short rows are compact lines;
  // long stretches (≥45 min of work) get an emphasised card so the eye lands
  // on the meaningful blocks of the day, not the noise.
  const LONG_BLOCK_MIN = 45;
  return (
    <ul className="space-y-1.5">
      {segments.map((s, i) => {
        const startMs = new Date(s.startAt).getTime();
        const endMs = new Date(s.endAt).getTime();
        const mins = Math.max(1, Math.round((endMs - startMs) / 60_000));
        const isLongBlock = s.kind === "work" && mins >= LONG_BLOCK_MIN;

        const tone =
          s.kind === "work"
            ? {
                dot: "var(--m-good)",
                ring: "border-[var(--m-good)]/20",
                bg: "bg-[var(--m-good-soft)]/40",
              }
            : s.kind === "break"
              ? {
                  dot: "var(--m-warn)",
                  ring: "border-[var(--m-warn)]/25",
                  bg: "bg-[var(--m-warn-soft)]/40",
                }
              : {
                  dot: "var(--m-ink-5)",
                  ring: "border-[var(--m-border-soft)]",
                  bg: "bg-[var(--m-bg-soft)]/40",
                };

        const primary = s.label;
        const sub =
          s.detail && s.detail !== primary
            ? s.detail
            : s.kind === "idle"
              ? "Screen unlocked but no input detected — likely away from desk"
              : null;

        if (isLongBlock) {
          // Summary card for long productive stretches — what they did,
          // for how long, with the dominant app pinned for context.
          return (
            <li key={i}>
              <article
                className={`rounded-lg border ${tone.ring} ${tone.bg} px-3.5 py-2.5`}
              >
                <div className="flex items-baseline gap-3">
                  <span
                    className="shrink-0 inline-block w-1.5 h-1.5 rounded-full"
                    style={{ background: tone.dot }}
                    aria-hidden
                  />
                  <p className="text-[13px] font-semibold text-[var(--m-ink)] truncate">
                    {primary}
                  </p>
                  <span className="ml-auto shrink-0 text-[11.5px] font-semibold text-[var(--m-ink)] tabular-nums">
                    {humanDuration(mins)}
                  </span>
                </div>
                <p className="mt-0.5 text-[11.5px] text-[var(--m-ink-3)] tabular-nums">
                  {fmtClock(s.startAt)} – {fmtClock(s.endAt)}
                  {s.app && (
                    <span className="text-[var(--m-ink-4)]">
                      {" "}
                      · mostly {s.app}
                    </span>
                  )}
                </p>
                {sub && (
                  <p className="mt-1 text-[12px] text-[var(--m-ink-2)] leading-snug">
                    {sub}
                  </p>
                )}
              </article>
            </li>
          );
        }

        // Compact row for short segments
        return (
          <li key={i}>
            <div className="flex items-center gap-3 text-[12.5px] px-3 py-1.5 rounded-md border border-[var(--m-border-soft)] bg-white">
              <span
                className="shrink-0 w-1.5 h-1.5 rounded-full"
                style={{ background: tone.dot }}
                aria-hidden
              />
              <span className="shrink-0 w-28 text-[var(--m-ink-3)] tabular-nums text-[11.5px]">
                {fmtClock(s.startAt)} – {fmtClock(s.endAt)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[var(--m-ink)] truncate">{primary}</p>
                {sub && (
                  <p className="text-[11px] text-[var(--m-ink-3)] truncate leading-snug">
                    {sub}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-[11px] text-[var(--m-ink-3)] tabular-nums">
                {humanDuration(mins)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Breaks panel for the Activity tab. Defaults to today; the manager can
 * pick any of the last 28 days via the date input. Only days where breaks
 * were actually logged are clickable in the quick-jump strip.
 */
function BreaksDayPicker({ breaks28d }: { breaks28d: Detail["breaks28d"] }) {
  const todayIso = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const [day, setDay] = useState<string>(todayIso);

  const byDay = useMemo(() => {
    const m = new Map<string, Detail["breaks28d"]>();
    for (const b of breaks28d) {
      const d = new Date(b.startedAt);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const arr = m.get(iso) ?? [];
      arr.push(b);
      m.set(iso, arr);
    }
    return m;
  }, [breaks28d]);

  const dayBreaks = byDay.get(day) ?? [];
  // Days that have breaks, newest first — quick chips so the manager can
  // jump straight to "yesterday had 4 breaks"
  const daysWithBreaks = useMemo(
    () =>
      Array.from(byDay.keys())
        .sort((a, b) => (a < b ? 1 : -1))
        .slice(0, 7),
    [byDay],
  );

  return (
    <Section
      title="Breaks"
      hint={day === todayIso ? "Today" : fmtDate(day + "T00:00:00")}
    >
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <input
          type="date"
          value={day}
          max={todayIso}
          min={(() => {
            const d = new Date();
            d.setDate(d.getDate() - 27);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          })()}
          onChange={(e) => setDay(e.target.value)}
          className="text-[12px] border border-[var(--m-border)] rounded-md px-2 py-1 bg-white text-[var(--m-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--m-accent)]/20"
        />
        <button
          type="button"
          onClick={() => setDay(todayIso)}
          className={`text-[11.5px] font-medium px-2 py-1 rounded-md border transition ${
            day === todayIso
              ? "bg-[var(--m-accent-soft)] border-[var(--m-accent)]/30 text-[var(--m-accent-2)]"
              : "bg-white border-[var(--m-border)] text-[var(--m-ink-2)] hover:bg-[var(--m-bg-soft)]"
          }`}
        >
          Today
        </button>
        {daysWithBreaks
          .filter((d) => d !== todayIso)
          .slice(0, 4)
          .map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              className={`text-[11.5px] font-medium px-2 py-1 rounded-md border transition ${
                day === d
                  ? "bg-[var(--m-accent-soft)] border-[var(--m-accent)]/30 text-[var(--m-accent-2)]"
                  : "bg-white border-[var(--m-border)] text-[var(--m-ink-2)] hover:bg-[var(--m-bg-soft)]"
              }`}
              title={`${byDay.get(d)?.length ?? 0} breaks`}
            >
              {fmtDate(d + "T00:00:00")}
            </button>
          ))}
      </div>

      {dayBreaks.length === 0 ? (
        <p className="text-[12px] text-[var(--m-ink-3)] italic">
          {day === todayIso
            ? "No breaks logged today."
            : "No breaks logged on this day."}
        </p>
      ) : (
        <ul className="space-y-2">
          {dayBreaks.map((b) => (
            <BreakRow key={b.id} brk={b as Detail["recentBreaks"][number]} />
          ))}
        </ul>
      )}
    </Section>
  );
}

/**
 * Profile tab — identity card + discipline / job-title editor (manager-only).
 * The discipline drives the role-aware UI, so the editor lives prominently
 * at the top of this tab.
 */
function ProfileTab({
  detail,
  orgId,
  membershipId,
  isManager,
  isOwner,
  onSaved,
}: {
  detail: Detail;
  orgId: number;
  membershipId: number;
  isManager: boolean;
  isOwner: boolean;
  onSaved: () => void | Promise<void>;
}) {
  const [discipline, setDiscipline] = useState<Discipline>(detail.discipline);
  const [jobTitle, setJobTitle] = useState(detail.jobTitle ?? "");
  const [workingDays, setWorkingDays] = useState<boolean[]>(detail.workingDays);
  const [birthdayMmDd, setBirthdayMmDd] = useState(detail.birthdayMmDd ?? "");
  const [joinedOn, setJoinedOn] = useState(detail.joinedOn ?? "");
  const [extraCaps, setExtraCaps] = useState<string[]>(detail.extraCaps);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();

  const dirty =
    discipline !== detail.discipline ||
    jobTitle.trim() !== (detail.jobTitle ?? "") ||
    workingDays.some((v, i) => v !== detail.workingDays[i]) ||
    birthdayMmDd !== (detail.birthdayMmDd ?? "") ||
    joinedOn !== (detail.joinedOn ?? "") ||
    extraCaps.length !== detail.extraCaps.length ||
    extraCaps.some((c) => !detail.extraCaps.includes(c));

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/orgs/${orgId}/members/${membershipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discipline,
          jobTitle: jobTitle.trim() || null,
          workingDays,
          birthdayMmDd: birthdayMmDd || null,
          joinedOn: joinedOn || null,
          // Only the OWNER is allowed to mint extra capabilities. The API
          // re-checks this server-side; the UI also hides the editor for
          // non-owners.
          ...(isOwner ? { extraCaps } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(
          (data as { error?: string })?.error || `HTTP ${res.status}`,
        );
      toast.push({ kind: "success", title: "Profile updated" });
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function toggleDay(i: number) {
    setWorkingDays((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }
  const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <div className="space-y-5">
      {isManager && (
        <Section title="Role & discipline" hint="drives the per-role tiles">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] block mb-1">
                Discipline
              </label>
              <select
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value as Discipline)}
                disabled={saving}
                className="w-full text-[13px] border border-[var(--m-border)] rounded-lg bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--m-accent)]/20"
              >
                {(
                  [
                    "engineering",
                    "design",
                    "product",
                    "sales",
                    "support",
                    "marketing",
                    "ops",
                    "hr",
                    "finance",
                    "exec",
                    "other",
                  ] as Discipline[]
                ).map((d) => (
                  <option key={d} value={d}>
                    {DISCIPLINE_BADGE_LABEL[d]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] block mb-1">
                Job title (optional)
              </label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                disabled={saving}
                placeholder="e.g. Senior PM, Account Executive…"
                maxLength={80}
                className="w-full text-[13px] border border-[var(--m-border)] rounded-lg bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--m-accent)]/20 placeholder:text-[var(--m-ink-4)]"
              />
            </div>
          </div>
          {err && <p className="mt-2 text-[12px] text-[var(--m-bad)]">{err}</p>}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className="px-3 py-1.5 rounded-md bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white text-[12.5px] font-medium disabled:opacity-50 transition"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            {dirty && !saving && (
              <button
                type="button"
                onClick={() => {
                  setDiscipline(detail.discipline);
                  setJobTitle(detail.jobTitle ?? "");
                  setWorkingDays(detail.workingDays);
                  setBirthdayMmDd(detail.birthdayMmDd ?? "");
                  setJoinedOn(detail.joinedOn ?? "");
                }}
                className="text-[11.5px] text-[var(--m-ink-3)] hover:text-[var(--m-ink)]"
              >
                Reset
              </button>
            )}
          </div>
        </Section>
      )}

      {isManager && (
        <Section title="Working days" hint="drives weekend vs absent">
          <div className="flex items-center gap-1.5">
            {DAY_LABELS.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleDay(i)}
                disabled={saving}
                className={`w-9 h-9 rounded-md text-[12px] font-semibold transition border ${
                  workingDays[i]
                    ? "bg-[var(--m-accent-soft)] border-[var(--m-accent)]/30 text-[var(--m-accent-2)]"
                    : "bg-white border-[var(--m-border)] text-[var(--m-ink-4)] hover:bg-[var(--m-bg-soft)]"
                }`}
                aria-pressed={workingDays[i]}
                aria-label={
                  [
                    "Sunday",
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                  ][i]
                }
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] text-[var(--m-ink-3)]">
            Days when this person is expected to be working. Non-working days
            appear as "weekend" on the attendance strip, not "absent".
          </p>
        </Section>
      )}

      {isManager && (
        <Section
          title="People-care dates"
          hint="powers birthdays & anniversaries"
        >
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] block mb-1">
                Birthday
              </label>
              <input
                type="date"
                // Use today's year just to make the date picker happy — we
                // strip the year before sending to the server. Year is never
                // persisted (privacy + no age signal in the UI).
                value={birthdayMmDd ? `2000-${birthdayMmDd}` : ""}
                onChange={(e) => {
                  const v = e.target.value; // "YYYY-MM-DD"
                  setBirthdayMmDd(v ? v.slice(5) : "");
                }}
                disabled={saving}
                className="w-full text-[13px] border border-[var(--m-border)] rounded-lg bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--m-accent)]/20"
              />
              <p className="mt-1 text-[10.5px] text-[var(--m-ink-4)]">
                Year is ignored — only day + month are saved.
              </p>
            </div>
            <div>
              <label className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] block mb-1">
                Joined on
              </label>
              <input
                type="date"
                value={joinedOn}
                onChange={(e) => setJoinedOn(e.target.value)}
                disabled={saving}
                max={(() => {
                  const d = new Date();
                  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                })()}
                className="w-full text-[13px] border border-[var(--m-border)] rounded-lg bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--m-accent)]/20"
              />
            </div>
          </div>
          <p className="mt-2 text-[11.5px] text-[var(--m-ink-3)]">
            Birthday year is intentionally not stored. Joining date powers
            work-anniversary reminders on the org dashboard.
          </p>
        </Section>
      )}

      {isOwner && detail.role !== "admin" && (
        <Section
          title="Extra capabilities"
          hint="owner-only — grant manager rights to specific people"
        >
          <div className="mb-3">
            <TutorialHint
              id="extra-caps-explainer"
              tone="gold"
              title="When to grant extras"
            >
              Roles set the default; capabilities are the per-person exceptions.
              Grant <b>Manage billing</b> to your finance lead,{" "}
              <b>Edit birthdays</b> to whoever runs People, and{" "}
              <b>View all data</b> only to people you trust with everything. The
              member needs to be at least a <i>manager</i> for these to take
              effect.
            </TutorialHint>
          </div>
          <p className="text-[12px] text-[var(--m-ink-3)] mb-2.5 leading-snug">
            By default, managers can manage members, decide leaves, schedule
            meetings and export reports. Tick anything below to grant extra
            owner-shaped powers to this person — useful when you want a People
            manager to edit celebrations, or a Finance manager to view
            everyone's data.
          </p>
          <ul className="grid sm:grid-cols-2 gap-1.5">
            {CAPABILITY_CHOICES.map(({ key, label, hint }) => {
              const checked = extraCaps.includes(key);
              return (
                <li key={key}>
                  <label
                    className={`flex items-start gap-2 px-2.5 py-2 rounded-md border cursor-pointer transition ${
                      checked
                        ? "bg-[var(--m-accent-soft)] border-[var(--m-accent)]/30"
                        : "bg-white border-[var(--m-border)] hover:bg-[var(--m-bg-soft)]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...extraCaps, key]
                          : extraCaps.filter((c) => c !== key);
                        setExtraCaps(next);
                      }}
                      disabled={saving}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-medium text-[var(--m-ink)]">
                        {label}
                      </span>
                      <span className="block text-[11px] text-[var(--m-ink-3)] leading-snug">
                        {hint}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section title="Profile">
        <div className="grid sm:grid-cols-2 gap-3 text-[12.5px]">
          <ProfileField label="Display name" value={detail.user.name ?? "—"} />
          <ProfileField label="Login" value={`@${detail.user.login}`} />
          <ProfileField label="Email" value={detail.user.email ?? "—"} />
          <ProfileField label="Org role" value={detail.role} capitalize />
          <ProfileField
            label="Discipline"
            value={DISCIPLINE_BADGE_LABEL[detail.discipline]}
          />
          <ProfileField label="Job title" value={detail.jobTitle ?? "—"} />
          <ProfileField
            label="GitHub"
            value={detail.user.hasGithub ? "Linked" : "Not linked"}
          />
          {detail.user.lastSyncedAt && (
            <ProfileField
              label="Last GitHub sync"
              value={timeAgo(detail.user.lastSyncedAt)}
            />
          )}
        </div>
      </Section>

      <Section title="Coming soon" hint="schema ready, UI pending">
        <ul className="space-y-1.5 text-[12.5px] text-[var(--m-ink-2)]">
          <li>• Joining date + tenure</li>
          <li>• Probation period tracker</li>
          <li>• Leave balance (CL / SL / EL accruals)</li>
          <li>• Notice period status</li>
          <li>• Salary band visibility (HR-only)</li>
        </ul>
      </Section>
    </div>
  );
}

function ProfileField({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--m-border-soft)] bg-white px-3 py-2">
      <p className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)]">
        {label}
      </p>
      <p
        className={`mt-0.5 text-[13px] text-[var(--m-ink)] ${capitalize ? "capitalize" : ""} truncate`}
      >
        {value}
      </p>
    </div>
  );
}

function Section({
  title,
  hint,
  chip,
  children,
}: {
  title: string;
  hint?: string;
  chip?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--m-ink-3)]">
            {title}
          </h3>
          {chip}
        </div>
        {hint && <span className="text-[11px] text-[var(--m-ink-4)]">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/**
 * Manager's 1-line verdict at the top of the modal. Derived from the
 * strongest signal present: ongoing blocker > narrative signal > shift
 * verification > activity volume.
 */
/**
 * "Prep for 1:1" — collapsed by default. When the manager clicks Open,
 * we fetch the OneOnOneBrief and render wins / risks / questions.
 * Heuristic-only, no LLM cost.
 */
function OneOnOneSection({
  brief,
  loading,
  onLoad,
  work,
}: {
  brief: OneOnOneBrief | null;
  loading: boolean;
  onLoad: () => void;
  work: Detail["work"];
}) {
  return (
    <section className="rounded-xl border border-[var(--m-accent)]/30 bg-gradient-to-br from-[var(--m-accent-soft)]/40 to-white overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--m-accent)]/15 flex items-baseline justify-between gap-3">
        <h3 className="text-[12.5px] font-semibold text-[var(--m-accent-2)]">Prep for your 1:1</h3>
        <span className="text-[10.5px] text-[var(--m-ink-4)] tabular-nums">last {work.windowDays} days</span>
      </div>

      {/* The depth a manager actually needs: real artifacts, not just adjectives. */}
      <OneOnOneWork work={work} />

      {/* AI-style talking points — generated on demand. */}
      {!brief && !loading && (
        <div className="px-4 py-3 border-t border-[var(--m-border)] bg-[var(--m-bg-soft)]/40 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[11.5px] text-[var(--m-ink-3)]">
            Want talking points? Wins to acknowledge, risks to raise, and questions to ask.
          </p>
          <button
            type="button"
            onClick={onLoad}
            className="shrink-0 px-3 py-1.5 rounded-md bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white text-[12px] font-medium transition"
          >
            Generate talking points
          </button>
        </div>
      )}
      {loading && (
        <div className="px-4 py-3 border-t border-[var(--m-border)] bg-[var(--m-bg-soft)]/40">
          <p className="text-[12px] text-[var(--m-ink-3)]">Building talking points…</p>
        </div>
      )}
      {brief && (
        <>
          <div className="px-4 py-3 border-t border-[var(--m-border)] grid sm:grid-cols-3 gap-3">
            <OneOnOneColumn
              eyebrow="Wins to acknowledge"
              tone="good"
              items={brief.wins.map((w) => ({ title: w.title, sub: w.detail, href: w.sourceUrl }))}
            />
            <OneOnOneColumn
              eyebrow="Risks to discuss"
              tone="bad"
              items={brief.risks.map((r) => ({ title: r.title, sub: r.detail, severity: r.severity }))}
            />
            <OneOnOneColumn
              eyebrow="Questions to ask"
              tone="info"
              items={brief.questions.map((q) => ({ title: q, sub: "" }))}
            />
          </div>
          {brief.pastCommitments.length > 0 && (
            <div className="px-4 py-3 border-t border-[var(--m-border)] bg-[var(--m-bg-soft)]/50">
              <p className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-3)] mb-1">
                From the previous brief
              </p>
              <ul className="space-y-0.5">
                {brief.pastCommitments.map((c, i) => (
                  <li key={i} className="text-[12px] text-[var(--m-ink-2)] leading-snug">
                    • {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** The grounded-in-artifacts core of the 1:1 prep — what HR actually wants to see. */
function OneOnOneWork({ work }: { work: Detail["work"] }) {
  const w = work;
  const nothing = w.prs.length === 0 && w.reviewsGiven.length === 0 && w.reviewsReceived.length === 0 && w.commitCount === 0;
  const Chip = ({ n, label, sub }: { n: number; label: string; sub?: string }) => (
    <span className="inline-flex items-baseline gap-1 rounded-md border border-[var(--m-border-soft)] bg-white px-2 py-1">
      <span className="text-[12.5px] font-semibold text-[var(--m-ink)] tabular-nums">{n}</span>
      <span className="text-[10.5px] text-[var(--m-ink-4)]">{label}</span>
      {sub && <span className="text-[9.5px] text-[var(--m-ink-5)]">· {sub}</span>}
    </span>
  );
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        <Chip n={w.commitCount} label="commits" />
        <Chip n={w.prs.length} label="PRs" sub={`${w.prCounts.merged} merged · ${w.prCounts.in_review} in review`} />
        <Chip n={w.reviewsGiven.length} label="reviews given" />
        <Chip n={w.reviewsReceived.length} label="reviews received" />
      </div>

      {w.blocked && (
        <div className="rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 mb-3">
          <p className="text-[12px] font-semibold text-rose-900">{w.blocked.title}</p>
          <p className="text-[11.5px] text-rose-800/90 leading-snug">{w.blocked.detail}</p>
        </div>
      )}

      {nothing ? (
        <p className="text-[12px] text-[var(--m-ink-3)] italic">
          No GitHub activity in the window — ask about non-code work (design, planning, mentoring).
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {/* What they shipped */}
          <div>
            <h4 className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] mb-1.5">Shipping</h4>
            {w.prs.length > 0 ? (
              <ul className="space-y-1">
                {w.prs.slice(0, 6).map((p) => (
                  <li key={p.url}>
                    <a href={p.url} target="_blank" rel="noreferrer" className="flex items-baseline gap-1.5 group">
                      <PrStatusPill status={p.status} />
                      <span className="text-[12px] text-[var(--m-ink)] group-hover:text-[var(--m-accent)] truncate">{p.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : w.recentCommitTitles.length > 0 ? (
              <ul className="space-y-0.5">
                {w.recentCommitTitles.slice(0, 5).map((t, i) => (
                  <li key={i} className="text-[12px] text-[var(--m-ink-2)] truncate">· {t}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[11.5px] text-[var(--m-ink-4)] italic">No PRs or commits.</p>
            )}
          </div>

          {/* Who they collaborate with */}
          <div>
            <h4 className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] mb-1.5">Collaboration</h4>
            {w.reviewsGiven.length === 0 && w.reviewsReceived.length === 0 ? (
              <p className="text-[11.5px] text-[var(--m-ink-4)] italic">No review activity.</p>
            ) : (
              <ul className="space-y-1">
                {w.reviewsGiven.slice(0, 3).map((r, i) => (
                  <li key={`g${i}`} className="flex items-baseline gap-1.5">
                    <VerdictPill verdict={r.verdict} />
                    <span className="text-[12px] text-[var(--m-ink)] truncate">
                      reviewing {r.prAuthor ? `@${r.prAuthor}` : 'a PR'}
                    </span>
                  </li>
                ))}
                {w.reviewsReceived.slice(0, 3).map((r, i) => (
                  <li key={`r${i}`} className="flex items-baseline gap-1.5">
                    <VerdictPill verdict={r.verdict} />
                    <span className="text-[12px] text-[var(--m-ink-2)] truncate">
                      <span className="text-[var(--m-ink-3)]">{r.reviewer}</span> reviewed theirs
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OneOnOneColumn({
  eyebrow,
  tone,
  items,
}: {
  eyebrow: string;
  tone: "good" | "bad" | "info";
  items: Array<{
    title: string;
    sub: string;
    href?: string;
    severity?: "low" | "medium" | "high";
  }>;
}) {
  const dot =
    tone === "good"
      ? "var(--m-good)"
      : tone === "bad"
        ? "var(--m-bad)"
        : "var(--m-info)";
  return (
    <div>
      <p
        className="text-[10.5px] uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5"
        style={{ color: dot }}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: dot }}
        />
        {eyebrow}
      </p>
      {items.length === 0 ? (
        <p className="text-[11.5px] text-[var(--m-ink-3)] italic">
          Nothing to flag.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it, i) => (
            <li
              key={i}
              className="text-[12px] text-[var(--m-ink)] leading-snug"
            >
              {it.href ? (
                <a
                  href={it.href}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-[var(--m-accent)] font-medium"
                >
                  {it.title}
                </a>
              ) : (
                <span className="font-medium">{it.title}</span>
              )}
              {it.sub && (
                <p className="text-[11px] text-[var(--m-ink-3)] mt-0.5 leading-snug">
                  {it.sub}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// (QuickRead + deriveQuickRead + firstSentence were removed — the always-on
// banner duplicated the Today tab's TodaySnapshot blocked/at-risk state.)

/**
 * Universal 7-day signal — works for any discipline. Four tiles:
 *  - Worked: total productive hours
 *  - Focus %: deep-work ratio
 *  - Meetings: meetings attended this week
 *  - Shipped: count of "deliverables" — GitHub events for engineers, generic
 *    for other roles. Label adapts to the discipline.
 *
 * For engineering teams with GitHub linked, we also render the legacy
 * commit/PR/review/issue tile row underneath as supplemental detail.
 */
function UniversalSignal({ detail }: { detail: Detail }) {
  const focusMin = detail.last7DaysOutput.reduce(
    (acc, d) => acc + d.focusMin,
    0,
  );
  const onlineMin = detail.last7DaysOutput.reduce(
    (acc, d) => acc + d.onlineMin,
    0,
  );
  const focusPct = onlineMin > 0 ? Math.round((focusMin / onlineMin) * 100) : 0;
  const deliverableCount = detail.last7DaysOutput.reduce(
    (acc, d) => acc + d.commits + d.prs + d.reviews + d.issues,
    0,
  );
  const deliverableLabel = DISCIPLINE_DELIVERABLE_LABEL[detail.discipline];

  const meetingsValue =
    detail.weekMeetingsCount > 0
      ? `${detail.weekMeetingsCount} (${humanDuration(detail.weekMeetingsMin)})`
      : "—";

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <BigUniversalTile
          value={focusMin > 0 ? humanDuration(focusMin) : "—"}
          label="worked this week"
          tone="ink"
        />
        <BigUniversalTile
          value={focusPct > 0 ? `${focusPct}%` : "—"}
          label="focus ratio"
          tone="good"
        />
        <BigUniversalTile value={meetingsValue} label="meetings" tone="info" />
        <BigUniversalTile
          value={
            detail.user.hasGithub || detail.discipline === "engineering"
              ? String(deliverableCount)
              : detail.discipline === "other"
                ? "—"
                : "—"
          }
          label={deliverableLabel}
          tone={deliverableCount > 0 ? "accent" : "mute"}
        />
      </div>

      {/* Engineering supplemental — only when GitHub data is meaningful */}
      {detail.user.hasGithub && detail.discipline === "engineering" && (
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatTile
            n={countByGhType(detail.githubEvents, "commit")}
            label="commits"
            tone="emerald"
          />
          <StatTile
            n={countByGhType(detail.githubEvents, "pr_opened")}
            label="PRs opened"
            tone="violet"
          />
          <StatTile
            n={countByGhType(detail.githubEvents, "pr_reviewed")}
            label="reviews"
            tone="sky"
          />
          <StatTile
            n={countByGhType(detail.githubEvents, "issue_closed")}
            label="issues closed"
            tone="amber"
          />
        </div>
      )}
    </>
  );
}

function countByGhType(events: Detail["githubEvents"], t: string): number {
  return events.reduce((acc, e) => (e.type === t ? acc + 1 : acc), 0);
}

function BigUniversalTile({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone: "ink" | "good" | "info" | "accent" | "mute";
}) {
  const fg =
    tone === "good"
      ? "text-[var(--m-good)]"
      : tone === "info"
        ? "text-[var(--m-info)]"
        : tone === "accent"
          ? "text-[var(--m-accent)]"
          : tone === "mute"
            ? "text-[var(--m-ink-5)]"
            : "text-[var(--m-ink)]";
  return (
    <div className="rounded-lg border border-[var(--m-border)] bg-white px-3 py-2.5">
      <p
        className={`text-[22px] font-semibold tabular-nums tracking-tight ${fg}`}
      >
        {value}
      </p>
      <p className="text-[11px] text-[var(--m-ink-3)] mt-0.5 truncate">
        {label}
      </p>
    </div>
  );
}

/**
 * Empty-state for non-engineers without GitHub. Points at the kind of
 * integration that would unlock per-deliverable insights for their role.
 * For now this is a teaser — actual integrations land later.
 */
function IntegrationTeaser({ discipline }: { discipline: Discipline }) {
  const suggestion: Record<Discipline, { name: string; what: string }> = {
    engineering: { name: "GitHub", what: "commits, PRs and reviews" },
    design: { name: "Figma", what: "file activity and design reviews" },
    product: { name: "Linear", what: "tickets, specs and project flow" },
    sales: {
      name: "HubSpot / Salesforce",
      what: "deals, calls and stage changes",
    },
    support: { name: "Zendesk / Intercom", what: "tickets resolved and CSAT" },
    marketing: {
      name: "Notion / HubSpot",
      what: "campaigns and published posts",
    },
    ops: { name: "Asana / ClickUp", what: "task throughput and project flow" },
    hr: { name: "BambooHR / Keka", what: "cases handled and onboarding" },
    finance: {
      name: "QuickBooks / Tally",
      what: "reports filed and approvals",
    },
    exec: { name: "Notion", what: "decisions and OKR progress" },
    other: { name: "your tool of choice", what: "concrete deliverables" },
  };
  const s = suggestion[discipline];
  return (
    <section className="rounded-xl border border-[var(--m-border)] bg-[var(--m-bg-soft)]/40 px-4 py-3.5">
      <p className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] mb-1">
        Connect a tool to see deliverables
      </p>
      <p className="text-[12.5px] text-[var(--m-ink-2)] leading-snug">
        MARINA already tracks hours, focus time, meetings and breaks for this
        person — those work for every role. Connect{" "}
        <span className="font-medium text-[var(--m-ink)]">{s.name}</span> to
        also pull {s.what}.
      </p>
      <p className="mt-2 text-[11.5px] text-[var(--m-ink-3)]">
        Integration coming soon. Until then, the daily story uses screen
        evidence + activity.
      </p>
    </section>
  );
}

function StatTile({
  n,
  label,
  tone,
}: {
  n: number;
  label: string;
  tone: "emerald" | "violet" | "sky" | "amber";
}) {
  const dim = n === 0;
  const colorClass = dim
    ? "text-[var(--m-ink-5)]"
    : tone === "emerald"
      ? "text-emerald-700"
      : tone === "violet"
        ? "text-[var(--m-clay-deep)]"
        : tone === "sky"
          ? "text-sky-700"
          : "text-amber-700";
  return (
    <div className="rounded-lg border border-[var(--m-border)] bg-white px-3 py-2.5">
      <p
        className={`text-[24px] font-semibold tabular-nums tracking-tight ${colorClass}`}
      >
        {n}
      </p>
      <p className="text-[11px] text-[var(--m-ink-3)] mt-0.5">{label}</p>
    </div>
  );
}

function SignalPill({
  signal,
}: {
  signal: "High" | "Steady" | "Low" | "Blocked";
}) {
  const cfg = {
    High: {
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
      dot: "#059669",
    },
    Steady: { cls: "bg-sky-50 text-sky-700 border-sky-200", dot: "#0284c7" },
    Low: { cls: "bg-amber-50 text-amber-700 border-amber-200", dot: "#d97706" },
    Blocked: {
      cls: "bg-rose-50 text-rose-700 border-rose-200",
      dot: "#e11d48",
    },
  }[signal];
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-medium border ${cfg.cls}`}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: cfg.dot }}
      />
      {signal}
    </span>
  );
}

/**
 * Render a narrative as 2–4 scannable bullets. Falls back to the original
 * paragraph if it doesn't split cleanly.
 */
function NarrativeBullets({ text }: { text: string }) {
  const bullets = splitToBullets(text);
  if (bullets.length < 2) {
    return (
      <p className="text-[13px] text-[var(--m-ink-2)] leading-relaxed whitespace-pre-line">
        {text}
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {bullets.map((b, i) => (
        <li
          key={i}
          className="flex gap-2 text-[12.5px] text-[var(--m-ink-2)] leading-snug"
        >
          <span className="text-[var(--m-accent)] mt-0.5">•</span>
          <span>{b}</span>
        </li>
      ))}
    </ul>
  );
}

function splitToBullets(text: string): string[] {
  if (!text) return [];
  const cleaned = text.replace(/\s+/g, " ").trim();
  // Sentence split: end-of-sentence punctuation followed by a capital letter.
  const parts = cleaned
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.slice(0, 4);
}

function GitHubStats({
  events,
  hasGithub,
}: {
  events: Detail["githubEvents"];
  hasGithub: boolean;
}) {
  if (!hasGithub) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-[12.5px] text-amber-800">
        GitHub not linked. Their work shows up nowhere — ask them to sign in
        with GitHub.
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <p className="text-[12.5px] text-[var(--m-ink-3)]">
        No activity in the last 7 days.
      </p>
    );
  }
  return null;
}

function EventTypeBadge({ type }: { type: string }) {
  const cfg = {
    commit: { cls: "bg-emerald-50 text-emerald-700", label: "commit" },
    pr_opened: {
      cls: "bg-[var(--m-clay-soft)] text-[var(--m-clay-deep)]",
      label: "PR",
    },
    pr_reviewed: { cls: "bg-sky-50 text-sky-700", label: "review" },
    issue_closed: { cls: "bg-amber-50 text-amber-700", label: "issue" },
  }[type] ?? { cls: "bg-[var(--m-bg-soft)] text-[var(--m-ink-2)]", label: type };
  return (
    <span
      className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wider ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

const BREAK_CATEGORY: Record<
  string,
  { label: string; bg: string; fg: string; dot: string }
> = {
  focus: {
    label: "Focus",
    bg: "bg-[var(--m-accent-soft)]",
    fg: "text-[var(--m-accent-2)]",
    dot: "var(--m-accent)",
  },
  meeting: {
    label: "Meeting",
    bg: "bg-sky-50",
    fg: "text-sky-700",
    dot: "#0284c7",
  },
  blocked: {
    label: "Blocked",
    bg: "bg-rose-50",
    fg: "text-rose-700",
    dot: "#e11d48",
  },
  lunch: {
    label: "Lunch",
    bg: "bg-amber-50",
    fg: "text-amber-700",
    dot: "#d97706",
  },
  errand: {
    label: "Errand",
    bg: "bg-orange-50",
    fg: "text-orange-700",
    dot: "#ea580c",
  },
  personal: {
    label: "Personal",
    bg: "bg-[var(--m-bg-soft)]",
    fg: "text-[var(--m-ink-2)]",
    dot: "#64748b",
  },
  other: {
    label: "Other",
    bg: "bg-[var(--m-bg-soft)]",
    fg: "text-[var(--m-ink-2)]",
    dot: "#94a3b8",
  },
};

function BreakRow({ brk: b }: { brk: Detail["recentBreaks"][number] }) {
  const cat = BREAK_CATEGORY[b.category ?? "other"] ?? BREAK_CATEGORY.other!;
  const duration = b.endedAt
    ? humanDuration(
        Math.round(
          (new Date(b.endedAt).getTime() - new Date(b.startedAt).getTime()) /
            60000,
        ),
      )
    : "ongoing";
  return (
    <li className="flex items-center gap-2.5">
      <span
        className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-medium ${cat.bg} ${cat.fg}`}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: cat.dot }}
        />
        {cat.label}
      </span>
      <span className="text-[12.5px] text-[var(--m-ink-2)] truncate flex-1">
        {b.reason || "—"}
      </span>
      <span className="shrink-0 text-[11px] text-[var(--m-ink-3)] tabular-nums">
        {duration}
      </span>
      <span className="shrink-0 text-[11px] text-[var(--m-ink-4)]">
        {timeAgo(b.startedAt)}
      </span>
    </li>
  );
}

const LEAVE_TYPE_COLOR: Record<string, { bg: string; fg: string }> = {
  sick: { bg: "bg-rose-50", fg: "text-rose-700" },
  casual: { bg: "bg-sky-50", fg: "text-sky-700" },
  earned: { bg: "bg-emerald-50", fg: "text-emerald-700" },
  maternity: { bg: "bg-pink-50", fg: "text-pink-700" },
  paternity: { bg: "bg-pink-50", fg: "text-pink-700" },
  bereavement: { bg: "bg-[var(--m-bg-soft)]", fg: "text-[var(--m-ink-2)]" },
  compoff: { bg: "bg-[var(--m-clay-soft)]", fg: "text-[var(--m-clay-deep)]" },
  unpaid: { bg: "bg-amber-50", fg: "text-amber-700" },
  other: { bg: "bg-[var(--m-bg-soft)]", fg: "text-[var(--m-ink-2)]" },
};

function LeaveTypeChip({ type }: { type: string }) {
  const c = LEAVE_TYPE_COLOR[type] ?? LEAVE_TYPE_COLOR.other!;
  return (
    <span
      className={`shrink-0 text-[10.5px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full ${c.bg} ${c.fg}`}
    >
      {type}
    </span>
  );
}

function SceneList({ scenes }: { scenes: Scene[] }) {
  return (
    <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5">
      {scenes.slice(0, 12).map((s, i) => (
        <li
          key={i}
          className="flex items-start gap-2 text-[12px] text-[var(--m-ink-2)]"
        >
          <span
            className="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: SCENE_COLOR[s.kind] }}
          />
          <span className="min-w-0">
            <span className="text-[var(--m-ink-3)] tabular-nums">
              {fmtClock(s.startAt)}–{fmtClock(s.endAt)}
            </span>{" "}
            <span className="font-medium text-[var(--m-ink)]">{s.label}</span>
            {s.detail && <span className="text-[var(--m-ink-3)]"> · {s.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function humanDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Hoverable timeline ribbon. As the cursor moves across the ribbon, a
 * floating popover above shows the scene's evidence — top app, duration,
 * github events, screenshot labels, break reason. Tap a segment on mobile
 * to pin the popover.
 */
function InteractiveRibbon({ scenes }: { scenes: Scene[] }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);
  const [popoverLeft, setPopoverLeft] = useState(0);

  // Compute width % of each segment once
  const segments = useMemo(() => {
    if (scenes.length === 0) return [];
    const start = new Date(scenes[0]!.startAt).getTime();
    const end = new Date(scenes[scenes.length - 1]!.endAt).getTime();
    const span = Math.max(1, end - start);
    let cumPct = 0;
    return scenes.map((s) => {
      const w =
        ((new Date(s.endAt).getTime() - new Date(s.startAt).getTime()) / span) *
        100;
      const left = cumPct;
      cumPct += w;
      return { scene: s, leftPct: left, widthPct: w, centerPct: left + w / 2 };
    });
  }, [scenes]);

  if (scenes.length === 0) return null;

  const activeIdx = pinnedIdx ?? hoverIdx;
  const activeSegment = activeIdx != null ? segments[activeIdx] : null;

  return (
    <div className="relative" ref={wrapperRef}>
      {/* Popover */}
      {activeSegment && (
        <ScenePopover
          scene={activeSegment.scene}
          leftPx={popoverLeft}
          pinned={pinnedIdx !== null}
          onClose={() => setPinnedIdx(null)}
        />
      )}

      {/* Time axis labels */}
      <div className="flex justify-between text-[10px] text-[var(--m-ink-4)] tabular-nums mb-1">
        <span>{fmtClock(scenes[0]!.startAt)}</span>
        <span>{fmtClock(scenes[scenes.length - 1]!.endAt)}</span>
      </div>

      <div
        className="relative rounded-md overflow-hidden h-3.5 flex bg-[var(--m-bg-soft)] border border-[var(--m-border)] cursor-pointer"
        role="group"
        aria-label="Today's activity timeline"
      >
        {segments.map(({ scene: s, widthPct, centerPct }, i) => {
          const isActive = activeIdx === i;
          return (
            <div
              key={i}
              className="h-full transition-transform"
              style={{
                width: `${widthPct}%`,
                background: SCENE_COLOR[s.kind],
                transform: isActive ? "scaleY(1.4)" : "scaleY(1)",
                transformOrigin: "center",
              }}
              onMouseEnter={(e) => {
                setHoverIdx(i);
                // Anchor popover at the centre of the segment within wrapper
                const wrapperRect = wrapperRef.current?.getBoundingClientRect();
                if (wrapperRect) {
                  setPopoverLeft((wrapperRect.width * centerPct) / 100);
                }
                void e;
              }}
              onMouseLeave={() => setHoverIdx(null)}
              onClick={(e) => {
                e.stopPropagation();
                setPinnedIdx((p) => (p === i ? null : i));
                const wrapperRect = wrapperRef.current?.getBoundingClientRect();
                if (wrapperRect) {
                  setPopoverLeft((wrapperRect.width * centerPct) / 100);
                }
              }}
              tabIndex={0}
              onFocus={() => {
                setHoverIdx(i);
                const wrapperRect = wrapperRef.current?.getBoundingClientRect();
                if (wrapperRect) {
                  setPopoverLeft((wrapperRect.width * centerPct) / 100);
                }
              }}
              role="button"
              aria-label={`${s.label} from ${fmtClock(s.startAt)} to ${fmtClock(s.endAt)}`}
            />
          );
        })}
      </div>

      {pinnedIdx !== null && (
        <p className="mt-1.5 text-[10.5px] text-[var(--m-ink-4)] text-center">
          Pinned — click again to unpin
        </p>
      )}
    </div>
  );
}

/** Floating evidence card anchored to a scene segment. */
function ScenePopover({
  scene,
  leftPx,
  pinned,
  onClose,
}: {
  scene: Scene;
  leftPx: number;
  pinned: boolean;
  onClose: () => void;
}) {
  const ev = scene.evidence ?? {};
  const labels = ev.screenshotLabels ?? {};
  const labelChips = Object.entries(labels)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const minutes =
    ev.activeSeconds != null ? Math.round(ev.activeSeconds / 60) : null;
  const idleMin =
    ev.idleSeconds != null ? Math.round(ev.idleSeconds / 60) : null;
  return (
    <div
      className="absolute bottom-full mb-2 -translate-x-1/2 z-30 pointer-events-none"
      style={{ left: `${leftPx}px`, animation: "popIn 120ms ease-out" }}
    >
      <div className="pointer-events-auto min-w-[200px] max-w-[280px] rounded-lg border border-[var(--m-border)] bg-white shadow-xl px-3 py-2.5">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="min-w-0">
            <p className="text-[10.5px] uppercase tracking-wider text-[var(--m-ink-4)] font-semibold tabular-nums">
              {fmtClock(scene.startAt)} – {fmtClock(scene.endAt)}
            </p>
            <p className="text-[13px] font-semibold text-[var(--m-ink)] leading-tight">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
                style={{ background: SCENE_COLOR[scene.kind] }}
              />
              {scene.label}
            </p>
          </div>
          {pinned && (
            <button
              onClick={onClose}
              className="text-[var(--m-ink-4)] hover:text-[var(--m-ink-2)] -m-1 p-1"
              aria-label="Unpin"
            >
              <svg
                width={12}
                height={12}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path d="M6 6l12 12M18 6l-12 12" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
        {scene.detail && (
          <p className="text-[11.5px] text-[var(--m-ink-2)] leading-snug mb-1.5">
            {scene.detail}
          </p>
        )}
        <ul className="space-y-0.5 text-[11.5px] text-[var(--m-ink-2)]">
          {ev.topApp && (
            <li>
              <span className="text-[var(--m-ink-3)]">App: </span>
              <span className="font-medium">{ev.topApp}</span>
            </li>
          )}
          {minutes != null && (
            <li>
              <span className="text-[var(--m-ink-3)]">Active: </span>
              <span className="font-medium tabular-nums">
                {humanDuration(minutes)}
              </span>
              {idleMin != null && idleMin > 0 && (
                <span className="text-[var(--m-ink-4)] tabular-nums">
                  {" "}
                  · idle {humanDuration(idleMin)}
                </span>
              )}
            </li>
          )}
          {(ev.githubEvents ?? 0) > 0 && (
            <li>
              <span className="text-[var(--m-ink-3)]">GitHub: </span>
              <span className="font-medium">
                {ev.githubEvents} event{ev.githubEvents === 1 ? "" : "s"}
              </span>
            </li>
          )}
          {ev.breakReason && (
            <li>
              <span className="text-[var(--m-ink-3)]">Reason: </span>
              <span className="font-medium">{ev.breakReason}</span>
            </li>
          )}
          {labelChips.length > 0 && (
            <li className="flex items-center gap-1 flex-wrap mt-1">
              {labelChips.map(([k, n]) => (
                <span
                  key={k}
                  className="text-[10px] text-[var(--m-ink-2)] bg-[var(--m-bg-soft)] px-1.5 py-0.5 rounded-full"
                >
                  {humanizeHint(k)} · {n}
                </span>
              ))}
            </li>
          )}
        </ul>
        {/* Arrow */}
        <span className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 rotate-45 bg-white border-r border-b border-[var(--m-border)]" />
      </div>
      <style jsx>{`
        @keyframes popIn {
          from {
            opacity: 0;
            transform: translate(-50%, 4px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
      `}</style>
    </div>
  );
}

function humanizeHint(k: string): string {
  return k.replace(/_/g, " ");
}

/**
 * Group GitHub events by type and render concrete artifacts. Commit /
 * review titles become subtle one-liners; PRs and closed issues get
 * their own emphasized cards with clickable titles.
 */
// WhatShipped + ArtifactGroup were removed here — superseded by WorkView (below),
// which groups PRs by status, splits reviews into given/received, surfaces commit
// themes + a blocked signal, and adds an on-demand AI summary.

/**
 * WorkView — the manager's "what is this person actually working on" read.
 * Built from the structured `work` payload (GitHub App events over 14 days):
 * an optional AI summary on top, a blocked callout, a one-line stat row, then
 * PRs grouped by status, reviews given + received, and commit themes.
 */
function WorkView({
  detail,
  orgId,
  membershipId,
}: {
  detail: Detail;
  orgId: number;
  membershipId: number;
}) {
  const w = detail.work;
  const name = detail.user.name ?? `@${detail.user.login}`;
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryErr, setSummaryErr] = useState<string | null>(null);

  async function loadSummary() {
    setSummaryLoading(true);
    setSummaryErr(null);
    try {
      const res = await fetch(
        `/api/orgs/${orgId}/members/${membershipId}/work-summary`,
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          (data as { error?: string })?.error || `HTTP ${res.status}`,
        );
      setSummary(data.summary);
    } catch (e) {
      setSummaryErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSummaryLoading(false);
    }
  }

  const nothing =
    w.prs.length === 0 &&
    w.reviewsGiven.length === 0 &&
    w.reviewsReceived.length === 0 &&
    w.commitCount === 0;

  const STAT = (label: string, value: string | number) => (
    <span className="inline-flex items-baseline gap-1 rounded-md border border-[var(--m-border-soft)] bg-white px-2 py-1">
      <span className="text-[12px] font-semibold text-[var(--m-ink)] tabular-nums">
        {value}
      </span>
      <span className="text-[10.5px] text-[var(--m-ink-4)]">{label}</span>
    </span>
  );

  return (
    <Section title="Work" hint={`last ${w.windowDays} days · from GitHub`}>
      {/* AI summary — on demand so we don't spend a model call on every open */}
      <div className="rounded-lg border border-[var(--m-border)] bg-[var(--m-bg-soft)] px-3.5 py-3 mb-4">
        {summary ? (
          <p className="text-[13px] text-[var(--m-ink-2)] leading-relaxed">
            {summary}
          </p>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] text-[var(--m-ink-3)]">
              AI read of what {name} is working on — grounded only in the
              activity below.
            </p>
            <button
              type="button"
              onClick={loadSummary}
              disabled={summaryLoading}
              className="shrink-0 px-3 py-1.5 rounded-md bg-[var(--m-ink)] hover:bg-[var(--m-ink-2)] text-white text-[12px] font-medium disabled:opacity-50 transition"
            >
              {summaryLoading ? "Summarizing…" : "✨ Summarize"}
            </button>
          </div>
        )}
        {summaryErr && (
          <p className="mt-1.5 text-[11.5px] text-rose-600">{summaryErr}</p>
        )}
      </div>

      {/* Blocked / at-risk callout */}
      {w.blocked && (
        <div className="rounded-lg border border-rose-200 bg-rose-50/60 px-3.5 py-2.5 mb-4">
          <p className="text-[12.5px] font-semibold text-rose-900">
            {w.blocked.title}
          </p>
          <p className="mt-0.5 text-[12px] text-rose-800/90 leading-snug">
            {w.blocked.detail}
          </p>
        </div>
      )}

      {/* One-line stat row */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {STAT("commits", w.commitCount)}
        {STAT("PRs", w.prs.length)}
        {STAT("reviews given", w.reviewsGiven.length)}
        {STAT("reviews received", w.reviewsReceived.length)}
        {STAT(
          "meetings",
          `${w.meetings.count}·${Math.round(w.meetings.minutes / 60)}h`,
        )}
      </div>

      {nothing ? (
        <p className="text-[12px] text-[var(--m-ink-3)] italic">
          No GitHub activity in the last {w.windowDays} days.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Pull requests grouped by status */}
          {w.prs.length > 0 && <PrGroups prs={w.prs} counts={w.prCounts} />}

          {/* Reviewing others' work */}
          {w.reviewsGiven.length > 0 && (
            <div>
              <h4 className="text-[11px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] mb-1.5">
                Reviewing others ({w.reviewsGiven.length})
              </h4>
              <ul className="space-y-1">
                {w.reviewsGiven.slice(0, 8).map((r, i) => (
                  <li key={i}>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-baseline gap-2 group"
                    >
                      <VerdictPill verdict={r.verdict} />
                      <span className="text-[12.5px] text-[var(--m-ink)] group-hover:text-[var(--m-accent)] truncate">
                        {r.prAuthor ? (
                          <span className="text-[var(--m-ink-3)]">
                            @{r.prAuthor}:{" "}
                          </span>
                        ) : null}
                        {r.title}
                      </span>
                      <span className="ml-auto shrink-0 text-[10.5px] text-[var(--m-ink-4)] truncate max-w-[110px]">
                        {r.repo}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Their PRs being reviewed by others — collaboration / unblocking */}
          {w.reviewsReceived.length > 0 && (
            <div>
              <h4 className="text-[11px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] mb-1.5">
                Others reviewing their work ({w.reviewsReceived.length})
              </h4>
              <ul className="space-y-1">
                {w.reviewsReceived.slice(0, 8).map((r, i) => (
                  <li key={i}>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-baseline gap-2 group"
                    >
                      <VerdictPill verdict={r.verdict} />
                      <span className="text-[12.5px] text-[var(--m-ink)] group-hover:text-[var(--m-accent)] truncate">
                        <span className="text-[var(--m-ink-3)]">
                          {r.reviewer}:{" "}
                        </span>
                        {r.title}
                      </span>
                      <span className="ml-auto shrink-0 text-[10.5px] text-[var(--m-ink-4)] truncate max-w-[110px]">
                        {r.repo}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Commit themes — only lead with these when there are no PRs to show */}
          {w.prs.length === 0 && w.recentCommitTitles.length > 0 && (
            <div>
              <h4 className="text-[11px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] mb-1.5">
                What they&apos;re committing
              </h4>
              <ul className="space-y-0.5">
                {w.recentCommitTitles.map((t, i) => (
                  <li
                    key={i}
                    className="text-[12.5px] text-[var(--m-ink-2)] truncate"
                  >
                    <span className="text-[var(--m-ink-5)]">·</span> {t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Repo spread */}
          {detail.topRepos.length > 0 && (
            <div>
              <h4 className="text-[11px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] mb-1.5">
                Repos
              </h4>
              <TopReposStrip repos={detail.topRepos} />
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

/** PRs grouped by status, each with a link + status pill. */
function PrGroups({
  prs,
  counts,
}: {
  prs: Detail["work"]["prs"];
  counts: Detail["work"]["prCounts"];
}) {
  const ORDER: Array<{ key: keyof Detail["work"]["prCounts"]; label: string }> =
    [
      { key: "in_review", label: "In review" },
      { key: "open", label: "Open" },
      { key: "merged", label: "Merged" },
      { key: "closed", label: "Closed" },
      { key: "draft", label: "Draft" },
    ];
  return (
    <div>
      <h4 className="text-[11px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] mb-1.5">
        Pull requests ({prs.length})
      </h4>
      <div className="space-y-2.5">
        {ORDER.filter((g) => counts[g.key] > 0).map((g) => (
          <div key={g.key}>
            <p className="text-[11px] font-medium text-[var(--m-ink-3)] mb-1 flex items-center gap-1.5">
              <PrStatusPill status={g.key} /> {g.label}
            </p>
            <ul className="space-y-1 pl-0.5">
              {prs
                .filter((p) => p.status === g.key)
                .map((p) => (
                  <li key={p.url}>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-baseline gap-2 group"
                    >
                      <span className="text-[12.5px] text-[var(--m-ink)] group-hover:text-[var(--m-accent)] truncate">
                        {p.number ? (
                          <span className="text-[var(--m-ink-4)] tabular-nums">
                            #{p.number}{" "}
                          </span>
                        ) : null}
                        {p.title}
                      </span>
                      <span className="ml-auto shrink-0 text-[10.5px] text-[var(--m-ink-4)] truncate max-w-[120px]">
                        {p.repo}
                      </span>
                    </a>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function PrStatusPill({
  status,
}: {
  status: keyof Detail["work"]["prCounts"];
}) {
  const cfg: Record<string, { bg: string; fg: string; label: string }> = {
    in_review: { bg: "bg-amber-100", fg: "text-amber-800", label: "review" },
    open: { bg: "bg-[var(--m-bg-soft)]", fg: "text-[var(--m-ink-2)]", label: "open" },
    merged: { bg: "bg-violet-100", fg: "text-violet-800", label: "merged" },
    closed: { bg: "bg-rose-100", fg: "text-rose-700", label: "closed" },
    draft: { bg: "bg-[var(--m-bg-soft)]", fg: "text-[var(--m-ink-3)]", label: "draft" },
  };
  const c = cfg[status] ?? cfg.open;
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[9.5px] font-semibold uppercase tracking-wide ${c.bg} ${c.fg}`}
    >
      {c.label}
    </span>
  );
}

function VerdictPill({ verdict }: { verdict: string | null }) {
  const v = (verdict ?? "").toUpperCase();
  const cfg =
    v === "APPROVED"
      ? { bg: "bg-emerald-100", fg: "text-emerald-800", label: "✓ approved" }
      : v === "CHANGES_REQUESTED"
        ? { bg: "bg-amber-100", fg: "text-amber-800", label: "✎ changes" }
        : v === "DISMISSED"
          ? { bg: "bg-[var(--m-bg-soft)]", fg: "text-[var(--m-ink-3)]", label: "dismissed" }
          : { bg: "bg-sky-100", fg: "text-sky-700", label: "comment" };
  return (
    <span
      className={`shrink-0 inline-block px-1.5 py-0.5 rounded text-[9.5px] font-semibold ${cfg.bg} ${cfg.fg}`}
    >
      {cfg.label}
    </span>
  );
}

/** Horizontal proportional bar showing top apps by active seconds. */
/** Manager-side list of self-reported deliverables — the universal output. */
function DeliverableList({ items }: { items: Detail["recentDeliverables"] }) {
  return (
    <ul className="divide-y divide-[var(--m-border-soft)] border border-[var(--m-border-soft)] rounded-lg overflow-hidden">
      {items.slice(0, 12).map((d) => {
        const verifyChip =
          d.verificationStatus === "verified"
            ? {
                bg: "bg-[var(--m-good-soft)]",
                fg: "text-[var(--m-good)]",
                label: "verified",
              }
            : d.verificationStatus === "mismatch"
              ? {
                  bg: "bg-[var(--m-bad-soft)]",
                  fg: "text-[var(--m-bad)]",
                  label: "mismatch",
                }
              : null;
        return (
          <li
            key={d.id}
            className="px-3 py-2 flex items-start gap-3 text-[12.5px]"
          >
            <span
              className="shrink-0 w-1.5 h-1.5 rounded-full mt-1.5"
              style={{ background: "var(--m-accent)" }}
              aria-hidden
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                {d.url ? (
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--m-ink)] font-medium hover:text-[var(--m-accent)] truncate"
                  >
                    {d.title}
                  </a>
                ) : (
                  <span className="text-[var(--m-ink)] font-medium truncate">
                    {d.title}
                  </span>
                )}
                {d.kind && (
                  <span className="text-[10px] uppercase tracking-wider text-[var(--m-ink-4)]">
                    {d.kind}
                  </span>
                )}
                {verifyChip && (
                  <span
                    className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full ${verifyChip.bg} ${verifyChip.fg}`}
                  >
                    {verifyChip.label}
                  </span>
                )}
              </div>
              {d.detail && (
                <p className="mt-0.5 text-[11.5px] text-[var(--m-ink-3)] leading-snug">
                  {d.detail}
                </p>
              )}
            </div>
            <span className="shrink-0 text-[11px] text-[var(--m-ink-4)] tabular-nums">
              {timeAgo(d.completedAt)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function AppUsageBars({
  usage,
}: {
  usage: Array<{ app: string; seconds: number }>;
}) {
  const total = usage.reduce((acc, u) => acc + u.seconds, 0);
  if (total === 0)
    return (
      <p className="text-[12px] text-[var(--m-ink-3)]">
        No activity samples yet today.
      </p>
    );

  const PALETTE = [
    "#6366f1",
    "#10b981",
    "#f59e0b",
    "#ec4899",
    "#0ea5e9",
    "#a855f7",
  ];

  return (
    <div>
      <div className="flex rounded-full overflow-hidden h-2 bg-[var(--m-bg-soft)] border border-[var(--m-border)]">
        {usage.map((u, i) => (
          <div
            key={u.app}
            className="h-full"
            style={{
              width: `${(u.seconds / total) * 100}%`,
              background: PALETTE[i % PALETTE.length],
            }}
            title={`${u.app} · ${humanDuration(Math.round(u.seconds / 60))}`}
          />
        ))}
      </div>
      <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
        {usage.map((u, i) => (
          <li key={u.app} className="flex items-center gap-2 text-[12px]">
            <span
              className="inline-block w-2 h-2 rounded-sm"
              style={{ background: PALETTE[i % PALETTE.length] }}
            />
            <span className="text-[var(--m-ink-2)] truncate">{u.app}</span>
            <span className="ml-auto shrink-0 text-[var(--m-ink-3)] tabular-nums">
              {humanDuration(Math.round(u.seconds / 60))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Work / non-work / ambiguous percentages with category chips. */
function ScreenMix({ mix }: { mix: Detail["screenMix"] }) {
  if (mix.total === 0) return null;
  const pct = (n: number) => Math.round((n / mix.total) * 100);
  const wPct = pct(mix.counts.work);
  const nPct = pct(mix.counts.non_work);
  const aPct = 100 - wPct - nPct;
  return (
    <div>
      <div className="flex rounded-full overflow-hidden h-2 bg-[var(--m-bg-soft)] border border-[var(--m-border)]">
        <div className="h-full bg-emerald-500" style={{ width: `${wPct}%` }} />
        <div className="h-full bg-rose-400" style={{ width: `${nPct}%` }} />
        <div className="h-full bg-[var(--m-ink-5)]" style={{ width: `${aPct}%` }} />
      </div>
      <div className="mt-2 flex items-center gap-3 text-[11.5px] text-[var(--m-ink-2)] flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" />
          <span className="font-medium tabular-nums">{wPct}%</span>
          <span className="text-[var(--m-ink-3)]">work</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-sm bg-rose-400" />
          <span className="font-medium tabular-nums">{nPct}%</span>
          <span className="text-[var(--m-ink-3)]">non-work</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-sm bg-[var(--m-ink-5)]" />
          <span className="font-medium tabular-nums">{aPct}%</span>
          <span className="text-[var(--m-ink-3)]">ambiguous</span>
        </span>
      </div>
      {(mix.topHints.length > 0 || mix.topCategories.length > 0) && (
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {mix.topHints.map(({ k, n }) => (
            <span
              key={k}
              className="text-[10.5px] text-[var(--m-ink-2)] bg-[var(--m-bg-soft)] px-1.5 py-0.5 rounded-full"
            >
              {humanizeHint(k)} · {n}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───── Manager-depth components ────────────────────────────────────────── */

/**
 * Today snapshot — the always-rendered "what does this person look like RIGHT
 * NOW" tile grid. Lives at the top of the Today tab and is designed for HR
 * + manager personas:
 *
 *  - HR: at-a-glance "is this person here, are they shipping, are they
 *    blocked, are they about to take leave?"
 *  - Manager: "what's the immediate ask for the next 1:1 with this person?"
 *
 * The tiles deliberately collapse a lot of data into 1-2 lines each so the
 * snapshot stays scan-able. Click-through to the relevant tab for depth.
 *
 * Why this needs to exist: when a teammate is brand-new (no GitHub, no story,
 * no narrative) the Today tab used to render essentially nothing — even
 * though the outer card had useful info (Off-clock, no GitHub, no signals).
 * The snapshot is the floor: even a brand-new teammate shows here.
 */
function TodaySnapshot({ detail }: { detail: Detail }) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const activeBreak = detail.recentBreaks.find((b) => !b.endedAt) ?? null;
  const isOnShift = !!detail.latestShift && !detail.latestShift.punchedOutAt;
  const todayDeliverables = detail.recentDeliverables.filter(
    (d) => d.completedAt.slice(0, 10) === todayIso,
  );
  const todayBreaks = detail.recentBreaks.filter(
    (b) => b.startedAt.slice(0, 10) === todayIso,
  );
  const onLeaveToday = detail.recentLeaves.find(
    (l) =>
      l.status === "approved" &&
      l.startDate <= todayIso &&
      l.endDate >= todayIso,
  );
  const pairedDevices = detail.devices.filter((d) => !d.revokedAt);
  const onlineDevice = pairedDevices.find(
    (d) =>
      d.lastSeenAt &&
      Date.now() - new Date(d.lastSeenAt).getTime() < 24 * 60 * 60 * 1000,
  );

  // Status — the headline pill
  const status: { label: string; tone: "good" | "warn" | "bad" | "neutral" } =
    (() => {
      if (onLeaveToday)
        return { label: `On leave · ${onLeaveToday.leaveType}`, tone: "warn" };
      if (activeBreak?.category === "blocked")
        return { label: "Blocked", tone: "bad" };
      if (activeBreak)
        return { label: `On break · ${activeBreak.category}`, tone: "warn" };
      if (isOnShift)
        return detail.shiftTotals.workMin === 0 && detail.shiftTotals.idleMin === 0
          ? { label: "On the clock", tone: "neutral" }
          : { label: "Working", tone: "good" };
      return { label: "Off-clock", tone: "neutral" };
    })();
  const statusColor =
    status.tone === "good"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status.tone === "warn"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : status.tone === "bad"
          ? "bg-rose-50 text-rose-700 border-rose-200"
          : "bg-[var(--m-bg-soft)] text-[var(--m-ink-2)] border-[var(--m-border)]";

  // Today's work minutes — from the latest shift's punch-in.
  const todayMinutes =
    isOnShift && detail.latestShift
      ? Math.floor(
          (Date.now() - new Date(detail.latestShift.punchedInAt).getTime()) /
            60000,
        )
      : detail.shiftTotals.workMin;

  // 7d shipped (deliverables + GH commits combined for an honest engineer + non-engineer view).
  const ghLast7 = detail.last7DaysOutput.reduce(
    (acc, d) => acc + d.commits + d.prs + d.reviews + d.issues,
    0,
  );
  const shipped7d =
    ghLast7 +
    detail.recentDeliverables.filter(
      (d) =>
        new Date(d.completedAt).getTime() >
        Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).length;

  // Tenure (joined ago)
  const tenureStr = (() => {
    if (!detail.joinedOn) return null;
    const days = Math.floor(
      (Date.now() - new Date(detail.joinedOn + "T00:00:00").getTime()) /
        (24 * 60 * 60 * 1000),
    );
    if (days < 0) return null;
    if (days < 30) return `${days}d`;
    if (days < 365) return `${Math.floor(days / 30)}mo`;
    return `${(days / 365).toFixed(1)}y`;
  })();

  // Setup health
  const setupBits: Array<{ label: string; ok: boolean }> = [
    { label: "GitHub", ok: detail.user.hasGithub },
    { label: "Agent", ok: pairedDevices.length > 0 },
    {
      label: "Calendar",
      ok: detail.todayMeetings.length > 0 || detail.weekMeetingsCount > 0,
    },
  ];
  const setupComplete = setupBits.filter((b) => b.ok).length;

  return (
    <section className="rounded-xl border border-[var(--m-border)] bg-white p-4">
      {/* Top row: name pill + status + tenure */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span
          className={`text-[11.5px] font-medium px-2 py-0.5 rounded-full border ${statusColor}`}
        >
          {status.label}
        </span>
        {tenureStr && (
          <span className="text-[11px] text-[var(--m-ink-4)]">
            with the team for{" "}
            <span className="text-[var(--m-ink-2)] font-medium">
              {tenureStr}
            </span>
          </span>
        )}
        {detail.jobTitle && (
          <span className="text-[11px] text-[var(--m-ink-4)] truncate">
            · {detail.jobTitle}
          </span>
        )}
      </div>

      {/* Tile grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <Tile
          label="Today"
          value={isOnShift ? fmtHm(todayMinutes) : "—"}
          sub={
            isOnShift
              ? detail.shiftTotals.workMin === 0 && detail.shiftTotals.idleMin === 0
                ? "on the clock · no agent activity"
                : "on the clock"
              : "not punched in"
          }
        />
        <Tile
          label="Shipped today"
          value={todayDeliverables.length.toString()}
          sub={
            todayDeliverables.length === 0
              ? "no deliverables logged"
              : todayDeliverables[0].title.slice(0, 28) +
                (todayDeliverables[0].title.length > 28 ? "…" : "")
          }
        />
        <Tile
          label="Breaks today"
          value={todayBreaks.length.toString()}
          sub={
            todayBreaks.length === 0
              ? "no breaks"
              : `${todayBreaks.filter((b) => !b.endedAt).length} active`
          }
        />
        <Tile
          label="Meetings today"
          value={detail.todayMeetings.length.toString()}
          sub={
            detail.weekMeetingsCount > 0
              ? `${detail.weekMeetingsCount} this week`
              : "none scheduled"
          }
        />
        <Tile
          label="Shipped 7d"
          value={shipped7d.toString()}
          sub="commits + PRs + deliverables"
        />
        <Tile
          label="Setup"
          value={`${setupComplete}/3`}
          sub={
            setupBits
              .filter((b) => !b.ok)
              .map((b) => b.label)
              .join(", ") || "fully connected"
          }
          tone={setupComplete < 2 ? "warn" : "neutral"}
        />
        <Tile
          label="Devices"
          value={pairedDevices.length.toString()}
          sub={
            onlineDevice
              ? `Online · ${onlineDevice.platform ?? "?"}`
              : pairedDevices.length === 0
                ? "no agent"
                : "paired but offline"
          }
          tone={pairedDevices.length === 0 ? "warn" : "neutral"}
        />
        <Tile
          label="Recent leaves"
          value={detail.recentLeaves
            .filter((l) => l.status === "approved")
            .length.toString()}
          sub={
            detail.recentLeaves[0]?.status === "pending"
              ? "1 pending"
              : "last 60 days"
          }
        />
      </div>

      {/* If the active break is a blocker, surface the reason inline — most
          urgent thing a manager needs to see when they open this tab. */}
      {activeBreak?.category === "blocked" && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
          <p className="text-[10.5px] uppercase tracking-wider text-rose-700 font-semibold">
            Active blocker ·{" "}
            {Math.floor(
              (Date.now() - new Date(activeBreak.startedAt).getTime()) / 60000,
            )}
            m
          </p>
          <p className="text-[12.5px] text-rose-900 mt-0.5">
            {activeBreak.reason || "(no reason given)"}
            {activeBreak.waitingOnExternal && (
              <span className="text-rose-700">
                {" "}
                — waiting on {activeBreak.waitingOnExternal}
              </span>
            )}
          </p>
        </div>
      )}

      {/* If on leave, surface the leave reason + dates inline. */}
      {onLeaveToday && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-[10.5px] uppercase tracking-wider text-amber-700 font-semibold">
            On leave · {onLeaveToday.leaveType}
          </p>
          <p className="text-[12.5px] text-amber-900 mt-0.5">
            {onLeaveToday.startDate} → {onLeaveToday.endDate}
            {onLeaveToday.reason && ` · ${onLeaveToday.reason}`}
          </p>
        </div>
      )}
    </section>
  );
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "warn" | "neutral";
}) {
  const fg = tone === "warn" ? "text-amber-700" : "text-[var(--m-ink)]";
  return (
    <div className="rounded-lg border border-[var(--m-border)] bg-[var(--m-bg-soft)]/40 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-[var(--m-ink-4)] font-semibold">
        {label}
      </p>
      <p
        className={`mt-1 text-[18px] font-display tracking-tight tabular-nums ${fg}`}
      >
        {value}
      </p>
      <p className="text-[10.5px] text-[var(--m-ink-3)] mt-0.5 truncate">
        {sub}
      </p>
    </div>
  );
}

function fmtHm(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/** Compact row of risk chips at the top of the Overview tab. */
function RisksStrip({ risks }: { risks: Detail["risks"] }) {
  const color = (s: "low" | "medium" | "high") =>
    s === "high"
      ? {
          bg: "bg-[var(--m-bad-soft)]",
          fg: "text-[var(--m-bad)]",
          dot: "var(--m-bad)",
        }
      : s === "medium"
        ? {
            bg: "bg-[var(--m-warn-soft)]",
            fg: "text-[var(--m-warn)]",
            dot: "var(--m-warn)",
          }
        : {
            bg: "bg-[var(--m-bg-soft)]",
            fg: "text-[var(--m-ink-2)]",
            dot: "var(--m-ink-5)",
          };
  return (
    <section className="rounded-xl border border-[var(--m-border)] bg-white p-3">
      <p className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--m-ink-4)] mb-2">
        Worth your attention
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {risks.map((r, i) => {
          const c = color(r.severity);
          return (
            <li
              key={i}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11.5px] ${c.bg} ${c.fg}`}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: c.dot }}
              />
              {r.label}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Seven-day output strip — one bar per day showing PRs+commits+reviews,
 * plus a focus-time ribbon underneath. Tiny labels keep it scannable; hover
 * surfaces the exact numbers.
 */
function SevenDayTrendStrip({
  days,
  discipline,
  hasGithub,
}: {
  days: Detail["last7DaysOutput"];
  discipline?: Discipline;
  hasGithub?: boolean;
}) {
  // For non-engineering roles without GitHub, the "output" bar is meaningless
  // (always zero) so we hide it and only show focus time. Otherwise we show
  // both bars.
  const showOutputBar = hasGithub || discipline === "engineering";
  const maxOutput = Math.max(
    1,
    ...days.map((d) => d.commits + d.prs + d.reviews + d.issues),
  );
  const maxFocus = Math.max(1, ...days.map((d) => d.focusMin));
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {days.map((d) => {
        const total = d.commits + d.prs + d.reviews + d.issues;
        const outputH = Math.round((total / maxOutput) * 56);
        const focusH = Math.round((d.focusMin / maxFocus) * 56);
        const dayNum = Number(d.date.slice(-2));
        const dow = new Date(d.date + "T00:00:00").toLocaleDateString(
          undefined,
          { weekday: "short" },
        );
        return (
          <div
            key={d.date}
            className="flex flex-col items-center gap-1 rounded-md py-2 px-1 bg-[var(--m-bg-soft)] border border-[var(--m-border-soft)]"
            title={`${dow} ${dayNum} · ${total} events · ${humanDuration(d.focusMin)} focus`}
          >
            <div className="flex items-end gap-0.5 h-14">
              {showOutputBar && (
                <span
                  className="w-2 rounded-sm bg-[var(--m-accent)]"
                  style={{ height: `${Math.max(2, outputH)}px` }}
                  aria-label={`${total} GitHub events`}
                />
              )}
              <span
                className={`${showOutputBar ? "w-2" : "w-3"} rounded-sm bg-[var(--m-good)]`}
                style={{ height: `${Math.max(2, focusH)}px` }}
                aria-label={`${humanDuration(d.focusMin)} focus`}
              />
            </div>
            <span className="text-[9.5px] font-semibold tabular-nums text-[var(--m-ink)]">
              {dayNum}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-[var(--m-ink-4)]">
              {dow.slice(0, 2)}
            </span>
          </div>
        );
      })}
      <div className="col-span-7 mt-1 flex items-center gap-4 text-[10.5px] text-[var(--m-ink-3)]">
        {showOutputBar && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-sm bg-[var(--m-accent)]" />
            GitHub events
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-sm bg-[var(--m-good)]" />
          Focus time
        </span>
      </div>
    </div>
  );
}

/** Today's meetings: clock-aligned list with conf links and RSVP state. */
function TodayMeetings({ meetings }: { meetings: Detail["todayMeetings"] }) {
  const now = Date.now();
  return (
    <ul className="space-y-1.5">
      {meetings.slice(0, 6).map((m) => {
        const start = new Date(m.startAt).getTime();
        const end = new Date(m.endAt).getTime();
        const isLive = now >= start && now <= end;
        const isPast = now > end;
        return (
          <li
            key={m.id}
            className={`flex items-center gap-3 rounded-lg border border-[var(--m-border-soft)] px-3 py-1.5 ${
              isLive
                ? "bg-[var(--m-good-soft)] border-[var(--m-good)]/30"
                : "bg-white"
            } ${isPast ? "opacity-60" : ""}`}
          >
            <span className="shrink-0 text-[11.5px] font-medium text-[var(--m-ink-2)] tabular-nums w-14">
              {fmtClock(m.startAt)}
            </span>
            <span className="text-[12.5px] text-[var(--m-ink)] truncate flex-1">
              {m.title}
            </span>
            {m.rsvpStatus && m.rsvpStatus !== "accepted" && (
              <span className="shrink-0 text-[10px] uppercase tracking-wider text-[var(--m-ink-4)]">
                {m.rsvpStatus}
              </span>
            )}
            {m.conferenceUrl && (
              <a
                href={m.conferenceUrl}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-[11px] text-[var(--m-accent)] hover:text-[var(--m-accent-2)] font-medium"
              >
                Join →
              </a>
            )}
            {isLive && (
              <span className="shrink-0 text-[10px] font-semibold text-[var(--m-good)] uppercase tracking-wider">
                Live
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Where they're working: top repos by event count. */
function TopReposStrip({ repos }: { repos: Detail["topRepos"] }) {
  const max = Math.max(1, ...repos.map((r) => r.events));
  return (
    <ul className="space-y-1.5">
      {repos.map((r) => (
        <li key={r.repo} className="flex items-center gap-3">
          <span className="text-[12.5px] text-[var(--m-ink)] truncate w-44">
            {r.repo}
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-[var(--m-bg-soft)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--m-accent)]"
              style={{ width: `${(r.events / max) * 100}%` }}
            />
          </div>
          <span className="shrink-0 text-[11px] text-[var(--m-ink-3)] tabular-nums w-10 text-right">
            {r.events}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Compact list of recent shifts in the current week. */
function RecentShiftsList({ shifts }: { shifts: Detail["last7Shifts"] }) {
  return (
    <ul className="divide-y divide-[var(--m-border-soft)] border border-[var(--m-border-soft)] rounded-lg overflow-hidden">
      {shifts.map((s) => {
        const start = new Date(s.punchedInAt);
        const end = s.punchedOutAt ? new Date(s.punchedOutAt) : null;
        return (
          <li
            key={s.id}
            className="px-3 py-2 flex items-center gap-3 text-[12.5px]"
          >
            <span className="font-medium text-[var(--m-ink)] w-24 shrink-0">
              {start.toLocaleDateString(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </span>
            <span className="text-[var(--m-ink-3)] tabular-nums">
              {fmtClock(s.punchedInAt)}
              {end && (
                <span className="text-[var(--m-ink-4)]">
                  {" "}
                  → {fmtClock(s.punchedOutAt!)}
                </span>
              )}
              {!end && <span className="text-[var(--m-warn)]"> (open)</span>}
            </span>
            <span className="ml-auto font-medium text-[var(--m-ink)] tabular-nums">
              {humanDuration(s.totalMin)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
function fmtRange(s: string, e: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const a = new Date(s + "T00:00:00").toLocaleDateString(undefined, opts);
  const b = new Date(e + "T00:00:00").toLocaleDateString(undefined, opts);
  return s === e ? a : `${a} – ${b}`;
}
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function pillFor(s: string): string {
  if (s === "approved") return "pill-good";
  if (s === "denied") return "pill-bad";
  if (s === "cancelled") return "pill-slate";
  return "pill-warn";
}

/**
 * Paired desktop devices for this employee.
 *
 * Managers see the list (so they know who's running the agent vs not).
 * Owners additionally get a Revoke button per device — used when a laptop
 * is lost or an employee is being offboarded.
 *
 * Status is computed from the row itself:
 *   - revokedAt set     → "Revoked"
 *   - lastSeenAt < 24h  → "Online"
 *   - lastSeenAt < 7d   → "Idle"
 *   - older             → "Stale"
 *   - never             → "Paired but never reported in"
 */
function DevicesPanel({
  devices,
  orgId,
  membershipId,
  isOwner,
  onChanged,
}: {
  devices: Detail["devices"];
  orgId: number;
  membershipId: number;
  isOwner: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const toast = useToast();

  async function revoke(deviceId: number, label: string) {
    if (
      !confirm(
        `Revoke "${label}"? The agent on that device will stop tracking immediately.`,
      )
    )
      return;
    setBusy(deviceId);
    try {
      const res = await fetch(
        `/api/orgs/${orgId}/members/${membershipId}/devices/${deviceId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "revoke failed");
      }
      toast.push({ kind: "success", title: "Device revoked" });
      await onChanged();
    } catch (e) {
      toast.push({
        kind: "error",
        title: "Revoke failed",
        body: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-[var(--m-border)] bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold text-[var(--m-ink)]">
          Paired devices
          <span className="ml-1.5 text-[var(--m-ink-4)] tabular-nums">
            {devices.filter((d) => !d.revokedAt).length}
          </span>
        </h3>
        {devices.length === 0 && (
          <p className="text-[11.5px] text-[var(--m-ink-3)]">
            Not running the desktop agent yet
          </p>
        )}
      </div>
      {devices.length === 0 ? (
        <p className="text-[12.5px] text-[var(--m-ink-3)]">
          Nothing paired. Ask this teammate to download MARINA from{" "}
          <a
            href="/download"
            className="text-[var(--m-accent)] hover:underline"
          >
            marina.team/download
          </a>{" "}
          and pair using their account.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--m-border-soft)]">
          {devices.map((d) => {
            const status = deviceStatus(d);
            return (
              <li key={d.id} className="py-2.5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-md bg-[var(--m-bg-soft)] inline-flex items-center justify-center shrink-0">
                  <DeviceIcon platform={d.platform} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium text-[var(--m-ink)] truncate">
                    {d.label}
                    <span className="ml-1.5 text-[10.5px] text-[var(--m-ink-4)] font-normal uppercase tracking-wider">
                      {d.platform ?? "unknown"}
                    </span>
                  </p>
                  <p className="text-[11px] text-[var(--m-ink-3)] truncate">
                    {d.agentVersion ? `v${d.agentVersion} · ` : ""}
                    Paired {timeAgo(d.pairedAt)}
                    {d.lastSeenAt
                      ? ` · Last ping ${timeAgo(d.lastSeenAt)}`
                      : ""}
                  </p>
                </div>
                <span
                  className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full shrink-0 ${status.cls}`}
                >
                  {status.label}
                </span>
                {isOwner && !d.revokedAt && (
                  <button
                    type="button"
                    onClick={() => revoke(d.id, d.label)}
                    disabled={busy === d.id}
                    className="text-[11px] font-medium px-2 py-1 rounded-md border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50 transition shrink-0"
                  >
                    {busy === d.id ? "…" : "Revoke"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function DeviceIcon({ platform }: { platform: string | null }) {
  const p = (platform ?? "").toLowerCase();
  if (p.includes("mac") || p.includes("darwin")) {
    return (
      <svg
        width={18}
        height={18}
        viewBox="0 0 384 512"
        fill="currentColor"
        className="text-[var(--m-ink-2)]"
      >
        <path d="M318 268c-1-69 56-103 59-105-32-47-82-53-100-54-43-4-83 25-105 25-22 0-55-25-90-24-46 1-89 27-113 68-48 84-12 207 35 274 23 33 50 70 86 69 35-1 48-22 89-22 41 0 53 22 89 22 37-1 60-34 82-67 26-38 37-75 38-77-1-1-73-28-70-109zM254 80c19-23 32-55 28-87-28 1-62 19-82 41-18 20-34 53-30 84 31 2 63-16 84-38z" />
      </svg>
    );
  }
  if (p.includes("win")) {
    return (
      <svg
        width={18}
        height={18}
        viewBox="0 0 448 512"
        fill="currentColor"
        className="text-[var(--m-ink-2)]"
      >
        <path d="M0 93.7l183-25.2v177.4H0V93.7zm0 324.6l183 25.2V268.4H0v149.9zm203 28L448 480V268H203v178.3zm0-410v177.5h245V32L203 38.3z" />
      </svg>
    );
  }
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className="text-[var(--m-ink-2)]"
    >
      <rect x={3} y={4} width={18} height={12} rx={2} />
      <path d="M8 20h8M12 16v4" strokeLinecap="round" />
    </svg>
  );
}

function deviceStatus(d: Detail["devices"][number]): {
  label: string;
  cls: string;
} {
  if (d.revokedAt)
    return {
      label: "Revoked",
      cls: "bg-rose-50 text-rose-700 border border-rose-200",
    };
  if (!d.lastSeenAt)
    return {
      label: "Pending",
      cls: "bg-[var(--m-bg-soft)] text-[var(--m-ink-2)] border border-[var(--m-border)]",
    };
  const age = Date.now() - new Date(d.lastSeenAt).getTime();
  const day = 24 * 60 * 60 * 1000;
  if (age < day)
    return {
      label: "Online",
      cls: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    };
  if (age < 7 * day)
    return {
      label: "Idle",
      cls: "bg-amber-50 text-amber-700 border border-amber-200",
    };
  return {
    label: "Stale",
    cls: "bg-[var(--m-bg-soft)] text-[var(--m-ink-3)] border border-[var(--m-border)]",
  };
}
