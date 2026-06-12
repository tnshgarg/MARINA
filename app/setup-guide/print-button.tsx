'use client'

/**
 * Print → Save as PDF trigger. Server component imports this so the
 * setup-guide page stays mostly static and only this tiny island ships
 * client-side JS.
 */
export default function SetupGuidePrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="px-3.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-700 text-white text-[12.5px] font-medium transition"
    >
      Download as PDF
    </button>
  )
}
