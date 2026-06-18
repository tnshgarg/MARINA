/**
 * Product feature flags.
 *
 * SCREENSHOTS_ENABLED — the screenshot-capture + scene-analysis feature
 * (desktop agent screen captures → OpenAI vision → "scenes"/slacking signals).
 * GATEKEPT OFF for now: it carries privacy and AI-cost risk we don't want in
 * the first release, so we ship a simpler product first and revisit it later.
 *
 * Nothing is deleted — every code path is preserved and simply gated behind
 * this flag (and the full always-on implementation lives on the
 * `feature/screenshots-preserved` git branch). Flip the env var to bring it
 * back: MARINA_SCREENSHOTS_ENABLED=true.
 */
export const SCREENSHOTS_ENABLED = process.env.MARINA_SCREENSHOTS_ENABLED === 'true'
