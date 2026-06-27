import React from 'react'

/**
 * Renders text with @mentions highlighted in green so it's obvious someone was
 * tagged. Used in standup updates and the discussion thread.
 */
export function MentionText({ text }: { text: string }) {
  const parts = text.split(/(@[\w][\w.\-]*)/g)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('@') ? (
          <span key={i} className="font-semibold text-[var(--m-good)]">
            {p}
          </span>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </>
  )
}
