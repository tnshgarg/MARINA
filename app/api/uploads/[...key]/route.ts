import { NextResponse } from 'next/server'
import { getBlobStore } from '@/lib/storage/blob'

export const runtime = 'nodejs'

/**
 * Read-through for blob keys. Required for the local driver (which writes
 * to `.marina-storage/` outside the Next.js public folder) and harmless
 * for the Vercel Blob driver because uploaded URLs go straight to the CDN
 * and the DB never points back at this route.
 *
 * Any blob key under `avatars/` or `org-logos/` is fair game — we
 * deliberately don't gate on auth so manager dashboards can render avatars
 * without juggling session cookies for every <img>.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ key: string[] }> },
) {
  const { key } = await ctx.params
  const rawKey = key.join('/')
  // Only serve known prefixes — avoids accidental exposure of any other
  // private blob the app might add later (screenshots etc).
  if (
    !rawKey.startsWith('avatars/') &&
    !rawKey.startsWith('org-logos/')
  ) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  const blob = getBlobStore()
  const buf = await blob.get(rawKey)
  if (!buf) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const contentType = guessContentType(rawKey)
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  })
}

function guessContentType(key: string): string {
  if (key.endsWith('.svg')) return 'image/svg+xml'
  if (key.endsWith('.png')) return 'image/png'
  if (key.endsWith('.webp')) return 'image/webp'
  if (key.endsWith('.gif')) return 'image/gif'
  return 'image/jpeg'
}
