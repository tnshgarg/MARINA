import type { Role } from '@/lib/db/schema'

/**
 * Capability registry. Each capability is a fine-grained permission flag.
 * Code that gates a destructive or sensitive action checks the capability
 * — not the role directly — so we can give a specific manager owner-like
 * powers without promoting them.
 */
export type Capability =
  | 'manage_billing'        // change plan, view invoices, manage payment
  | 'manage_members'        // invite, remove, edit role/discipline
  | 'manage_integrations'   // configure Slack / GitHub allowlist / etc.
  | 'manage_workspace'      // org name, holidays, workday hours
  | 'view_all_data'         // see every employee's drilldown (HR-grade)
  | 'view_reports_only'     // only see direct + indirect reports (manager)
  | 'decide_leaves'         // approve / deny leave requests
  | 'schedule_meetings'     // create 1:1s on others' calendars
  | 'manage_celebrations'   // edit birthday / joining date of others
  | 'export_data'           // CSV/PDF exports of attendance, shifts, etc.

export const ALL_CAPABILITIES: Capability[] = [
  'manage_billing',
  'manage_members',
  'manage_integrations',
  'manage_workspace',
  'view_all_data',
  'view_reports_only',
  'decide_leaves',
  'schedule_meetings',
  'manage_celebrations',
  'export_data',
]

export const CAPABILITY_LABEL: Record<Capability, string> = {
  manage_billing:       'Manage billing & plan',
  manage_members:       'Invite & manage members',
  manage_integrations:  'Configure integrations',
  manage_workspace:     'Edit workspace settings',
  view_all_data:        'See everyone\'s data',
  view_reports_only:    'See direct reports only',
  decide_leaves:        'Approve / deny leaves',
  schedule_meetings:    'Schedule meetings for others',
  manage_celebrations:  'Edit birthdays & joining dates',
  export_data:          'Export reports',
}

/** Default capabilities granted by each base role. Admins always implicitly hold ALL. */
const BASE_CAPS_BY_ROLE: Record<Role, Capability[]> = {
  admin: ALL_CAPABILITIES,
  manager: [
    'manage_members',
    'view_reports_only',
    'decide_leaves',
    'schedule_meetings',
    'export_data',
  ],
  lead: ['view_reports_only', 'schedule_meetings'],
  member: [],
}

/**
 * Resolve the full capability set for a membership = base role caps ∪ extra
 * caps explicitly granted. Owners always have everything.
 */
export function capabilitiesFor(role: Role, extraCaps: string[] = []): Set<Capability> {
  const base = BASE_CAPS_BY_ROLE[role] ?? []
  const set = new Set<Capability>(base)
  for (const e of extraCaps) {
    if ((ALL_CAPABILITIES as string[]).includes(e)) {
      set.add(e as Capability)
    }
  }
  return set
}

/** Convenience guard. */
export function hasCap(
  role: Role,
  extraCaps: string[] | undefined | null,
  cap: Capability,
): boolean {
  return capabilitiesFor(role, extraCaps ?? []).has(cap)
}
