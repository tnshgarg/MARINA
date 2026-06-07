import { CharacterAvatar } from './character-avatar'
import { getCharacter } from '@/lib/characters/data'

type Props = {
  characterKey: string | null | undefined
  photoUrl?: string | null
  /** When 'photo' and a photoUrl is present, render the real photo. Else fall back to the hero. */
  mode?: 'hero' | 'photo'
  size?: number
  ring?: boolean
  className?: string
}

/**
 * Renders the correct avatar for a user, honouring the org's avatarMode setting.
 * When mode='photo' and the user has a photo URL we show that; otherwise we
 * always show the pixel hero (the user explicitly picked one — never an empty
 * placeholder once they've onboarded).
 */
export function UserAvatar({
  characterKey,
  photoUrl,
  mode = 'hero',
  size = 36,
  ring = true,
  className,
}: Props) {
  const character = getCharacter(characterKey)
  const ringColor = character?.color ?? '#cbd5e1'

  if (mode === 'photo' && photoUrl) {
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt={character?.name ?? 'avatar'}
          width={size}
          height={size}
          className="rounded-full block object-cover"
          style={{ width: size, height: size }}
        />
      </span>
    )
  }

  return (
    <CharacterAvatar
      characterKey={characterKey}
      size={size}
      ring={ring}
      className={className}
    />
  )
}
