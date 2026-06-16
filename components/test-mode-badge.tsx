'use client'

/**
 * A small, always-visible marker shown only when test mode is on
 * (`NEXT_PUBLIC_MARINA_TEST_MODE=true`). Makes it unmistakable that the data on
 * screen is seeded demo data, not real. Renders nothing in production.
 */
export function TestModeBadge() {
  if (process.env.NEXT_PUBLIC_MARINA_TEST_MODE !== 'true') return null
  return (
    <div className="fixed bottom-3 left-3 z-[200] pointer-events-none select-none">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 text-white text-[10.5px] font-semibold px-2.5 py-1 shadow-lg uppercase tracking-wide">
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" aria-hidden />
        Test mode · demo data
      </span>
    </div>
  )
}
