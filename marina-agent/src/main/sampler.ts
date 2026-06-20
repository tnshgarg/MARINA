import { powerMonitor } from 'electron'
import { bus } from './state'
import { enqueueBatches } from './uploader'
import { STORE_KEYS, get } from './store'
import type { PendingBatch } from './store'
import { getActiveWindow, type ActiveWindowInfo } from './active-window'

type AppBucket = {
  activeSeconds: number
  idleSeconds: number
  lockedSeconds: number
  sampleCount: number
  lastTitle: string | null
}

// Seconds without input before we call the system "idle". Short enough to catch
// real away-time, long enough that a pause to read/think still counts as work —
// this is what makes the logged "working hours" honest.
const IDLE_THRESHOLD_SECONDS = 180

let sampleTimer: NodeJS.Timeout | null = null
let flushTimer: NodeJS.Timeout | null = null
let windowStart: number | null = null
let buckets = new Map<string, AppBucket>()
let stopped = true

export function startSampler(): void {
  if (!stopped) return
  stopped = false
  windowStart = Date.now()
  buckets = new Map()
  scheduleSample()
  scheduleFlush()
  console.log('[sampler] started')
}

export function stopSampler(opts: { flush?: boolean } = {}): void {
  if (stopped) return
  stopped = true
  if (sampleTimer) clearTimeout(sampleTimer)
  if (flushTimer) clearTimeout(flushTimer)
  sampleTimer = null
  flushTimer = null
  if (opts.flush) {
    closeWindowAndEnqueue()
  } else {
    // Discard any in-flight buckets so resumed tracking starts clean.
    buckets.clear()
    windowStart = null
  }
  console.log('[sampler] stopped (flush:', !!opts.flush, ')')
}

function scheduleSample(): void {
  const intervalMs = Math.max(5, bus.get().sampleIntervalSeconds) * 1000
  sampleTimer = setTimeout(async () => {
    if (stopped) return
    try {
      await tick()
    } catch (err) {
      console.error('[sampler] tick failed', err)
      bus.patch({ lastError: `sampler: ${String(err)}` })
    }
    if (!stopped) scheduleSample()
  }, intervalMs)
}

function scheduleFlush(): void {
  const intervalMs = Math.max(30, bus.get().flushIntervalSeconds) * 1000
  flushTimer = setTimeout(() => {
    if (stopped) return
    try {
      closeWindowAndEnqueue()
    } catch (err) {
      console.error('[sampler] flush failed', err)
      bus.patch({ lastError: `flush: ${String(err)}` })
    }
    if (!stopped) scheduleFlush()
  }, intervalMs)
}

// Counts consecutive ticks where active-win returned nothing while the user was
// active — the signature of a missing/incompatible native binary (e.g. a Windows
// build packaged on macOS). Surfaced to the UI so the failure isn't silent.
let activeWinMisses = 0

async function tick(): Promise<void> {
  const state = bus.get()
  if (state.paused) return // belt-and-suspenders: paused agents shouldn't even tick

  const sampleInterval = Math.max(5, state.sampleIntervalSeconds)

  const idleSeconds = safeIdleSeconds()
  let win: ActiveWindowInfo = null
  try {
    win = await getActiveWindow(state.windowTitlesEnabled)
  } catch (err) {
    // e.g. macOS Accessibility not granted. Surface it but keep the agent alive.
    bus.patch({ lastError: `active-window: ${(err as Error).message}` })
    win = null
  }

  // Reading the foreground window can return nothing (no throw) — flag it after a
  // sustained run of misses while the user is clearly active; reset on success.
  if (win?.app) {
    activeWinMisses = 0
  } else if (idleSeconds < sampleInterval) {
    activeWinMisses += 1
    if (activeWinMisses === 12) {
      bus.patch({ lastError: "Couldn't read the active window on this device — app activity may not be tracked." })
    }
  }

  const appName = (win?.app ?? 'Unknown').trim() || 'Unknown'
  const title = state.windowTitlesEnabled ? (win?.title ?? '').trim() || null : null

  // Presence — active (working), idle (on but away), or locked (screen locked).
  // getSystemIdleState handles the locked case the raw idle-seconds can't.
  const presence = safeIdleState(IDLE_THRESHOLD_SECONDS)

  const bucket = buckets.get(appName) ?? {
    activeSeconds: 0,
    idleSeconds: 0,
    lockedSeconds: 0,
    sampleCount: 0,
    lastTitle: null,
  }
  if (presence === 'locked') {
    bucket.lockedSeconds += sampleInterval
  } else if (presence === 'idle') {
    bucket.idleSeconds += sampleInterval
  } else {
    // 'active' or 'unknown' → count as working time.
    bucket.activeSeconds += sampleInterval
  }
  bucket.sampleCount += 1
  if (title) bucket.lastTitle = title
  buckets.set(appName, bucket)
}

function safeIdleSeconds(): number {
  try {
    return powerMonitor.getSystemIdleTime()
  } catch {
    return 0
  }
}

function safeIdleState(thresholdSeconds: number): 'active' | 'idle' | 'locked' | 'unknown' {
  try {
    return powerMonitor.getSystemIdleState(thresholdSeconds)
  } catch {
    return 'unknown'
  }
}

function closeWindowAndEnqueue(): void {
  if (!windowStart || buckets.size === 0) {
    windowStart = Date.now()
    buckets = new Map()
    return
  }
  const now = Date.now()
  const start = new Date(windowStart).toISOString()
  const end = new Date(now).toISOString()

  const batches: PendingBatch[] = []
  for (const [app, b] of buckets.entries()) {
    if (b.sampleCount === 0) continue
    batches.push({
      windowStart: start,
      windowEnd: end,
      activeApp: app.slice(0, 128),
      activeSeconds: Math.round(b.activeSeconds),
      idleSeconds: Math.round(b.idleSeconds),
      lockedSeconds: Math.round(b.lockedSeconds),
      sampleCount: b.sampleCount,
      windowTitle: b.lastTitle,
    })
  }

  if (batches.length > 0) {
    enqueueBatches(batches)
  }

  buckets = new Map()
  windowStart = now
}

export function snapshotPendingCount(): number {
  return (get(STORE_KEYS.pendingBatches) ?? []).length
}
