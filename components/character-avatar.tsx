import { getCharacter } from '@/lib/characters/data'

type Props = {
  characterKey: string | null | undefined
  /** When set, render this image instead of the pixel character. Used by
   * users who uploaded a real photo via /api/uploads/avatar. */
  imageUrl?: string | null
  size?: number
  /** Show a circular ring in the character's brand color */
  ring?: boolean
  className?: string
}

const SHEET_SIZE = 16

export function CharacterAvatar({
  characterKey,
  imageUrl,
  size = 36,
  ring = true,
  className,
}: Props) {
  const character = getCharacter(characterKey)
  const ringColor = character?.color ?? '#cbd5e1'

  const inner = imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt=""
      width={size}
      height={size}
      className="rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  ) : character ? (
    <CharacterSvg character={character} size={size} />
  ) : (
    <FallbackSvg size={size} />
  )

  return (
    <span
      className={`avatar ${ring ? 'avatar-ring' : ''} ${className ?? ''}`}
      style={
        {
          width: size,
          height: size,
          ['--ring-color' as string]: ringColor,
        } as React.CSSProperties
      }
    >
      {inner}
    </span>
  )
}

function CharacterSvg({
  character,
  size,
}: {
  character: NonNullable<ReturnType<typeof getCharacter>>
  size: number
}) {
  const palette = character.palette
  const rects: React.ReactNode[] = []
  for (let y = 0; y < SHEET_SIZE; y++) {
    const row = character.grid[y]
    for (let x = 0; x < SHEET_SIZE; x++) {
      const ch = row[x]
      if (ch === '.' || !palette[ch]) continue
      rects.push(
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={palette[ch]} />
      )
    }
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${SHEET_SIZE} ${SHEET_SIZE}`}
      style={{ imageRendering: 'pixelated', display: 'block', background: '#f8fafc' }}
      role="img"
      aria-label={character.name}
    >
      {rects}
    </svg>
  )
}

function FallbackSvg({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${SHEET_SIZE} ${SHEET_SIZE}`}
      style={{ imageRendering: 'pixelated', display: 'block', background: '#f1f5f9' }}
      role="img"
      aria-label="No hero"
    >
      <rect x={5} y={4} width={6} height={6} fill="#94a3b8" />
      <rect x={3} y={10} width={10} height={4} fill="#cbd5e1" />
    </svg>
  )
}
