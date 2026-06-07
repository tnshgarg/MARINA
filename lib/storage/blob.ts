import { existsSync } from 'fs'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import path from 'path'

export type BlobDriver = 'local' | 'vercel_blob'

export type BlobPutResult = {
  key: string
  size: number
  driver: BlobDriver
}

export interface BlobStore {
  driver: BlobDriver
  put(key: string, body: Buffer, contentType: string): Promise<BlobPutResult>
  get(key: string): Promise<Buffer | null>
  delete(key: string): Promise<void>
}

class LocalBlobStore implements BlobStore {
  driver: BlobDriver = 'local'
  constructor(private root: string) {}

  private resolve(key: string): string {
    // Defence against traversal.
    const safe = key.replace(/[^a-zA-Z0-9/_.\-]/g, '_')
    return path.join(this.root, safe)
  }

  async put(key: string, body: Buffer): Promise<BlobPutResult> {
    const fullPath = this.resolve(key)
    await mkdir(path.dirname(fullPath), { recursive: true })
    await writeFile(fullPath, body)
    return { key, size: body.byteLength, driver: this.driver }
  }

  async get(key: string): Promise<Buffer | null> {
    const fullPath = this.resolve(key)
    if (!existsSync(fullPath)) return null
    return readFile(fullPath)
  }

  async delete(key: string): Promise<void> {
    const fullPath = this.resolve(key)
    if (!existsSync(fullPath)) return
    await rm(fullPath, { force: true })
  }
}

class VercelBlobStore implements BlobStore {
  driver: BlobDriver = 'vercel_blob'

  async put(key: string, body: Buffer, contentType: string): Promise<BlobPutResult> {
    const { put } = await import('@vercel/blob')
    const res = await put(key, body, {
      access: 'public',
      contentType,
      addRandomSuffix: false,
      // The token is read from BLOB_READ_WRITE_TOKEN env var automatically.
    })
    return { key: res.url, size: body.byteLength, driver: this.driver }
  }

  async get(key: string): Promise<Buffer | null> {
    // For vercel-blob we treat the stored "key" as the public URL.
    try {
      const res = await fetch(key)
      if (!res.ok) return null
      return Buffer.from(await res.arrayBuffer())
    } catch {
      return null
    }
  }

  async delete(key: string): Promise<void> {
    const { del } = await import('@vercel/blob')
    try {
      await del(key)
    } catch (err) {
      console.error('vercel-blob delete failed', err)
    }
  }
}

let cached: BlobStore | null = null

export function getBlobStore(): BlobStore {
  if (cached) return cached
  const driver = (process.env.BLOB_DRIVER ?? 'local').toLowerCase() as BlobDriver
  if (driver === 'vercel_blob') {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.warn('[storage] BLOB_DRIVER=vercel_blob but BLOB_READ_WRITE_TOKEN is unset — calls will fail until configured')
    }
    cached = new VercelBlobStore()
  } else {
    const root = process.env.LOCAL_BLOB_ROOT ?? path.resolve(process.cwd(), '.marina-storage')
    cached = new LocalBlobStore(root)
  }
  return cached
}

export function shotKey(userId: number, capturedAt: Date, ext = 'jpg'): string {
  const iso = capturedAt.toISOString()
  const y = iso.slice(0, 4)
  const m = iso.slice(5, 7)
  const d = iso.slice(8, 10)
  const safeIso = iso.replace(/[:.]/g, '-')
  return `shots/${y}/${m}/${d}/u${userId}/${safeIso}.${ext}`
}
