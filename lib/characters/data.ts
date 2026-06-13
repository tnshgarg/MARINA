/**
 * Character roster has been retired.
 *
 * We used to ship a 50-strong pixel-art roster of fictional-icon-inspired
 * avatars so every employee could pick a "hero". It turned a working tool
 * into a sticker book and made it harder for managers to match names to
 * faces during 1:1s. The new model is: encourage real photo upload, fall
 * back to deterministic initials (see components/character-avatar.tsx).
 *
 * This file is kept as a stub so existing call sites that import
 * `getCharacter()` keep type-checking. All exports return null/empty so
 * the downstream `?? me.name ?? me.login` fallbacks naturally take over.
 *
 * When you're touching code in a feature surface, prefer:
 *   - Drop the `getCharacter(...)` call entirely
 *   - Use `<CharacterAvatar imageUrl={user.image} name={user.name} />`
 *   - Display the person's `name ?? \`@${login}\`` everywhere we used to
 *     show `character?.name`
 */
export type CharacterKey = string

export type Character = {
  key: CharacterKey
  name: string
  color: string
  palette: Record<string, string>
  grid: string[]
}

/** Empty roster — character pick is gone. */
export const CHARACTERS: Character[] = []

/** Always returns null. Kept so type-check passes at old call sites. */
export function getCharacter(_key: string | null | undefined): Character | null {
  return null
}

/** Kept as a typeguard stub; nothing is a character key any more. */
export function isCharacterKey(_key: string): _key is CharacterKey {
  return false
}
