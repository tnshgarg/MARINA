"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTray = createTray;
exports.flashCameraIndicator = flashCameraIndicator;
const electron_1 = require("electron");
const node_path_1 = require("node:path");
const state_1 = require("./state");
const api_1 = require("./api");
const uploader_1 = require("./uploader");
const heartbeat_1 = require("./heartbeat");
const sampler_1 = require("./sampler");
const shotter_1 = require("./shotter");
const config_1 = require("./config");
const pairing_1 = require("./pairing");
const onboarding_1 = require("./onboarding");
const break_1 = require("./break");
const leave_1 = require("./leave");
const punch_1 = require("./punch");
const done_1 = require("./done");
let tray = null;
// 1x1 fully-transparent PNG — Electron requires a real image even when we set
// only the menubar title. We render the visible state via setTitle().
const TRANSPARENT_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
function createTray() {
    let image;
    if (process.platform === 'win32') {
        // Windows shows no menubar title, so it needs a real, visible tray icon —
        // the transparent placeholder would be invisible in the system tray.
        const loaded = electron_1.nativeImage.createFromPath((0, node_path_1.join)(__dirname, '..', 'assets', 'tray.png'));
        image = loaded.isEmpty()
            ? electron_1.nativeImage.createFromBuffer(Buffer.from(TRANSPARENT_PNG_BASE64, 'base64'))
            : loaded.resize({ width: 16, height: 16 });
    }
    else {
        // macOS renders the visible state via setTitle(); a transparent template
        // image keeps the menubar tidy in light + dark mode.
        image = electron_1.nativeImage.createFromBuffer(Buffer.from(TRANSPARENT_PNG_BASE64, 'base64'));
        image.setTemplateImage(true);
    }
    tray = new electron_1.Tray(image);
    tray.setIgnoreDoubleClickEvents(true);
    rebuild();
    state_1.bus.on('change', rebuild);
    // Single-click on the tray icon opens setup if not paired — saves users
    // having to discover the menu. Routes through onboarding so consent is
    // captured before anything is tracked.
    tray.on('click', () => {
        if (!state_1.bus.get().paired) {
            (0, onboarding_1.openOnboardingWindow)();
        }
    });
    return tray;
}
let cameraUntil = 0;
function statusGlyph() {
    const s = state_1.bus.get();
    if (Date.now() < cameraUntil)
        return '◉'; // brief capture indicator
    if (!s.paired)
        return '◌';
    if (s.paused)
        return '⏸';
    if (s.lastError)
        return '!';
    return '●';
}
function flashCameraIndicator(durationMs = 1500) {
    cameraUntil = Date.now() + durationMs;
    // Force a rebuild now and again when the flash ends.
    rebuild();
    setTimeout(() => rebuild(), durationMs + 50);
}
function statusLine() {
    const s = state_1.bus.get();
    if (!s.paired)
        return 'Not paired';
    if (!s.activeShift)
        return 'Off-clock · not punched in';
    if (s.activeBreak) {
        const mins = Math.floor((Date.now() - new Date(s.activeBreak.startedAt).getTime()) / 60000);
        return `On break · ${mins}m`;
    }
    if (s.paused)
        return 'Paused';
    if (s.lastError)
        return s.lastError;
    const shiftMins = Math.floor((Date.now() - new Date(s.activeShift.punchedInAt).getTime()) / 60000);
    const h = Math.floor(shiftMins / 60);
    const m = shiftMins % 60;
    return `Available · ${h}h ${m}m${s.pendingCount > 0 ? ` · ${s.pendingCount} pending` : ''}`;
}
function rebuild() {
    if (!tray)
        return;
    const state = state_1.bus.get();
    // macOS: text title in the menubar. Windows: tooltip on hover.
    if (process.platform === 'darwin') {
        tray.setTitle(`${statusGlyph()} Marina`);
    }
    else {
        tray.setToolTip(`Marina · ${statusLine()}`);
    }
    const items = [
        { label: statusLine(), enabled: false },
    ];
    if (!state.paired) {
        // Top-of-menu setup CTA when not paired so users can never miss it
        items.push({
            label: '✨  Set up Marina…',
            click: () => (0, onboarding_1.openOnboardingWindow)(),
        });
    }
    else if (state.userLogin) {
        items.push({ label: `@${state.userLogin}`, enabled: false });
    }
    items.push({ type: 'separator' });
    if (state.paired) {
        // Punch state — the primary action
        if (!state.activeShift) {
            items.push({
                label: '▶︎  Punch in for today',
                click: () => void (0, punch_1.performPunchIn)(),
            });
        }
        else {
            items.push({
                label: '⏏︎  Punch out…',
                click: () => (0, punch_1.openPunchOutWindow)(),
            });
            items.push({ type: 'separator' });
            if (state.activeBreak) {
                items.push({
                    label: `End break · ${state.activeBreak.reason.slice(0, 40)}${state.activeBreak.reason.length > 40 ? '…' : ''}`,
                    click: () => (0, break_1.openBreakWindow)(),
                });
            }
            else {
                items.push({
                    label: 'Take a break…',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Shift+B' : 'Ctrl+Shift+B',
                    click: () => (0, break_1.openBreakWindow)(),
                });
            }
            // "Mark work as done" — the fast path that puts visible output into the
            // manager's daily digest. Available whenever the user is on the clock.
            items.push({
                label: 'Mark work as done…',
                accelerator: process.platform === 'darwin' ? 'Cmd+Shift+D' : 'Ctrl+Shift+D',
                click: () => (0, done_1.openDoneWindow)(),
            });
        }
        items.push({
            label: 'Request leave…',
            click: () => (0, leave_1.openLeaveWindow)(),
        });
        items.push({ type: 'separator' });
        items.push({
            label: state.paused ? 'Resume tracking' : 'Pause tracking',
            click: () => void togglePause(),
            enabled: !!state.activeShift,
        });
        items.push({
            label: 'Open dashboard',
            click: () => void electron_1.shell.openExternal(`${state.serverBaseUrl}/dashboard`),
        });
        items.push({
            label: 'Open settings',
            click: () => void electron_1.shell.openExternal(`${state.serverBaseUrl}/settings`),
        });
        items.push({ type: 'separator' });
        items.push({
            label: 'Re-pair this device…',
            click: () => (0, pairing_1.openPairingWindow)(),
        });
    }
    items.push({ type: 'separator' });
    items.push({
        label: 'Quit Marina',
        click: async () => {
            await (0, uploader_1.drainOnQuit)();
            electron_1.app.quit();
        },
    });
    tray.setContextMenu(electron_1.Menu.buildFromTemplate(items));
}
async function togglePause() {
    const desired = !state_1.bus.get().paused;
    // Fast local apply for snappy UX.
    state_1.bus.patch({ paused: desired });
    if (desired) {
        (0, sampler_1.stopSampler)({ flush: true });
        (0, shotter_1.stopShotter)();
    }
    else {
        (0, sampler_1.startSampler)();
        // GATEKEPT: screenshot capture is off for now (see config.SCREENSHOTS_ENABLED).
        if (config_1.SCREENSHOTS_ENABLED)
            (0, shotter_1.startShotter)();
    }
    try {
        await (0, api_1.postPause)(desired);
        // Reconcile with the server (covers the race where pause was changed elsewhere).
        void (0, heartbeat_1.pingOnce)();
    }
    catch (err) {
        console.error('togglePause failed', err);
        state_1.bus.patch({ lastError: `pause: ${String(err)}` });
    }
}
//# sourceMappingURL=tray.js.map