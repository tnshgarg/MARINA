import { execFile } from 'child_process'

export type ActiveWindowInfo = { app: string; title: string } | null

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
export async function getActiveWindow(includeTitle: boolean): Promise<ActiveWindowInfo> {
  if (process.platform === 'darwin') {
    try {
      const { default: activeWin } = await import('active-win')
      const r = await activeWin()
      if (!r) return null
      return {
        app: (r.owner?.name ?? '').trim(),
        title: includeTitle ? (r.title ?? '').trim() : '',
      }
    } catch {
      return null
    }
  }
  if (process.platform === 'win32') {
    return getActiveWindowWindows(includeTitle)
  }
  return null
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
].join('\n')

function getActiveWindowWindows(includeTitle: boolean): Promise<ActiveWindowInfo> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', PS_SCRIPT],
      { timeout: 8000, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) return resolve(null)
        const line = stdout.toString().trim().split(/\r?\n/).pop() ?? ''
        const sep = line.indexOf('|||')
        if (sep < 0) return resolve(null)
        const app = line.slice(0, sep).trim()
        if (!app) return resolve(null)
        const title = includeTitle ? line.slice(sep + 3).trim() : ''
        resolve({ app, title })
      },
    )
  })
}
