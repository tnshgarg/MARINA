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
    // Defence against traversal. The old version only `_`-replaced odd
    // characters but left `.` and `/` intact, so `avatars/../../etc/passwd`
    // sailed straight through. Now we (1) strip control/odd chars, (2)
    // normalize the path to collapse `..` segments, (3) strip any leading
    // `../` that survived, then (4) hard-assert the resolved absolute path
    // stays inside the storage root. Anything that escapes throws.
    const cleaned = key.replace(/[^a-zA-Z0-9/_.\-]/g, '_')
    const normalized = path.normalize(cleaned).replace(/^(\.\.(\/|\\|$))+/, '')
    const rootAbs = path.resolve(this.root)
    const fullAbs = path.resolve(rootAbs, normalized)
    if (fullAbs !== rootAbs && !fullAbs.startsWith(rootAbs + path.sep)) {
      throw new Error('blob key escapes storage root')
    }
    return fullAbs
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

/** Storage key for a user's profile avatar. Versioned with a timestamp so
 * browser caches don't pin the old image after a re-upload. */
export function avatarKey(userId: number, ext: string): string {
  return `avatars/u${userId}/${Date.now()}.${ext}`
}

/** Storage key for an org's logo. Versioned for the same reason. */
export function orgLogoKey(orgId: number, ext: string): string {
  return `org-logos/o${orgId}/${Date.now()}.${ext}`
}

/**
 * Validate an uploaded image by its MAGIC BYTES, not the client-supplied
 * Content-Type (which an attacker fully controls). Returns the canonical
 * `{ mime, ext }` derived from the actual bytes, or null if the buffer isn't
 * one of our four raster formats.
 *
 * SVG is intentionally unsupported: it has no reliable binary signature and
 * is active content (it can embed <script>), so it was the stored-XSS vector.
 * We only accept raster formats the browser can't execute.
 */
export function sniffImage(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length < 12) return null
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' }
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' }
  }
  // GIF: "GIF87a" / "GIF89a"
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return { mime: 'image/gif', ext: 'gif' }
  }
  // WebP: "RIFF"...."WEBP"
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: 'webp' }
  }
  return null
}
