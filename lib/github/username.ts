/**
 * Normalise + validate a GitHub username as typed by a human.
 *
 * Accepts a bare handle ("octocat"), an @-prefixed one ("@octocat"), or a full
 * profile URL ("https://github.com/octocat") and returns the canonical
 * lowercased login — GitHub usernames are case-insensitive, and storing them
 * lowercased keeps attribution matching simple.
 *
 * GitHub's own rule: 1–39 chars, alphanumeric or single hyphens, may not begin
 * or end with a hyphen and may not contain consecutive hyphens.
 *
 * Returns null when the input is empty or not a valid username.
 */
const GITHUB_USERNAME_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i

export function normalizeGithubUsername(input: string | null | undefined): string | null {
  if (!input) return null
  let s = input.trim()
  if (!s) return null
  // Strip a profile URL down to the path's first segment.
  const urlMatch = s.match(/^https?:\/\/(?:www\.)?github\.com\/([^/?#]+)/i)
  if (urlMatch) s = urlMatch[1]!
  // Strip a leading @ (and any surrounding whitespace already trimmed).
  s = s.replace(/^@+/, '').trim()
  if (!GITHUB_USERNAME_RE.test(s)) return null
  return s.toLowerCase()
}
