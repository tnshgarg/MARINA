import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireSession } from '@/lib/auth/guards'
import { avatarKey, getBlobStore } from '@/lib/storage/blob'

export const runtime = 'nodejs'
export const maxDuration = 30

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB

/**
 * Upload a custom profile avatar. Replaces the pixel-art character (which
 * stays selectable for users who'd rather stay anonymous). Accepts JPEG /
 * PNG / WebP / GIF up to 2 MB.
 *
 * The image is persisted via the BlobStore and the resulting public URL is
 * written back onto `users.avatarUrl` + `users.image` so every avatar
 * render across the app picks it up automatically.
 */
export async function POST(req: Request) {
  try {
    const session = await requireSession()
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file field required' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Use JPEG, PNG, WebP or GIF.' },
        { status: 400 },
      )
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'File too big — keep avatars under 2 MB.' },
        { status: 400 },
      )
    }

    const ext = extFromMime(file.type) ?? 'jpg'
    const key = avatarKey(session.appUserId, ext)
    const buf = Buffer.from(await file.arrayBuffer())
    const blob = getBlobStore()
    await blob.put(key, buf, file.type)

    // We expose blobs via the /api/uploads/[...key] route so the local
    // driver works without a separate static server, AND so the URL is
    // stable across drivers (a future migration to Vercel Blob doesn't
    // invalidate every avatarUrl in the DB).
    const url = `/api/uploads/${encodeURI(key)}`
    await db
      .update(schema.users)
      .set({ avatarUrl: url, image: url })
      .where(eq(schema.users.id, session.appUserId))

    return NextResponse.json({ ok: true, url })
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error('[uploads/avatar] failed', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

/**
 * Reset the avatar back to the pixel-art character. Doesn't delete the
 * blob (cheap to keep, and helps if the user toggles back), just clears
 * the URL so character rendering wins again.
 */
export async function DELETE() {
  try {
    const session = await requireSession()
    await db
      .update(schema.users)
      .set({ avatarUrl: null, image: null })
      .where(eq(schema.users.id, session.appUserId))
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

function extFromMime(mime: string): string | null {
  switch (mime) {
    case 'image/jpeg': return 'jpg'
    case 'image/png': return 'png'
    case 'image/webp': return 'webp'
    case 'image/gif': return 'gif'
    default: return null
  }
}
