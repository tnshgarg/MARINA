"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSampler = startSampler;
exports.stopSampler = stopSampler;
exports.snapshotPendingCount = snapshotPendingCount;
const electron_1 = require("electron");
const state_1 = require("./state");
const uploader_1 = require("./uploader");
const store_1 = require("./store");
// Seconds without input before we call the system "idle". Short enough to catch
// real away-time, long enough that a pause to read/think still counts as work —
// this is what makes the logged "working hours" honest.
const IDLE_THRESHOLD_SECONDS = 180;
let sampleTimer = null;
let flushTimer = null;
let windowStart = null;
let buckets = new Map();
let stopped = true;
function startSampler() {
    if (!stopped)
        return;
    stopped = false;
    windowStart = Date.now();
    buckets = new Map();
    scheduleSample();
    scheduleFlush();
    console.log('[sampler] started');
}
function stopSampler(opts = {}) {
    if (stopped)
        return;
    stopped = true;
    if (sampleTimer)
        clearTimeout(sampleTimer);
    if (flushTimer)
        clearTimeout(flushTimer);
    sampleTimer = null;
    flushTimer = null;
    if (opts.flush) {
        closeWindowAndEnqueue();
    }
    else {
        // Discard any in-flight buckets so resumed tracking starts clean.
        buckets.clear();
        windowStart = null;
    }
    console.log('[sampler] stopped (flush:', !!opts.flush, ')');
}
function scheduleSample() {
    const intervalMs = Math.max(5, state_1.bus.get().sampleIntervalSeconds) * 1000;
    sampleTimer = setTimeout(async () => {
        if (stopped)
            return;
        try {
            await tick();
        }
        catch (err) {
            console.error('[sampler] tick failed', err);
            state_1.bus.patch({ lastError: `sampler: ${String(err)}` });
        }
        if (!stopped)
            scheduleSample();
    }, intervalMs);
}
function scheduleFlush() {
    const intervalMs = Math.max(30, state_1.bus.get().flushIntervalSeconds) * 1000;
    flushTimer = setTimeout(() => {
        if (stopped)
            return;
        try {
            closeWindowAndEnqueue();
        }
        catch (err) {
            console.error('[sampler] flush failed', err);
            state_1.bus.patch({ lastError: `flush: ${String(err)}` });
        }
        if (!stopped)
            scheduleFlush();
    }, intervalMs);
}
// Counts consecutive ticks where active-win returned nothing while the user was
// active — the signature of a missing/incompatible native binary (e.g. a Windows
// build packaged on macOS). Surfaced to the UI so the failure isn't silent.
let activeWinMisses = 0;
async function tick() {
    const state = state_1.bus.get();
    if (state.paused)
        return; // belt-and-suspenders: paused agents shouldn't even tick
    const sampleInterval = Math.max(5, state.sampleIntervalSeconds);
    const idleSeconds = safeIdleSeconds();
    let result = null;
    try {
        const { default: activeWin } = await Promise.resolve().then(() => __importStar(require('active-win')));
        result = (await activeWin());
    }
    catch (err) {
        // active-win can fail if accessibility permissions are missing. Surface
        // that to the UI but keep the agent alive — heartbeat still runs.
        state_1.bus.patch({ lastError: `active-win: ${err.message}` });
        result = null;
    }
    // active-win can return null (no throw) when the platform native binary is
    // missing/incompatible — the "everything is Unknown" failure. Flag it after a
    // sustained run of misses while the user is clearly active; reset on success.
    if (result?.owner?.name) {
        activeWinMisses = 0;
    }
    else if (idleSeconds < sampleInterval) {
        activeWinMisses += 1;
        if (activeWinMisses === 12) {
            state_1.bus.patch({ lastError: "Couldn't read the active window on this device — app activity may not be tracked." });
        }
    }
    const appName = (result?.owner?.name ?? 'Unknown').trim() || 'Unknown';
    const title = state.windowTitlesEnabled ? (result?.title ?? '').trim() || null : null;
    // Presence — active (working), idle (on but away), or locked (screen locked).
    // getSystemIdleState handles the locked case the raw idle-seconds can't.
    const presence = safeIdleState(IDLE_THRESHOLD_SECONDS);
    const bucket = buckets.get(appName) ?? {
        activeSeconds: 0,
        idleSeconds: 0,
        lockedSeconds: 0,
        sampleCount: 0,
        lastTitle: null,
    };
    if (presence === 'locked') {
        bucket.lockedSeconds += sampleInterval;
    }
    else if (presence === 'idle') {
        bucket.idleSeconds += sampleInterval;
    }
    else {
        // 'active' or 'unknown' → count as working time.
        bucket.activeSeconds += sampleInterval;
    }
    bucket.sampleCount += 1;
    if (title)
        bucket.lastTitle = title;
    buckets.set(appName, bucket);
}
function safeIdleSeconds() {
    try {
        return electron_1.powerMonitor.getSystemIdleTime();
    }
    catch {
        return 0;
    }
}
function safeIdleState(thresholdSeconds) {
    try {
        return electron_1.powerMonitor.getSystemIdleState(thresholdSeconds);
    }
    catch {
        return 'unknown';
    }
}
function closeWindowAndEnqueue() {
    if (!windowStart || buckets.size === 0) {
        windowStart = Date.now();
        buckets = new Map();
        return;
    }
    const now = Date.now();
    const start = new Date(windowStart).toISOString();
    const end = new Date(now).toISOString();
    const batches = [];
    for (const [app, b] of buckets.entries()) {
        if (b.sampleCount === 0)
            continue;
        batches.push({
            windowStart: start,
            windowEnd: end,
            activeApp: app.slice(0, 128),
            activeSeconds: Math.round(b.activeSeconds),
            idleSeconds: Math.round(b.idleSeconds),
            lockedSeconds: Math.round(b.lockedSeconds),
            sampleCount: b.sampleCount,
            windowTitle: b.lastTitle,
        });
    }
    if (batches.length > 0) {
        (0, uploader_1.enqueueBatches)(batches);
    }
    buckets = new Map();
    windowStart = now;
}
function snapshotPendingCount() {
    return ((0, store_1.get)(store_1.STORE_KEYS.pendingBatches) ?? []).length;
}
//# sourceMappingURL=sampler.js.map