import { postHeartbeat, ApiError } from './api'
import { STORE_KEYS, set } from './store'
import { bus } from './state'
import { startSampler, stopSampler } from './sampler'
import { startShotter, stopShotter } from './shotter'
import { SCREENSHOTS_ENABLED } from './config'

let timer: NodeJS.Timeout | null = null

/**
 * Tracking is gated by BOTH punch state and pause:
 *   tracking = activeShift !== null && !paused
 * This function reconciles after each heartbeat.
 */
function reconcileTracking(): void {
  const s = bus.get()
  const shouldTrack = !!s.activeShift && !s.paused
  if (shouldTrack) {
    startSampler()
    // GATEKEPT: screenshot capture is off for now. The shotter is never started
    // while SCREENSHOTS_ENABLED is false; flip the flag to bring it back.
    if (SCREENSHOTS_ENABLED) startShotter()
  } else {
    stopSampler({ flush: true })
    stopShotter()
  }
}

export async function pingOnce(): Promise<void> {
  try {
    const res = await postHeartbeat()
    bus.patch({
      paused: !!res.pausedAt,
      windowTitlesEnabled: res.windowTitlesEnabled,
      sampleIntervalSeconds: res.sampleIntervalSeconds,
      flushIntervalSeconds: res.flushIntervalSeconds,
      primaryOrgId: res.primaryOrgId,
      activeBreak: res.activeBreak,
      activeShift: res.activeShift,
      lastHeartbeatAt: new Date(),
      lastError: null,
    })
    set(STORE_KEYS.paused, !!res.pausedAt)
    set(STORE_KEYS.windowTitlesEnabled, res.windowTitlesEnabled)
    set(STORE_KEYS.sampleIntervalSeconds, res.sampleIntervalSeconds)
    set(STORE_KEYS.flushIntervalSeconds, res.flushIntervalSeconds)

    reconcileTracking()
  } catch (err) {
    const e = err as ApiError
    if (e.status === 401) {
      bus.patch({ paired: false, lastError: 'token revoked' })
      stopSampler()
      stopShotter()
      return
    }
    bus.patch({ lastError: `heartbeat: ${e.message}` })
  }
}

export function startHeartbeat(): void {
  if (timer) return
  void pingOnce()
  timer = setInterval(() => {
    void pingOnce()
  }, 60_000)
}

export function stopHeartbeat(): void {
  if (timer) clearInterval(timer)
  timer = null
}

/** Called by punch + pause + break flows to instantly reconcile tracking. */
export function reconcileTrackingNow(): void {
  reconcileTracking()
}
