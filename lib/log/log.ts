type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const enabled: Record<LogLevel, boolean> = {
  debug: process.env.LOG_LEVEL === 'debug',
  info: process.env.LOG_LEVEL !== 'error',
  warn: true,
  error: true,
}

/**
 * Lazy Sentry binding. If the host installs `@sentry/nextjs` and the SDK
 * registers its global hub, we'll forward errors to it. If not, we fall back
 * to JSON-to-stdout (which Vercel ships to its log drain).
 *
 * To enable Sentry:
 *   1. `pnpm add @sentry/nextjs`
 *   2. Set NEXT_PUBLIC_SENTRY_DSN
 *   3. `npx @sentry/wizard@latest -i nextjs`
 */
type SentryShape = {
  captureException?: (err: unknown, ctx?: Record<string, unknown>) => void
  captureMessage?: (msg: string, ctx?: Record<string, unknown>) => void
}
let sentryCache: SentryShape | null = null
async function getSentry(): Promise<SentryShape> {
  if (sentryCache) return sentryCache
  try {
    // Optional dep — TypeScript should tolerate a missing module here. The
    // dynamic-import spec returns a Promise; if @sentry/nextjs isn't installed
    // the catch arm coerces to an empty shape and we never call it.
    const mod = (await (
      import(/* @vite-ignore */ /* webpackIgnore: true */ '@sentry/nextjs' as string).catch(() => null)
    )) as SentryShape | null
    sentryCache = mod ?? {}
    return sentryCache
  } catch {
    sentryCache = {}
    return sentryCache
  }
}

function emit(level: LogLevel, message: string, fields: Record<string, unknown> = {}): void {
  if (!enabled[level]) return
  const payload = {
    level,
    msg: message,
    t: new Date().toISOString(),
    ...fields,
  }
  // eslint-disable-next-line no-console
  console[level === 'debug' ? 'log' : level](JSON.stringify(payload))

  // Best-effort Sentry forwarding for errors. Async load; ignore if absent.
  if (level === 'error') {
    void getSentry().then((s) => {
      if (!s) return
      const err = fields.err
      if (err instanceof Error && s.captureException) {
        s.captureException(err, { extra: { message, ...fields } })
      } else if (s.captureMessage) {
        s.captureMessage(`[${message}] ${typeof err === 'string' ? err : ''}`, {
          extra: { ...fields },
        })
      }
    })
  }
}

export const log = {
  debug: (m: string, f?: Record<string, unknown>) => emit('debug', m, f),
  info: (m: string, f?: Record<string, unknown>) => emit('info', m, f),
  warn: (m: string, f?: Record<string, unknown>) => emit('warn', m, f),
  error: (m: string, f?: Record<string, unknown>) => emit('error', m, f),
}
