import { desktopCapturer, nativeImage, screen } from 'electron'
import { authedPost } from './api'
import { bus } from './state'
import { flashCameraIndicator } from './tray'

type ActiveWinResult = {
  owner?: { name?: string; bundleId?: string }
  title?: string
} | null

const VIDEO_CALL_BUNDLES = new Set([
  'us.zoom.xos', // Zoom
  'us.zoom.ZoomWorkplace',
  'com.microsoft.teams',
  'com.microsoft.teams2',
  'com.apple.FaceTime',
  'com.cisco.webexmeetingsapp',
  'com.skype.skype',
  'com.bluejeans.MeetingsForMac',
])

const VIDEO_CALL_NAMES = [
  /\bzoom\b/i,
  /\bteams?\b/i,
  /\bfacetime\b/i,
  /\bwebex\b/i,
  /\bbluejeans\b/i,
  /\bgoog(le)?\s*meet\b/i,
]

let stopped = true
let nextTimers: NodeJS.Timeout[] = []
let hourlyTimer: NodeJS.Timeout | null = null

const TARGET_PER_HOUR = 3
const ALLOWED_PER_HOUR = 4 // hard cap

export function startShotter(): void {
  if (!stopped) return
  stopped = false
  // Plan captures for the remainder of the current hour, then re-plan each hour.
  scheduleForCurrentHour()
  hourlyTimer = setInterval(scheduleForCurrentHour, 60 * 60 * 1000)
  console.log('[shotter] started')
}

export function stopShotter(): void {
  if (stopped) return
  stopped = true
  clearAllTimers()
  console.log('[shotter] stopped')
}

function clearAllTimers(): void {
  for (const t of nextTimers) clearTimeout(t)
  nextTimers = []
  if (hourlyTimer) clearInterval(hourlyTimer)
  hourlyTimer = null
}

function scheduleForCurrentHour(): void {
  if (stopped) return
  // Drop any pre-existing timers from prior calls; we recompute fresh each hour.
  for (const t of nextTimers) clearTimeout(t)
  nextTimers = []

  const now = Date.now()
  const hourMs = 60 * 60 * 1000
  const hourStart = Math.floor(now / hourMs) * hourMs
  const hourEnd = hourStart + hourMs
  const msLeft = hourEnd - now
  if (msLeft < 60_000) return // negligible — next call from setInterval covers it

  // Random number of captures in [TARGET_PER_HOUR-1, TARGET_PER_HOUR+1], proportional to hour-left.
  const fraction = msLeft / hourMs
  const target = Math.max(1, Math.round(TARGET_PER_HOUR * fraction))
  const desired = Math.min(ALLOWED_PER_HOUR, target + (Math.random() < 0.3 ? 1 : 0))

  for (let i = 0; i < desired; i++) {
    const fireIn = Math.floor(Math.random() * msLeft)
    const t = setTimeout(() => attemptCapture(), fireIn)
    nextTimers.push(t)
  }
  console.log(`[shotter] scheduled ${desired} captures in next ${Math.round(msLeft / 60000)}m`)
}

async function attemptCapture(): Promise<void> {
  if (stopped) return
  const state = bus.get()
  if (!state.paired || state.paused) return

  // Foreground app check — skip during likely video calls.
  let active: ActiveWinResult = null
  try {
    const mod = await import('active-win')
    active = (await mod.default()) as ActiveWinResult
  } catch (err) {
    bus.patch({ lastError: `active-win: ${(err as Error).message}` })
  }
  if (isVideoCall(active)) {
    console.log('[shotter] skipping — video call foreground')
    return
  }

  // Capture screen → 1280-wide JPEG.
  let jpeg: Buffer
  try {
    jpeg = await captureJpeg()
  } catch (err) {
    bus.patch({ lastError: `capture: ${(err as Error).message}` })
    return
  }
  if (jpeg.byteLength === 0) return

  // Camera-glyph flash — UX disclosure that something just happened.
  flashCameraIndicator()

  try {
    await authedPost('/api/agent/screenshots', {
      capturedAt: new Date().toISOString(),
      displayIndex: 0,
      jpegBase64: jpeg.toString('base64'),
    })
    bus.patch({ lastError: null })
  } catch (err) {
    bus.patch({ lastError: `shot upload: ${(err as Error).message}` })
  }
}

