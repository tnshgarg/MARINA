import { after as nextAfter } from 'next/server'

/**
 * Run a side effect *after* the HTTP response has been flushed. Unlike a bare
 * `void promise()` in serverless, `after()` keeps the function container alive
 * until the promise settles. Use this for notifications, audit log writes,
 * story generation triggers, and any other work that:
 *
 *   1. Must not block the user-facing response, but
 *   2. Must actually finish running.
 *
 * `void` in Vercel = silent failure 50% of the time. Switch to this.
 *
 * The wrapper also catches and logs errors so they don't crash the runtime,
 * because by definition the response has already gone out and the user can't
 * see anything anyway.
 *
 * Usage:
 *   afterResponse(() => notify({...}), 'leave-decided notify')
 *   afterResponse(async () => { await buildStory(userId) }, 'punch-out story')
 */
export function afterResponse(work: () => void | Promise<unknown>, label: string): void {
  nextAfter(async () => {
    try {
      await work()
    } catch (err) {
      console.error(`[after:${label}] failed`, err)
    }
  })
}
