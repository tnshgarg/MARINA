"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openBreakWindow = openBreakWindow;
exports.registerBreakIpc = registerBreakIpc;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const api_1 = require("./api");
const state_1 = require("./state");
const heartbeat_1 = require("./heartbeat");
const window_utils_1 = require("./window-utils");
let breakWindow = null;
function openBreakWindow() {
    if (breakWindow) {
        (0, window_utils_1.bringToFront)(breakWindow);
        return;
    }
    breakWindow = new electron_1.BrowserWindow({
        width: 520,
        height: 560,
        title: 'Pause tracking',
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        show: false,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload-break.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });
    breakWindow.removeMenu();
    breakWindow.loadFile(path_1.default.join(__dirname, '..', 'renderer', 'break.html'));
    breakWindow.once('ready-to-show', () => {
        if (breakWindow)
            (0, window_utils_1.bringToFront)(breakWindow);
    });
    breakWindow.on('closed', () => {
        breakWindow = null;
        (0, window_utils_1.hideDockIfIdle)();
    });
}
function registerBreakIpc() {
    electron_1.ipcMain.handle('marina:break:state', () => {
        const s = state_1.bus.get();
        return {
            activeBreak: s.activeBreak,
            userLogin: s.userLogin,
        };
    });
    electron_1.ipcMain.handle('marina:break:start', async (_e, payload) => {
        const reason = (payload?.reason ?? '').trim();
        const category = payload?.category ?? 'other';
        if (reason.length === 0 && category !== 'blocked') {
            return { ok: false, error: 'Add a short note so your team knows what’s up.' };
        }
        try {
            const res = await (0, api_1.postBreak)({
                reason,
                orgId: state_1.bus.get().primaryOrgId ?? undefined,
                category,
                waitingOnUserId: payload?.waitingOnUserId ?? null,
                waitingOnExternal: payload?.waitingOnExternal ?? null,
                expectedEndAt: payload?.expectedEndAt ?? null,
            });
            state_1.bus.patch({
                activeBreak: {
                    id: res.break.id,
                    startedAt: res.break.startedAt,
                    reason: res.break.reason,
                },
                lastError: null,
            });
            void (0, heartbeat_1.pingOnce)();
            return { ok: true, break: res.break };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            state_1.bus.patch({ lastError: `break: ${msg}` });
            return { ok: false, error: msg };
        }
    });
    electron_1.ipcMain.handle('marina:break:roster', async () => {
        try {
            const res = await (0, api_1.fetchTeamRoster)();
            return { ok: true, members: res.members };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { ok: false, error: msg, members: [] };
        }
    });
    electron_1.ipcMain.handle('marina:break:end', async () => {
        try {
            const res = await (0, api_1.endActiveBreak)();
            state_1.bus.patch({ activeBreak: null, lastError: null });
            void (0, heartbeat_1.pingOnce)();
            return { ok: true, ended: res.ended };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            state_1.bus.patch({ lastError: `break-end: ${msg}` });
            return { ok: false, error: msg };
        }
    });
    electron_1.ipcMain.handle('marina:break:close', () => {
        breakWindow?.close();
        return true;
    });
}
//# sourceMappingURL=break.js.map