"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPairing = runPairing;
exports.openPairingWindow = openPairingWindow;
exports.registerPairingIpc = registerPairingIpc;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const api_1 = require("./api");
const config_1 = require("./config");
const store_1 = require("./store");
const state_1 = require("./state");
const window_utils_1 = require("./window-utils");
let pairingWindow = null;
// The "start always-on services once paired" callback, registered by
// registerPairingIpc(). Stored at module scope so BOTH the standalone pairing
// window and the onboarding flow trigger the same post-pair startup via
// runPairing() — there's exactly one place that knows how to bring the agent
// to life after a successful pair.
let onPairedCb = null;
/**
 * Normalise input, call the server, persist the token + config, flip state,
 * and fire the post-pair startup. Shared by the pairing window IPC handler and
 * the onboarding flow so the logic can never drift between the two entry points.
 */
async function runPairing(payload) {
    const serverBaseUrl = (payload.serverBaseUrl ?? '').trim().replace(/\/+$/, '');
    const code = (payload.code ?? '').trim().toUpperCase().replace(/[^A-Z2-9]/g, '');
    const label = (payload.label ?? config_1.DEFAULT_DEVICE_LABEL).trim().slice(0, 80) || config_1.DEFAULT_DEVICE_LABEL;
    if (!/^https?:\/\//i.test(serverBaseUrl)) {
        return { ok: false, error: 'Server URL must start with http:// or https://' };
    }
    if (code.length !== 8) {
        return { ok: false, error: 'Code must be exactly 8 characters' };
    }
    try {
        const res = await (0, api_1.completePairing)({ serverBaseUrl, code, label });
        (0, store_1.writeToken)(res.token);
        (0, store_1.set)(config_1.STORE_KEYS.serverBaseUrl, serverBaseUrl);
        (0, store_1.set)(config_1.STORE_KEYS.deviceId, res.device.id);
        (0, store_1.set)(config_1.STORE_KEYS.userLogin, res.user.login);
        (0, store_1.set)(config_1.STORE_KEYS.userName, res.user.name ?? null);
        (0, store_1.set)(config_1.STORE_KEYS.sampleIntervalSeconds, res.config.sampleIntervalSeconds);
        (0, store_1.set)(config_1.STORE_KEYS.flushIntervalSeconds, res.config.flushIntervalSeconds);
        (0, store_1.set)(config_1.STORE_KEYS.windowTitlesEnabled, res.config.windowTitlesEnabled);
        (0, store_1.set)(config_1.STORE_KEYS.paused, false);
        state_1.bus.patch({
            paired: true,
            paused: false,
            windowTitlesEnabled: res.config.windowTitlesEnabled,
            sampleIntervalSeconds: res.config.sampleIntervalSeconds,
            flushIntervalSeconds: res.config.flushIntervalSeconds,
            userLogin: res.user.login,
            serverBaseUrl,
            lastError: null,
        });
        onPairedCb?.(res.user.login);
        return { ok: true, login: res.user.login };
    }
    catch (err) {
        // Surface the server's friendly error (e.g. "invalid or expired code")
        // rather than the raw "410 /api/agent/pair/complete". Network failures
        // (status 0 — usually a wrong/unreachable server URL) keep their
        // "network: …" message so a bad URL is obvious.
        let msg;
        if (err instanceof api_1.ApiError) {
            const bodyErr = err.body && typeof err.body === 'object' && 'error' in err.body
                ? String(err.body.error)
                : null;
            msg = bodyErr ? `${bodyErr}${err.status ? ` (${err.status})` : ''}` : err.message;
        }
        else {
            msg = err instanceof Error ? err.message : String(err);
        }
        return { ok: false, error: msg };
    }
}
function openPairingWindow() {
    if (pairingWindow) {
        (0, window_utils_1.bringToFront)(pairingWindow);
        return;
    }
    pairingWindow = new electron_1.BrowserWindow({
        width: 480,
        height: 480,
        title: 'Pair this device',
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        show: false,
        alwaysOnTop: true,
        center: true,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload-pairing.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });
    pairingWindow.removeMenu();
    pairingWindow.loadFile(path_1.default.join(__dirname, '..', 'renderer', 'pairing.html'));
    pairingWindow.once('ready-to-show', () => {
        if (pairingWindow)
            (0, window_utils_1.bringToFront)(pairingWindow);
    });
    pairingWindow.on('closed', () => {
        pairingWindow = null;
        (0, window_utils_1.hideDockIfIdle)();
    });
}
function registerPairingIpc(onPaired) {
    // Remember how to start services post-pair; runPairing() invokes this for
    // both the pairing window AND the onboarding flow.
    onPairedCb = onPaired;
    electron_1.ipcMain.handle('marina:pairing:defaults', () => ({
        serverBaseUrl: (0, store_1.get)(config_1.STORE_KEYS.serverBaseUrl) ?? config_1.DEFAULT_SERVER_BASE_URL,
        label: config_1.DEFAULT_DEVICE_LABEL,
    }));
    electron_1.ipcMain.handle('marina:pairing:submit', async (_e, payload) => {
        const res = await runPairing(payload);
        if (res.ok)
            pairingWindow?.close();
        return res;
    });
    electron_1.ipcMain.handle('marina:pairing:cancel', () => {
        pairingWindow?.close();
        return true;
    });
}
//# sourceMappingURL=pairing.js.map