import type { Plan } from '@/lib/db/schema'

/**
 * Plan definitions. Pricing is INR/seat/month; trial defaults to 30 days
 * and only applies to paid tiers (free has no trial — it IS the trial).
 *
 * Seat limits ENFORCED at invite-creation time so an org on Free can't
 * exceed 5 active members. Once they hit the cap, the invite endpoint
 * returns HTTP 402 with `upgradeRequired: true`.
 */

export type PlanConfig = {
  key: Plan
  name: string
  pricePerSeatInr: number
  seatCap: number | null  // null = unlimited (still bounded by paid seats)
  trialDays: number
  monthlyAiBudgetCents: number
  features: {
    teamPulse: boolean
    insights: boolean
    scrumMode: boolean
    googleCalendar: boolean
    indiaHolidays: boolean
    auditExport: boolean
    sso: boolean
    dataResidency: boolean
    dedicatedCsm: boolean
  }
}

export const PLANS: Record<Plan, PlanConfig> = {
  free: {
    key: 'free',
    name: 'Free',
    pricePerSeatInr: 0,
    seatCap: 5,
    trialDays: 0,
    monthlyAiBudgetCents: 1000, // ~$10/month vision budget — enough to test the product
    features: {
      teamPulse: true,
      insights: false,        // unlock at Team
      scrumMode: false,       // unlock at Team
      googleCalendar: true,
      indiaHolidays: true,
      auditExport: false,
      sso: false,
      dataResidency: false,
      dedicatedCsm: false,
    },
  },
  team: {
    key: 'team',
    name: 'Team',
    pricePerSeatInr: 299,
    seatCap: null,
    trialDays: 30,
    monthlyAiBudgetCents: 10000, // $100
    features: {
      teamPulse: true,
      insights: true,
      scrumMode: true,
      googleCalendar: true,
      indiaHolidays: true,
      auditExport: true,
      sso: false,
      dataResidency: false,
      dedicatedCsm: false,
    },
  },
  scale: {
    key: 'scale',
    name: 'Scale',
    pricePerSeatInr: 499,
    seatCap: null,
    trialDays: 30,
    monthlyAiBudgetCents: 50000, // $500
    features: {
      teamPulse: true,
      insights: true,
      scrumMode: true,
      googleCalendar: true,
      indiaHolidays: true,
      auditExport: true,
      sso: true,
      dataResidency: true,
      dedicatedCsm: true,
    },
  },
}

export function planFor(plan: Plan | string | null | undefined): PlanConfig {
  if (plan && plan in PLANS) return PLANS[plan as Plan]
  return PLANS.free
}
