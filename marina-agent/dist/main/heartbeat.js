"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pingOnce = pingOnce;
exports.startHeartbeat = startHeartbeat;
exports.stopHeartbeat = stopHeartbeat;
exports.reconcileTrackingNow = reconcileTrackingNow;
const api_1 = require("./api");
const store_1 = require("./store");
const state_1 = require("./state");
const sampler_1 = require("./sampler");
const shotter_1 = require("./shotter");
let timer = null;
/**
 * Tracking is gated by BOTH punch state and pause:
 *   tracking = activeShift !== null && !paused
 * This function reconciles after each heartbeat.
 */
function reconcileTracking() {
    const s = state_1.bus.get();
    const shouldTrack = !!s.activeShift && !s.paused;
    if (shouldTrack) {
        (0, sampler_1.startSampler)();
        (0, shotter_1.startShotter)();
    }
    else {
        (0, sampler_1.stopSampler)({ flush: true });
        (0, shotter_1.stopShotter)();
    }
}
async function pingOnce() {
    try {
        const res = await (0, api_1.postHeartbeat)();
        state_1.bus.patch({
            paused: !!res.pausedAt,
            windowTitlesEnabled: res.windowTitlesEnabled,
            sampleIntervalSeconds: res.sampleIntervalSeconds,
            flushIntervalSeconds: res.flushIntervalSeconds,
            primaryOrgId: res.primaryOrgId,
            activeBreak: res.activeBreak,
            activeShift: res.activeShift,
            lastHeartbeatAt: new Date(),
            lastError: null,
        });
        (0, store_1.set)(store_1.STORE_KEYS.paused, !!res.pausedAt);
        (0, store_1.set)(store_1.STORE_KEYS.windowTitlesEnabled, res.windowTitlesEnabled);
        (0, store_1.set)(store_1.STORE_KEYS.sampleIntervalSeconds, res.sampleIntervalSeconds);
        (0, store_1.set)(store_1.STORE_KEYS.flushIntervalSeconds, res.flushIntervalSeconds);
        reconcileTracking();
    }
    catch (err) {
        const e = err;
        if (e.status === 401) {
            state_1.bus.patch({ paired: false, lastError: 'token revoked' });
            (0, sampler_1.stopSampler)();
            (0, shotter_1.stopShotter)();
            return;
        }
        state_1.bus.patch({ lastError: `heartbeat: ${e.message}` });
    }
}
function startHeartbeat() {
    if (timer)
        return;
    void pingOnce();
    timer = setInterval(() => {
        void pingOnce();
    }, 60_000);
}
function stopHeartbeat() {
    if (timer)
        clearInterval(timer);
    timer = null;
}
/** Called by punch + pause + break flows to instantly reconcile tracking. */
function reconcileTrackingNow() {
    reconcileTracking();
}
//# sourceMappingURL=heartbeat.js.map