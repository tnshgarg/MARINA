import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db/client'
import { HttpError, requireCapability } from '@/lib/auth/guards'
import { getBlobStore, orgLogoKey } from '@/lib/storage/blob'

export const runtime = 'nodejs'
export const maxDuration = 30

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
const MAX_BYTES = 3 * 1024 * 1024 // 3 MB

/**
 * Upload an org logo. SVG accepted (great for crisp rendering at every
 * sidebar size); PNG / WebP / JPEG too. Up to 3 MB.
 *
 * Gated on `manage_workspace` so only owners and explicitly granted
 * managers can replace the brand mark for their workspace.
 *
 * Body shape: multipart/form-data with `file` AND `orgId` fields. We take
 * orgId from the form (not the URL) because this endpoint sits under the
 * generic `/api/uploads/*` namespace.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const orgIdRaw = form.get('orgId')
    const orgId = Number(orgIdRaw)
    if (!Number.isInteger(orgId)) {
      return NextResponse.json({ error: 'orgId required' }, { status: 400 })
    }
    await requireCapability(orgId, 'manage_workspace')

    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file field required' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Use SVG, PNG, JPEG or WebP.' },
        { status: 400 },
      )
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'File too big — keep logos under 3 MB.' },
        { status: 400 },
      )
    }

    const ext = extFromMime(file.type) ?? 'png'
    const key = orgLogoKey(orgId, ext)
    const buf = Buffer.from(await file.arrayBuffer())
    const blob = getBlobStore()
    await blob.put(key, buf, file.type)

    const url = `/api/uploads/${encodeURI(key)}`
    await db.update(schema.orgs).set({ logoUrl: url }).where(eq(schema.orgs.id, orgId))

    return NextResponse.json({ ok: true, url })
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error('[uploads/org-logo] failed', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

function extFromMime(mime: string): string | null {
  switch (mime) {
    case 'image/jpeg': return 'jpg'
    case 'image/png': return 'png'
    case 'image/webp': return 'webp'
    case 'image/svg+xml': return 'svg'
    default: return null
  }
}
