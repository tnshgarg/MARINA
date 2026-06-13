"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const config_1 = require("./config");
const store_1 = require("./store");
const state_1 = require("./state");
const tray_1 = require("./tray");
const uploader_1 = require("./uploader");
const sampler_1 = require("./sampler");
const shotter_1 = require("./shotter");
const heartbeat_1 = require("./heartbeat");
const consent_1 = require("./consent");
const pairing_1 = require("./pairing");
const break_1 = require("./break");
const leave_1 = require("./leave");
const punch_1 = require("./punch");
const done_1 = require("./done");
const notifications_1 = require("./notifications");
// Single-instance lock — second launch focuses any open pairing/consent window.
const got = electron_1.app.requestSingleInstanceLock();
if (!got) {
    electron_1.app.quit();
}
electron_1.app.on('second-instance', () => {
    // Bring something interactive to the front if a window is open.
    // No-op otherwise — the agent is a menubar app.
});
// macOS: prevent the dock icon entirely. (Also handled via LSUIElement in plist.)
// Windows: nothing to hide — tray-only by virtue of never creating a frame window.
if (process.platform === 'darwin' && electron_1.app.dock && typeof electron_1.app.dock.hide === 'function') {
    electron_1.app.dock.hide();
}
electron_1.app.on('window-all-closed', () => {
    // Keep the app alive when all windows close; tray is the only UI.
    // (Default behavior on macOS is to keep running; we add this to be explicit
    // and to ensure platforms other than macOS also keep the tray active.)
});
let isQuitting = false;
electron_1.app.on('before-quit', async (e) => {
    if (isQuitting)
        return;
    isQuitting = true;
    e.preventDefault();
    try {
        (0, shotter_1.stopShotter)();
        (0, sampler_1.stopSampler)({ flush: true });
        await (0, uploader_1.drainOnQuit)();
    }
    finally {
        (0, notifications_1.stopNotifications)();
        (0, heartbeat_1.stopHeartbeat)();
        (0, uploader_1.stopUploader)();
        electron_1.app.exit(0);
    }
});
electron_1.app.whenReady().then(async () => {
    console.log('marina-agent', config_1.AGENT_VERSION, 'starting');
    // Auto-launch at login (off in dev — only persist for packaged builds).
    if (electron_1.app.isPackaged) {
        electron_1.app.setLoginItemSettings({
            openAtLogin: true,
            openAsHidden: true,
        });
    }
    // Seed state from store.
    const storedServer = (0, store_1.get)(config_1.STORE_KEYS.serverBaseUrl) ?? config_1.DEFAULT_SERVER_BASE_URL;
    state_1.bus.patch({
        serverBaseUrl: storedServer,
        paused: (0, store_1.get)(config_1.STORE_KEYS.paused) ?? false,
        windowTitlesEnabled: (0, store_1.get)(config_1.STORE_KEYS.windowTitlesEnabled) ?? false,
        sampleIntervalSeconds: (0, store_1.get)(config_1.STORE_KEYS.sampleIntervalSeconds) ?? 30,
        flushIntervalSeconds: (0, store_1.get)(config_1.STORE_KEYS.flushIntervalSeconds) ?? 300,
        userLogin: (0, store_1.get)(config_1.STORE_KEYS.userLogin) ?? null,
    });
    (0, consent_1.registerConsentIpc)();
    (0, break_1.registerBreakIpc)();
    (0, leave_1.registerLeaveIpc)();
    (0, punch_1.registerPunchIpc)();
    (0, done_1.registerDoneIpc)();
    (0, pairing_1.registerPairingIpc)(() => {
        // Once paired, start the always-on services. Tracking (sampler+shotter)
        // only starts when the user punches in — heartbeat will turn it on.
        (0, heartbeat_1.startHeartbeat)();
        (0, uploader_1.startUploader)();
        (0, notifications_1.startNotifications)();
    });
    // Always create the tray first so the user has UI even before consent finishes.
    (0, tray_1.createTray)();
    // Global keyboard shortcuts — these stay registered as long as the agent
    // is running, regardless of which app is focused. The shortcut hints in
    // the tray menu (`accelerator` field) only describe these, they do NOT
    // register them — `globalShortcut.register()` is the source of truth.
    //
    // Mac uses Cmd+Shift+<key>, Windows/Linux uses Ctrl+Shift+<key>. We pick
    // letters that don't collide with anything common in IDEs or browsers.
    const mod = process.platform === 'darwin' ? 'Cmd' : 'Ctrl';
    try {
        electron_1.globalShortcut.register(`${mod}+Shift+D`, () => (0, done_1.openDoneWindow)());
        electron_1.globalShortcut.register(`${mod}+Shift+B`, () => (0, break_1.openBreakWindow)());
    }
    catch (err) {
        console.error('globalShortcut.register failed', err);
    }
    electron_1.app.on('will-quit', () => {
        electron_1.globalShortcut.unregisterAll();
    });
    // First-run consent gate.
    if (!(0, consent_1.hasConsented)()) {
        const accepted = await (0, consent_1.showConsentWindow)();
        if (!accepted) {
            electron_1.app.quit();
            return;
        }
    }
    // If we already have a valid token, start the always-on services.
    // Heartbeat will start/stop the sampler+shotter based on punch state.
    const token = (0, store_1.readToken)();
    if (token) {
        state_1.bus.patch({ paired: true });
        (0, heartbeat_1.startHeartbeat)();
        (0, uploader_1.startUploader)();
        (0, notifications_1.startNotifications)();
        await (0, heartbeat_1.pingOnce)(); // initial state sync — heartbeat reconciles tracking
    }
    else {
        // First-run / unpaired: open the pairing window immediately and surface a
        // notification — on a menubar-only macOS app, users sometimes miss the
        // pairing window even with focus tricks.
        (0, pairing_1.openPairingWindow)();
        try {
            const n = new electron_1.Notification({
                title: 'Welcome to MARINA',
                body: 'Pair this device to your team. Click the MARINA icon in the menu bar if you don\'t see the pairing window.',
            });
            n.show();
        }
        catch {
            // Notifications may not be available in all dev environments
        }
    }
});
//# sourceMappingURL=index.js.map