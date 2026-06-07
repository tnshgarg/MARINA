type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const enabled: Record<LogLevel, boolean> = {
  debug: process.env.LOG_LEVEL === 'debug',
  info: process.env.LOG_LEVEL !== 'error',
  warn: true,
  error: true,
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
}

export const log = {
  debug: (m: string, f?: Record<string, unknown>) => emit('debug', m, f),
  info: (m: string, f?: Record<string, unknown>) => emit('info', m, f),
  warn: (m: string, f?: Record<string, unknown>) => emit('warn', m, f),
  error: (m: string, f?: Record<string, unknown>) => emit('error', m, f),
}
