import { SectionTabs, type SectionTab } from '@/components/section-tabs'

/**
 * Section-tab definitions per consolidated sidebar item. Keeping them in one
 * place so the tab order, labels, and route prefixes can't drift across pages.
 */

export function PeopleTabs({ orgId }: { orgId: number }) {
  const tabs: SectionTab[] = [
    { key: 'members',    label: 'Members',    href: `/org/${orgId}/members`,    matchPrefix: `/org/${orgId}/members`    },
    { key: 'shifts',     label: 'Shifts',     href: `/org/${orgId}/shifts`,     matchPrefix: `/org/${orgId}/shifts`     },
    { key: 'attendance', label: 'Attendance', href: `/org/${orgId}/attendance`, matchPrefix: `/org/${orgId}/attendance` },
  ]
  return <SectionTabs tabs={tabs} />
}

export function ActivityTabs({ orgId }: { orgId: number }) {
  const tabs: SectionTab[] = [
    { key: 'feed',     label: 'Feed',     href: `/org/${orgId}/activity`, matchPrefix: `/org/${orgId}/activity` },
    { key: 'insights', label: 'Insights', href: `/org/${orgId}/insights`, matchPrefix: `/org/${orgId}/insights` },
  ]
  return <SectionTabs tabs={tabs} />
}

export function SettingsTabs({ orgId }: { orgId: number }) {
  const tabs: SectionTab[] = [
    { key: 'workspace', label: 'Workspace', href: `/org/${orgId}/settings`, matchPrefix: `/org/${orgId}/settings` },
    { key: 'profile',   label: 'Profile',   href: `/settings`,              matchPrefix: `/settings`              },
  ]
  return <SectionTabs tabs={tabs} />
}
