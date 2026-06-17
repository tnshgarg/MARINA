"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.performPunchIn = performPunchIn;
exports.openPunchOutWindow = openPunchOutWindow;
exports.registerPunchIpc = registerPunchIpc;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const api_1 = require("./api");
const state_1 = require("./state");
const heartbeat_1 = require("./heartbeat");
const window_utils_1 = require("./window-utils");
let punchOutWindow = null;
async function performPunchIn() {
    try {
        const res = await (0, api_1.punchIn)();
        state_1.bus.patch({
            activeShift: {
                id: res.shift.id,
                punchedInAt: res.shift.punchedInAt,
            },
            lastError: null,
        });
        // Instantly start tracking — we won't wait for the next heartbeat.
        (0, heartbeat_1.reconcileTrackingNow)();
        void (0, heartbeat_1.pingOnce)();
        if (!res.alreadyOpen) {
            new electron_1.Notification({
                title: 'Marina · Punched in',
                body: 'Tracking is on. Have a great shift.',
            }).show();
        }
        return { ok: true };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        state_1.bus.patch({ lastError: `punch in: ${msg}` });
        return { ok: false, error: msg };
    }
}
function openPunchOutWindow() {
    if (punchOutWindow) {
        (0, window_utils_1.bringToFront)(punchOutWindow);
        return;
    }
    punchOutWindow = new electron_1.BrowserWindow({
        width: 560,
        height: 540,
        title: 'Punch out',
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        show: false,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload-punch.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });
    punchOutWindow.removeMenu();
    punchOutWindow.loadFile(path_1.default.join(__dirname, '..', 'renderer', 'punchout.html'));
    punchOutWindow.once('ready-to-show', () => {
        if (punchOutWindow)
            (0, window_utils_1.bringToFront)(punchOutWindow);
    });
    punchOutWindow.on('closed', () => {
        punchOutWindow = null;
        (0, window_utils_1.hideDockIfIdle)();
    });
}
function registerPunchIpc() {
    electron_1.ipcMain.handle('marina:punch:state', () => {
        const s = state_1.bus.get();
        return {
            activeShift: s.activeShift,
            userLogin: s.userLogin,
        };
    });
    electron_1.ipcMain.handle('marina:punch:in', async () => {
        return performPunchIn();
    });
    electron_1.ipcMain.handle('marina:punch:out', async (_e, payload) => {
        const summary = (payload?.summary ?? '').trim();
        if (summary.length < 20) {
            return {
                ok: false,
                error: 'Please write at least 20 characters describing what you worked on.',
            };
        }
        try {
            const res = await (0, api_1.punchOut)(summary);
            state_1.bus.patch({ activeShift: null, lastError: null });
            (0, heartbeat_1.reconcileTrackingNow)();
            void (0, heartbeat_1.pingOnce)();
            new electron_1.Notification({
                title: 'Marina · Punched out',
                body: `Summary scored ${res.verification.score}/100 (${res.verification.status})`,
            }).show();
            return { ok: true, verification: res.verification };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            state_1.bus.patch({ lastError: `punch out: ${msg}` });
            return { ok: false, error: msg };
        }
    });
    electron_1.ipcMain.handle('marina:punch:close', () => {
        punchOutWindow?.close();
        return true;
    });
}
//# sourceMappingURL=punch.js.map