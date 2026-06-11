import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Verify a Slack request signature per the public spec:
 *   https://api.slack.com/authentication/verifying-requests-from-slack
 *
 * Pass the raw text body of the request — Slack signs the concatenation of
 * the version, timestamp, and body. If you've already parsed the body to JSON
 * or formdata, recover the raw text first.
 *
 * Returns false on:
 *   - Missing headers
 *   - Timestamp older than 5 minutes (replay protection)
 *   - HMAC mismatch (constant-time compare)
 *   - SLACK_SIGNING_SECRET not configured
 */
export function verifySlackRequest(
  headers: Headers,
  rawBody: string,
): { ok: true } | { ok: false; reason: string } {
  const secret = process.env.SLACK_SIGNING_SECRET
  if (!secret) return { ok: false, reason: 'SLACK_SIGNING_SECRET not configured' }

  const ts = headers.get('x-slack-request-timestamp')
  const sig = headers.get('x-slack-signature')
  if (!ts || !sig) return { ok: false, reason: 'missing signature headers' }

  // Replay protection — reject anything older than 5 minutes.
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - Number(ts)) > 300) {
    return { ok: false, reason: 'timestamp too old' }
  }

  const basestring = `v0:${ts}:${rawBody}`
  const computed = 'v0=' + createHmac('sha256', secret).update(basestring).digest('hex')

  try {
    const sigBuf = Buffer.from(sig)
    const compBuf = Buffer.from(computed)
    if (sigBuf.length !== compBuf.length) {
      return { ok: false, reason: 'signature length mismatch' }
    }
    if (!timingSafeEqual(sigBuf, compBuf)) {
      return { ok: false, reason: 'signature mismatch' }
    }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'verify threw' }
  }
}
