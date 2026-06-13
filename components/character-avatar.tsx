type Props = {
  /** Kept for backwards compatibility with old call sites — ignored. We no
   * longer render pixel characters. The component is named CharacterAvatar
   * to avoid a 20-file rename; it now produces a photo-or-initials circle. */
  characterKey?: string | null | undefined
  /** Real uploaded photo. Renders this when present. */
  imageUrl?: string | null
  /** Display name used to derive the initials. */
  name?: string | null
  /** Username / login — used as the initials source when `name` is missing.
   * Together with `name`, this means we never render a question mark or an
   * empty avatar: there is always *some* identifier to seed initials from. */
  login?: string | null
  size?: number
  /** Show a subtle ring around the avatar. */
  ring?: boolean
  className?: string
}

/**
 * Real-person avatar.
 *
 * Why this changed: the old version rendered pixelated iconic characters
 * (Spider-Man, Iron Man, etc.) so every employee was a "hero". On a manager's
 * dashboard with 12 people, that turned a working tool into a sticker book —
 * fun for the first week, distracting after that. Worse: managers reported
 * struggling to match cartoon faces to real teammates during 1:1s.
 *
 * The new behaviour:
 *   - If `imageUrl` is set, render the uploaded photo. Encourage this in
 *     onboarding so managers see real faces.
 *   - Otherwise, render the person's INITIALS over a warm tinted background
 *     derived deterministically from their name. Same person → same colour
 *     across the whole product.
 *
 * The component name and prop signature are preserved so we don't have to
 * touch every call site at once; `characterKey` is now ignored.
 */
export function CharacterAvatar({
  imageUrl,
  name,
  login,
  size = 36,
  ring = true,
  className,
}: Props) {
  // Always derive *some* identifier so we never fall through to "?". Real
  // name wins; login is the guaranteed fallback (every user has one).
  const initialSource = (name?.trim() || login?.trim() || '') ?? ''
  if (imageUrl) {
    return (
      <span
        className={`avatar ${ring ? 'avatar-ring' : ''} ${className ?? ''}`}
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          width={size}
          height={size}
          className="rounded-full object-cover"
          style={{ width: size, height: size }}
        />
      </span>
    )
  }

  const initials = deriveInitials(initialSource)
  const { bg, fg } = colorForName(initialSource)

  return (
    <span
      className={`avatar ${ring ? 'avatar-ring' : ''} ${className ?? ''}`}
      style={
        {
          width: size,
          height: size,
          background: bg,
          color: fg,
          ['--ring-color' as string]: bg,
        } as React.CSSProperties
      }
    >
      <span
        style={{
          fontSize: Math.max(11, Math.round(size * 0.42)),
          fontWeight: 600,
          letterSpacing: '-0.01em',
          lineHeight: 1,
        }}
      >
        {initials}
      </span>
    </span>
  )
}

function deriveInitials(source: string | null | undefined): string {
  if (!source) return '·' // we should never hit this; CharacterAvatar always passes name OR login
  // Strip a leading "@" so we don't initialise it as "@".
  const cleaned = source.replace(/^@/, '').trim()
  if (!cleaned) return '·'
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    // Single word — take the first two letters (e.g. "tanish" → "TA").
    return parts[0].slice(0, 2).toUpperCase()
  }
  // First initial of first + last token (e.g. "Anika Roy" → "AR").
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Deterministic warm-palette colour from a name. Same person always gets
 * the same colour so managers learn to associate the swatch with the
 * teammate just as fast as they'd recognise a photo.
 */
function colorForName(name: string | null | undefined): { bg: string; fg: string } {
  if (!name) return { bg: '#f1f5f9', fg: '#475569' }
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  // Pick from a curated palette that matches the MARINA brand (warm cream
  // + sage + clay + gold). Soft backgrounds with darker ink for contrast.
  const palette = [
    { bg: '#e8ede7', fg: '#2f5240' }, // sage soft
    { bg: '#f4ebe3', fg: '#a35e3d' }, // clay soft
    { bg: '#f5ecd4', fg: '#8a6a2d' }, // gold soft
    { bg: '#e3ede5', fg: '#3f6b54' }, // moss soft
    { bg: '#f3dfe0', fg: '#9b3a40' }, // rose soft
    { bg: '#e2ebef', fg: '#3f5d6b' }, // sky soft
    { bg: '#efece5', fg: '#5e6678' }, // cream soft
    { bg: '#e9e2ef', fg: '#5b4382' }, // mauve soft
  ]
  return palette[hash % palette.length]
}
