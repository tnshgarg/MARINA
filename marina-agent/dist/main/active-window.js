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
exports.getActiveWindow = getActiveWindow;
const child_process_1 = require("child_process");
/**
 * Cross-platform active-window detection.
 *
 * - macOS: the native `active-win` package (its prebuilt darwin binary ships in
 *   the app, and it needs Accessibility permission for titles).
 * - Windows: a hidden PowerShell + Win32 `GetForegroundWindow` call. This needs
 *   NO native node addon, so it works on the Windows build even though
 *   active-win's win32 binary isn't bundled (active-win is never imported on
 *   win32). PowerShell is present on every Windows 10/11.
 */
async function getActiveWindow(includeTitle) {
    if (process.platform === 'darwin') {
        try {
            const { default: activeWin } = await Promise.resolve().then(() => __importStar(require('active-win')));
            const r = await activeWin();
            if (!r)
                return null;
            return {
                app: (r.owner?.name ?? '').trim(),
                title: includeTitle ? (r.title ?? '').trim() : '',
            };
        }
        catch {
            return null;
        }
    }
    if (process.platform === 'win32') {
        return getActiveWindowWindows(includeTitle);
    }
    return null;
}
// Outputs "<processName>|||<windowTitle>" for the current foreground window.
// '|||' is a safe separator — process names never contain it. SilentlyContinue
// keeps it quiet if the process vanishes between the two Win32 calls.
const PS_SCRIPT = [
    "$ErrorActionPreference='SilentlyContinue'",
    'Add-Type @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public static class MarinaWin {',
    '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
    '  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int processId);',
    '}',
    '"@',
    '$h=[MarinaWin]::GetForegroundWindow()',
    '$procId=0',
    '[void][MarinaWin]::GetWindowThreadProcessId($h,[ref]$procId)',
    '$p=Get-Process -Id $procId',
    'Write-Output ("{0}|||{1}" -f $p.ProcessName, $p.MainWindowTitle)',
].join('\n');
function getActiveWindowWindows(includeTitle) {
    return new Promise((resolve) => {
        (0, child_process_1.execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', PS_SCRIPT], { timeout: 8000, windowsHide: true }, (err, stdout) => {
            if (err || !stdout)
                return resolve(null);
            const line = stdout.toString().trim().split(/\r?\n/).pop() ?? '';
            const sep = line.indexOf('|||');
            if (sep < 0)
                return resolve(null);
            const app = line.slice(0, sep).trim();
            if (!app)
                return resolve(null);
            const title = includeTitle ? line.slice(sep + 3).trim() : '';
            resolve({ app, title });
        });
    });
}
//# sourceMappingURL=active-window.js.map