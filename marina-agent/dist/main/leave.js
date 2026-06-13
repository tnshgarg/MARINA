"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openLeaveWindow = openLeaveWindow;
exports.registerLeaveIpc = registerLeaveIpc;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const api_1 = require("./api");
const state_1 = require("./state");
const window_utils_1 = require("./window-utils");
let leaveWindow = null;
function openLeaveWindow() {
    if (leaveWindow) {
        (0, window_utils_1.bringToFront)(leaveWindow);
        return;
    }
    leaveWindow = new electron_1.BrowserWindow({
        width: 480,
        height: 460,
        title: 'Request leave',
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        show: false,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload-leave.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });
    leaveWindow.removeMenu();
    leaveWindow.loadFile(path_1.default.join(__dirname, '..', 'renderer', 'leave.html'));
    leaveWindow.once('ready-to-show', () => {
        if (leaveWindow)
            (0, window_utils_1.bringToFront)(leaveWindow);
    });
    leaveWindow.on('closed', () => {
        leaveWindow = null;
        (0, window_utils_1.hideDockIfIdle)();
    });
}
function registerLeaveIpc() {
    electron_1.ipcMain.handle('marina:leave:state', () => {
        const s = state_1.bus.get();
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        return {
            hasOrg: s.primaryOrgId !== null,
            orgId: s.primaryOrgId,
            todayDate: todayStr,
        };
    });
    electron_1.ipcMain.handle('marina:leave:submit', async (_e, payload) => {
        const reason = (payload?.reason ?? '').trim();
        const start = (payload?.startDate ?? '').trim();
        const end = (payload?.endDate ?? '').trim();
        if (!start || !end || reason.length === 0) {
            return { ok: false, error: 'Please fill all three fields.' };
        }
        try {
            const res = await (0, api_1.postLeave)({
                orgId: state_1.bus.get().primaryOrgId ?? undefined,
                startDate: start,
                endDate: end,
                reason,
            });
            state_1.bus.patch({ lastError: null });
            return { ok: true, leave: res.leave };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            state_1.bus.patch({ lastError: `leave: ${msg}` });
            return { ok: false, error: msg };
        }
    });
    electron_1.ipcMain.handle('marina:leave:close', () => {
        leaveWindow?.close();
        return true;
    });
}
//# sourceMappingURL=leave.js.map