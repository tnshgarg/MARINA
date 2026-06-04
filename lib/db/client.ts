import { neon } from '@neondatabase/serverless'
import { drizzle, NeonHttpDatabase } from 'drizzle-orm/neon-http'
import * as schema from './schema'

let _db: NeonHttpDatabase<typeof schema> | null = null

function getDb(): NeonHttpDatabase<typeof schema> {
  if (_db) return _db
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  const sql = neon(connectionString)
  _db = drizzle(sql, { schema })
  return _db
}

export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, prop) {
    const target = getDb() as unknown as Record<string | symbol, unknown>
    const value = target[prop]
    if (typeof value === 'function') return value.bind(target)
    return value
  },
})

export { schema }
