/**
 * India national + major state holidays. Seeded into the `holidays` table per
 * org when the owner toggles their region. We keep a static list rather than
 * fetching from an external API so calendars work offline.
 *
 * Add years as needed.
 */
export type SeedHoliday = { date: string; name: string; region: string }

export const INDIA_HOLIDAYS: SeedHoliday[] = [
  // National holidays — 2025
  { date: '2025-01-26', name: 'Republic Day', region: 'IN' },
  { date: '2025-03-14', name: 'Holi', region: 'IN' },
  { date: '2025-03-31', name: 'Eid al-Fitr', region: 'IN' },
  { date: '2025-04-10', name: 'Mahavir Jayanti', region: 'IN' },
  { date: '2025-04-14', name: 'Ambedkar Jayanti', region: 'IN' },
  { date: '2025-04-18', name: 'Good Friday', region: 'IN' },
  { date: '2025-05-12', name: 'Buddha Purnima', region: 'IN' },
  { date: '2025-06-07', name: 'Eid al-Adha (Bakrid)', region: 'IN' },
  { date: '2025-07-06', name: 'Muharram', region: 'IN' },
  { date: '2025-08-15', name: 'Independence Day', region: 'IN' },
  { date: '2025-08-16', name: 'Janmashtami', region: 'IN' },
  { date: '2025-09-05', name: 'Eid-e-Milad', region: 'IN' },
  { date: '2025-10-02', name: 'Gandhi Jayanti', region: 'IN' },
  { date: '2025-10-02', name: 'Dussehra (Vijayadashami)', region: 'IN' },
  { date: '2025-10-20', name: 'Diwali', region: 'IN' },
  { date: '2025-11-05', name: 'Guru Nanak Jayanti', region: 'IN' },
  { date: '2025-12-25', name: 'Christmas', region: 'IN' },

  // 2026
  { date: '2026-01-26', name: 'Republic Day', region: 'IN' },
  { date: '2026-03-04', name: 'Holi', region: 'IN' },
  { date: '2026-03-20', name: 'Eid al-Fitr', region: 'IN' },
  { date: '2026-04-03', name: 'Good Friday', region: 'IN' },
  { date: '2026-04-14', name: 'Ambedkar Jayanti', region: 'IN' },
  { date: '2026-05-01', name: 'May Day', region: 'IN' },
  { date: '2026-05-27', name: 'Eid al-Adha (Bakrid)', region: 'IN' },
  { date: '2026-08-15', name: 'Independence Day', region: 'IN' },
  { date: '2026-09-05', name: 'Janmashtami', region: 'IN' },
  { date: '2026-10-02', name: 'Gandhi Jayanti', region: 'IN' },
  { date: '2026-11-08', name: 'Diwali', region: 'IN' },
  { date: '2026-11-25', name: 'Guru Nanak Jayanti', region: 'IN' },
  { date: '2026-12-25', name: 'Christmas', region: 'IN' },

  // Karnataka-specific (Bengaluru)
  { date: '2025-11-01', name: 'Kannada Rajyotsava', region: 'IN-KA' },
  { date: '2026-11-01', name: 'Kannada Rajyotsava', region: 'IN-KA' },

  // Maharashtra-specific
  { date: '2025-05-01', name: 'Maharashtra Day', region: 'IN-MH' },
  { date: '2026-05-01', name: 'Maharashtra Day', region: 'IN-MH' },

  // Tamil Nadu
  { date: '2025-01-15', name: 'Pongal', region: 'IN-TN' },
  { date: '2026-01-14', name: 'Pongal', region: 'IN-TN' },

  // Kerala
  { date: '2025-08-26', name: 'Thiru Onam', region: 'IN-KL' },
  { date: '2026-09-13', name: 'Thiru Onam', region: 'IN-KL' },
]

export const INDIA_REGIONS: Array<{ key: string; label: string }> = [
  { key: 'IN', label: 'India (national)' },
  { key: 'IN-KA', label: 'Karnataka (Bengaluru)' },
  { key: 'IN-MH', label: 'Maharashtra (Mumbai)' },
  { key: 'IN-DL', label: 'Delhi NCR' },
  { key: 'IN-TN', label: 'Tamil Nadu (Chennai)' },
  { key: 'IN-KL', label: 'Kerala (Kochi)' },
  { key: 'IN-TG', label: 'Telangana (Hyderabad)' },
  { key: 'IN-WB', label: 'West Bengal (Kolkata)' },
  { key: 'IN-GJ', label: 'Gujarat (Ahmedabad)' },
  { key: 'IN-UP', label: 'Uttar Pradesh' },
]

export function holidaysForRegion(region: string): SeedHoliday[] {
  // Include national + state-specific (if region is IN-XX, also include IN)
  if (region === 'IN') return INDIA_HOLIDAYS.filter((h) => h.region === 'IN')
  return INDIA_HOLIDAYS.filter((h) => h.region === 'IN' || h.region === region)
}