function isVideoCall(result: ActiveWinResult): boolean {
  if (!result) return false
  const bundle = result.owner?.bundleId ?? ''
  const name = result.owner?.name ?? ''
  if (bundle && VIDEO_CALL_BUNDLES.has(bundle)) return true
  for (const re of VIDEO_CALL_NAMES) {
    if (re.test(name)) return true
  }
  return false
}

/**
 * Capture a screenshot covering every connected display.
 *
 * Background: a lot of engineers work with two monitors. Capturing only the
 * primary display means the secondary monitor — where editor / browser / chat
 * often live — never makes it into the activity record. That's bad data AND
 * bad faith: we should show ALL of the user's workspace or none of it.
 *
 * Strategy:
 *   1. Pull a thumbnail per `desktopCapturer` screen source. Electron returns
 *      one source per display in `screen.getAllDisplays()` order.
 *   2. Resize each to a max width of 1024 so a 3-monitor stitch stays under
 *      ~3200px wide and the resulting JPEG stays under ~250 KB.
 *   3. Lay them out horizontally onto a single canvas via `nativeImage` and
 *      raw bitmap composition.
 *
 * The web app already accepts a single JPEG — by stitching here we keep the
 * upload pipeline identical and the storage cost predictable.
 *
 * If there's only one display, this collapses to the original behaviour.
 */
async function captureJpeg(): Promise<Buffer> {
  const displays = screen.getAllDisplays()
  const perDisplayWidth = displays.length > 1 ? 1024 : 1280

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: perDisplayWidth, height: Math.round(perDisplayWidth * 0.7) },
    fetchWindowIcons: false,
  })
  if (sources.length === 0) {
    throw new Error('no screen sources available')
  }

  // Single display — fast path keeps the old behaviour.
  if (sources.length === 1) {
    const img = sources[0].thumbnail
    if (img.isEmpty()) {
      throw new Error('empty thumbnail (missing screen recording permission?)')
    }
    const resized = img.getSize().width > perDisplayWidth ? img.resize({ width: perDisplayWidth }) : img
    return resized.toJPEG(70)
  }

  // Multi-display — composite a horizontal strip via PNG round-tripping. We
  // build a wide nativeImage from concatenated PNGs by drawing each thumbnail
  // onto a Buffer-backed canvas. Electron has no native compose API, so we
  // assemble raw RGBA buffers, then encode the result as JPEG.
  const thumbs = sources
    .map((s) => s.thumbnail)
    .filter((img) => !img.isEmpty())
    .map((img) => (img.getSize().width > perDisplayWidth ? img.resize({ width: perDisplayWidth }) : img))

  if (thumbs.length === 0) {
    throw new Error('all displays returned empty thumbnails (missing screen recording permission?)')
  }

  // Normalise to the tallest height so the strip is rectangular.
  const stripHeight = Math.max(...thumbs.map((t) => t.getSize().height))
  const stripWidth = thumbs.reduce((acc, t) => acc + t.getSize().width, 0)
  const bytesPerPixel = 4
  const strip = Buffer.alloc(stripWidth * stripHeight * bytesPerPixel, 0xff)

  let xOffset = 0
  for (const thumb of thumbs) {
    const { width, height } = thumb.getSize()
    const src = thumb.toBitmap() // BGRA, row-major
    // Copy row-by-row into the strip buffer.
    for (let y = 0; y < height; y++) {
      const srcStart = y * width * bytesPerPixel
      const dstStart = (y * stripWidth + xOffset) * bytesPerPixel
      src.copy(strip, dstStart, srcStart, srcStart + width * bytesPerPixel)
    }
    xOffset += width
  }

  const composed = nativeImage.createFromBuffer(strip, { width: stripWidth, height: stripHeight })
  return composed.toJPEG(70)
}
