/**
 * Marina's brand mark — an "M" monogram in a deep-green disc with a mint
 * "presence" dot. This is the product logo AND Marina's avatar wherever she's
 * identified (sidebar, morning brief, tour, tooltips, onboarding). Pure inline
 * SVG, so it's crisp at any size and works in server or client components.
 *
 * The API mirrors the retired MarinaOrb (size / className / label) so it's a
 * drop-in replacement. Colours are fixed brand values (the logo doesn't tint).
 */
const GREEN = '#1e4d3a'
const CREAM = '#f4f1ea'
const MINT = '#8ad4a8'

export function MarinaMark({
  size = 36,
  className = '',
  label = 'Marina',
}: {
  size?: number
  className?: string
  /** Accessible label; pass empty string to make it purely decorative. */
  label?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      style={{ display: 'block', flex: 'none' }}
    >
      <circle cx="32" cy="32" r="32" fill={GREEN} />
      <path
        d="M20.5 45 L20.5 20 L32 33 L43.5 20 L43.5 45"
        fill="none"
        stroke={CREAM}
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="39.5" r="3.2" fill={MINT} />
    </svg>
  )
}

/**
 * Marina's living "presence" — the dot from the monogram, pulsing soft mint
 * rings. Use it for AI-activity / loading moments (she's thinking), e.g. the
 * Ask-Marina dock. Animation honours prefers-reduced-motion (see globals.css).
 */
export function MarinaPulse({
  size = 18,
  className = '',
  label = 'Marina is thinking',
}: {
  size?: number
  className?: string
  label?: string
}) {
  return (
    <span
      className={`marina-pulse ${className}`}
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    >
      <span className="marina-pulse-ring" aria-hidden />
      <span className="marina-pulse-ring marina-pulse-ring-2" aria-hidden />
      <span className="marina-pulse-core" aria-hidden />
    </span>
  )
}
