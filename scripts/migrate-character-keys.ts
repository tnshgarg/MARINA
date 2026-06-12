/**
 * One-shot data migration for the character-key roster swap.
 *
 * The roster moved from Marvel-named characters (iron_man, spider_man, …)
 * to legal-safe legendary archetypes (navigator, sentinel, …). Existing
 * users in production still have the OLD keys on their `users.character_key`
 * row — without this migration their avatar would render as a blank.
 *
 * Mapping picks the closest archetype for each prior name. Run once after
 * deploying the new roster:
 *
 *   pnpm tsx --env-file=.env scripts/migrate-character-keys.ts
 *
 * Idempotent — safe to re-run; rows already on a new key are skipped.
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'

// Two waves of renames live in this table:
//
//   1. The ORIGINAL Marvel-named keys → iconic-inspired re-roll
//      (iron_man → iron_knight, spider_man → web_crawler, …)
//   2. The intermediate "legendary archetype" pass that briefly existed
//      between the two (navigator → iron_knight, sentinel → web_crawler, …).
//
// Re-running this script is idempotent: rows already on a new key are
// skipped because they don't appear as keys in this map.
const REMAP: Record<string, string> = {
  // Original Marvel-named keys
  iron_man: 'iron_knight',
  spider_man: 'web_crawler',
  captain: 'star_captain',
  thor: 'thunder_lord',
  hulk: 'behemoth',
  widow: 'spy',
  strange: 'sorcerer',
  wolverine: 'berserker',
  panther: 'panther_king',
  deadpool: 'mercenary',
  // Intermediate legendary archetype keys
  navigator: 'iron_knight',
  sentinel: 'web_crawler',
  smith: 'star_captain',
  oracle: 'thunder_lord',
  scholar: 'behemoth',
  ranger: 'spy',
  astronomer: 'sorcerer',
  bard: 'berserker',
  alchemist: 'panther_king',
  pilot: 'mercenary',
  mariner: 'pirate',
  artisan: 'scarlet_hex',
}

async function main() {
  const rows = await db.select({ id: schema.users.id, key: schema.users.characterKey }).from(schema.users)
  let migrated = 0
  let skipped = 0
  for (const r of rows) {
    if (!r.key) {
      skipped++
      continue
    }
    const next = REMAP[r.key]
    if (!next) {
      skipped++
      continue
    }
    await db.update(schema.users).set({ characterKey: next }).where(eq(schema.users.id, r.id))
    migrated++
  }
  console.log(`[migrate-character-keys] done — migrated ${migrated}, skipped ${skipped}`)
}

main().catch((err) => {
  console.error('[migrate-character-keys] failed:', err)
  process.exit(1)
})
