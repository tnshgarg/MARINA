"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startNotifications = startNotifications;
exports.stopNotifications = stopNotifications;
const electron_1 = require("electron");
const state_1 = require("./state");
const pairing_1 = require("./pairing");
const punch_1 = require("./punch");
const break_1 = require("./break");
// Last fire time per notification kind. Throttles are set generously so we
// never become annoying.
const lastFired = new Map();
const THROTTLES = {
    unpaired_reminder: 5 * 60 * 1000, // every 5 min while unpaired
    punch_in_morning: 60 * 60 * 1000, // hourly until punched in
    forgot_punch_out: 30 * 60 * 1000, // every 30 min after expected punch-out
    idle_take_break: 45 * 60 * 1000, // every 45 min while idle on shift
    long_break_reminder: 30 * 60 * 1000, // every 30 min while a break is open
};
function canFire(kind) {
    const last = lastFired.get(kind) ?? 0;
    if (Date.now() - last >= THROTTLES[kind]) {
        lastFired.set(kind, Date.now());
        return true;
    }
    return false;
}
function notify(opts) {
    try {
        const n = new electron_1.Notification({
            title: opts.title,
            body: opts.body,
            silent: false,
        });
        if (opts.onClick) {
            n.on('click', opts.onClick);
        }
        n.show();
    }
    catch (err) {
        console.warn('[notifications] show failed', err);
    }
}
/**
 * Tick once per minute. Decide which (if any) nudge applies right now.
 *
 * Conditions:
 * - Unpaired: nudge every 5 min "click the menubar icon"
 * - Past 9 AM, no active shift, paired: "Good morning, punch in?"  (hourly)
 * - Past 7 PM, active shift still open: "Forgot to punch out?" (every 30 min)
 * - Idle > 15 min during active shift, no break, no meeting app: "Are you on a break?" (45 min throttle)
 * - Active break > 30 min: "Still on break? Resume when you're back." (30 min)
 */
function tick() {
    const s = state_1.bus.get();
    const now = new Date();
    const hour = now.getHours();
    // Unpaired reminder
    if (!s.paired) {
        if (canFire('unpaired_reminder')) {
            notify({
                title: 'MARINA · Pair this device',
                body: 'Click the MARINA icon in your menu bar to finish setup.',
                onClick: () => (0, pairing_1.openPairingWindow)(),
            });
        }
        return;
    }
    // Past 9 AM, no active shift → morning punch in suggestion
    if (!s.activeShift && hour >= 9 && hour < 11) {
        if (canFire('punch_in_morning')) {
            notify({
                title: 'Good morning ☀️',
                body: 'Ready to start your shift? Tap to punch in.',
                onClick: () => void (0, punch_1.performPunchIn)(),
            });
        }
        return;
    }
    // Active shift but it's after-hours — forgot to punch out
    if (s.activeShift && (hour >= 19 || hour < 5)) {
        if (canFire('forgot_punch_out')) {
            notify({
                title: 'Still punched in 🕖',
                body: "It's after hours. Don't forget to punch out before signing off.",
                onClick: () => (0, punch_1.openPunchOutWindow)(),
            });
        }
        return;
    }
    // Idle for a long stretch during active shift, not on break → "Are you on a break?"
    if (s.activeShift && !s.activeBreak && !s.paused) {
        const idleSec = safeIdleSeconds();
        if (idleSec >= 15 * 60 && canFire('idle_take_break')) {
            notify({
                title: 'Are you on a break? ☕',
                body: 'You\'ve been idle for 15+ minutes. Log it as a break — your manager sees only the reason.',
                onClick: () => (0, break_1.openBreakWindow)(),
            });
        }
    }
    // Long-running break (> 30 min)
    if (s.activeBreak) {
        const breakDurationMs = Date.now() - new Date(s.activeBreak.startedAt).getTime();
        if (breakDurationMs > 30 * 60 * 1000 && canFire('long_break_reminder')) {
            notify({
                title: 'Still on break?',
                body: `Your break has been running for ${Math.floor(breakDurationMs / 60000)} minutes. Tap to end it when you're back.`,
                onClick: () => (0, break_1.openBreakWindow)(),
            });
        }
    }
}
function safeIdleSeconds() {
    try {
        return electron_1.powerMonitor.getSystemIdleTime();
    }
    catch {
        return 0;
    }
}
let timer = null;
function startNotifications() {
    if (timer)
        return;
    // First tick in 30s to give the app time to fully boot, then every 60s.
    setTimeout(() => {
        tick();
        timer = setInterval(tick, 60_000);
    }, 30_000);
}
function stopNotifications() {
    if (timer)
        clearInterval(timer);
    timer = null;
}
// suppress unused-import on shell when we don't need it (yet — reserved for future "Open dashboard" notifs)
void electron_1.shell;
//# sourceMappingURL=notifications.js.map