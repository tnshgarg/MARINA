"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openDoneWindow = openDoneWindow;
exports.registerDoneIpc = registerDoneIpc;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const api_1 = require("./api");
const state_1 = require("./state");
const window_utils_1 = require("./window-utils");
/**
 * "Mark work as done" — the fastest path for an employee to log a shipped
 * deliverable from the desktop. Mirrors the web app's LogDeliverableCard but
 * lives in the menubar so it stays one click away while focused on real work.
 *
 * Why we have this in the agent: managers care less about "what you typed
 * in standup" and more about "what you ACTUALLY shipped today". The agent
 * also pins the active screenshot at the moment of logging — the web app
 * shows that timestamp to the manager as honest verification ("this was
 * pinned at 2:14pm when they marked it done"). Logging from the desktop
 * keeps the screenshot pin recent and relevant.
 */
let doneWindow = null;
function openDoneWindow() {
    if (doneWindow) {
        (0, window_utils_1.bringToFront)(doneWindow);
        return;
    }
    doneWindow = new electron_1.BrowserWindow({
        width: 480,
        height: 420,
        title: 'Mark work as done',
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        show: false,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload-done.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });
    doneWindow.removeMenu();
    doneWindow.loadFile(path_1.default.join(__dirname, '..', 'renderer', 'done.html'));
    doneWindow.once('ready-to-show', () => {
        if (doneWindow)
            (0, window_utils_1.bringToFront)(doneWindow);
    });
    doneWindow.on('closed', () => {
        doneWindow = null;
        (0, window_utils_1.hideDockIfIdle)();
    });
}
function registerDoneIpc() {
    electron_1.ipcMain.handle('marina:done:state', () => {
        const s = state_1.bus.get();
        return { userLogin: s.userLogin, paired: s.paired };
    });
    electron_1.ipcMain.handle('marina:done:submit', async (_e, payload) => {
        const title = (payload?.title ?? '').trim();
        if (title.length < 10) {
            return {
                ok: false,
                error: 'Tell us a bit more — at least 10 characters so your manager can recognise it.',
            };
        }
        const url = typeof payload?.url === 'string' && payload.url.trim().length > 0 ? payload.url.trim() : null;
        try {
            const res = await (0, api_1.postDeliverable)({ title, url });
            if (!res.ok) {
                return {
                    ok: false,
                    error: res.duplicateOf
                        ? 'Looks like you already logged this in the last 4 hours.'
                        : 'Could not log your deliverable.',
                };
            }
            // Toast the user — same UX shape as the punch flow.
            try {
                const n = new electron_1.Notification({
                    title: 'Logged on MARINA',
                    body: title.length > 80 ? `${title.slice(0, 78)}…` : title,
                    silent: true,
                });
                n.show();
            }
            catch {
                // No-op if notifications aren't permitted.
            }
            return { ok: true, deliverable: res.deliverable };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            state_1.bus.patch({ lastError: `done: ${msg}` });
            return { ok: false, error: msg };
        }
    });
    electron_1.ipcMain.handle('marina:done:cancel', () => {
        doneWindow?.close();
    });
}
//# sourceMappingURL=done.js.map