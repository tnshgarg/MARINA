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
  // Defence-in-depth against traversal: reject any segment containing `..`
  // or a backslash before it ever reaches the blob store. (blob.resolve also
  // hard-asserts containment, but we fail fast + uniformly here.)
  if (rawKey.includes('..') || rawKey.includes('\\') || rawKey.includes('\0')) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  // Only serve known prefixes — avoids accidental exposure of any other
  // private blob the app might add later (screenshots etc).
  if (
    !rawKey.startsWith('avatars/') &&
    !rawKey.startsWith('org-logos/')
  ) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  const blob = getBlobStore()
  let buf: Buffer | null = null
  try {
    buf = await blob.get(rawKey)
  } catch {
    // resolve() throws if the key escapes the storage root.
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  if (!buf) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const isSvg = rawKey.endsWith('.svg')
  const contentType = guessContentType(rawKey)
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, immutable',
      // Stop the browser from MIME-sniffing an upload into something
      // executable, and sandbox any active content.
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      // SVGs are active content (can embed <script>). We no longer accept new
      // SVG uploads, but any legacy blob is forced to download rather than
      // render inline so it can't run script in our origin.
      ...(isSvg ? { 'Content-Disposition': 'attachment' } : {}),
    },
  })
}

function guessContentType(key: string): string {
  // SVG intentionally NOT served as image/svg+xml — see the attachment header
  // above. Treat it as plain text so a direct hit can't execute.
  if (key.endsWith('.svg')) return 'text/plain; charset=utf-8'
  if (key.endsWith('.png')) return 'image/png'
  if (key.endsWith('.webp')) return 'image/webp'
  if (key.endsWith('.gif')) return 'image/gif'
  return 'image/jpeg'
}
