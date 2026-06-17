"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openOnboardingWindow = openOnboardingWindow;
exports.closeOnboardingWindow = closeOnboardingWindow;
exports.registerOnboardingIpc = registerOnboardingIpc;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const config_1 = require("./config");
const store_1 = require("./store");
const state_1 = require("./state");
const consent_1 = require("./consent");
const pairing_1 = require("./pairing");
const window_utils_1 = require("./window-utils");
/**
 * First-run onboarding — the single, guided experience that welcomes a new
 * employee, explains what Marina does, captures consent, pairs the device, and
 * shows how to drive the menu-bar agent. It replaces the old two-window
 * (consent → pair) hop with one polished flow.
 *
 * Consent is a hard gate: every "not paired" entry point routes here, so the
 * agent can never begin tracking before the privacy step is accepted. The
 * standalone pairing window is only used to RE-pair an already-onboarded
 * device (which is, by definition, already consented).
 */
let onboardingWindow = null;
function openOnboardingWindow() {
    if (onboardingWindow) {
        (0, window_utils_1.bringToFront)(onboardingWindow);
        return;
    }
    onboardingWindow = new electron_1.BrowserWindow({
        width: 760,
        height: 660,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        show: false,
        center: true,
        backgroundColor: '#f8f6f1',
        title: 'Welcome to Marina',
        // hiddenInset keeps the macOS traffic lights (so the window is closable)
        // while letting our HTML own the chrome for an Arc-style look. The HTML
        // provides a drag strip up top.
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload-onboarding.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });
    onboardingWindow.removeMenu();
    onboardingWindow.loadFile(path_1.default.join(__dirname, '..', 'renderer', 'onboarding.html'));
    onboardingWindow.once('ready-to-show', () => {
        if (onboardingWindow)
            (0, window_utils_1.bringToFront)(onboardingWindow);
    });
    onboardingWindow.on('closed', () => {
        onboardingWindow = null;
        (0, window_utils_1.hideDockIfIdle)();
    });
}
function closeOnboardingWindow() {
    onboardingWindow?.close();
}
function registerOnboardingIpc() {
    electron_1.ipcMain.handle('marina:onboarding:defaults', () => ({
        serverBaseUrl: (0, store_1.get)(config_1.STORE_KEYS.serverBaseUrl) ?? config_1.DEFAULT_SERVER_BASE_URL,
        label: config_1.DEFAULT_DEVICE_LABEL,
        version: config_1.AGENT_VERSION,
        alreadyConsented: (0, consent_1.hasConsented)(),
        alreadyPaired: !!(0, store_1.readToken)(),
        userLogin: state_1.bus.get().userLogin,
    }));
    electron_1.ipcMain.handle('marina:onboarding:consent', () => {
        (0, consent_1.recordConsent)();
        return { ok: true };
    });
    // Declining at the privacy step is the same contract as the old consent
    // window: no consent → the agent has nothing to do, so it quits.
    electron_1.ipcMain.handle('marina:onboarding:decline', () => {
        onboardingWindow?.close();
        electron_1.app.quit();
        return true;
    });
    electron_1.ipcMain.handle('marina:onboarding:pair', async (_e, payload) => {
        // runPairing persists everything and starts always-on services via the
        // onPaired callback registered in registerPairingIpc().
        return (0, pairing_1.runPairing)(payload);
    });
    // Open a Marina web URL the renderer constructs (server base + path). We only
    // honour http(s) to avoid opening anything unexpected.
    electron_1.ipcMain.handle('marina:onboarding:open-web', (_e, url) => {
        if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
            void electron_1.shell.openExternal(url);
        }
        return true;
    });
    electron_1.ipcMain.handle('marina:onboarding:finish', () => {
        onboardingWindow?.close();
        return true;
    });
}
//# sourceMappingURL=onboarding.js.map