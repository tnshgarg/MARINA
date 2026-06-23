import { execFile } from 'child_process'
import { systemPreferences } from 'electron'

export type ActiveWindowInfo = { app: string; title: string; bundleId?: string } | null

/**
 * Cross-platform active-window detection.
 *
 * - macOS: the frontmost app (display name + bundle id) is read from the
 *   built-in `lsappinfo` CLI. This needs NO Accessibility / Screen-Recording
 *   permission, so it never triggers a TCC prompt and never fails on an
 *   unsigned build.
 *
 *   We deliberately do NOT use `active-win` for the app name: its prebuilt
 *   Swift binary (`active-win/main`) is a *separate* executable, so the
 *   Accessibility grant the user gives to "Marina" can't be attributed to it
 *   and it re-prompts forever; and under our hardened-runtime, ad-hoc-signed
 *   build the spawn is killed outright ("Command failed: …/active-win/main").
 *   The window *title* genuinely needs the OS permission, so we only reach for
 *   active-win when titles are explicitly enabled AND accessibility is already
 *   granted — checked WITHOUT prompting — so this code never raises the popup.
 *
 * - Windows: a hidden PowerShell + Win32 `GetForegroundWindow` call. Needs no
 *   native node addon, so it works even though active-win's win32 binary isn't
 *   bundled. PowerShell is present on every Windows 10/11.
 */
export async function getActiveWindow(includeTitle: boolean): Promise<ActiveWindowInfo> {
  if (process.platform === 'darwin') return getActiveWindowMac(includeTitle)
  if (process.platform === 'win32') return getActiveWindowWindows(includeTitle)
  return null
}

async function getActiveWindowMac(includeTitle: boolean): Promise<ActiveWindowInfo> {
  const front = await frontmostApp()
  if (!front) return null
  const app = front.app || front.bundleId
  if (!app) return null

  let title = ''
  if (includeTitle && isAccessibilityTrusted()) {
    // Only now do we touch active-win's permission-gated binary, and only once
    // the user has already granted accessibility — so this never prompts and a
    // failure (e.g. on an unsigned build) just yields an empty title.
    title = await frontmostWindowTitle().catch(() => '')
  }
  return { app, title, bundleId: front.bundleId }
}

/**
 * Frontmost app's display name + bundle id via the permission-free `lsappinfo`
 * CLI (`/usr/bin/lsappinfo`, present on every macOS). Two cheap calls: resolve
 * the frontmost ASN, then read its name + bundleID.
 */
function frontmostApp(): Promise<{ app: string; bundleId: string } | null> {
  return new Promise((resolve) => {
    execFile('/usr/bin/lsappinfo', ['front'], { timeout: 4000 }, (err, asnOut) => {
      const asn = (asnOut ?? '').toString().trim()
      if (err || !asn) return resolve(null)
      execFile(
        '/usr/bin/lsappinfo',
        ['info', '-only', 'name', '-only', 'bundleID', asn],
        { timeout: 4000 },
        (err2, infoOut) => {
          if (err2) return resolve(null)
          const out = (infoOut ?? '').toString()
          const app = (out.match(/"LSDisplayName"\s*=\s*"([^"]*)"/)?.[1] ?? '').trim()
          const bundleId = (out.match(/"CFBundleIdentifier"\s*=\s*"([^"]*)"/)?.[1] ?? '').trim()
          if (!app && !bundleId) return resolve(null)
          resolve({ app, bundleId })
        },
      )
    })
  })
}

/** True only if Accessibility is already granted — never prompts (prompt:false). */
function isAccessibilityTrusted(): boolean {
  try {
    return systemPreferences.isTrustedAccessibilityClient(false)
  } catch {
    return false
  }
}

async function frontmostWindowTitle(): Promise<string> {
  const { default: activeWin } = await import('active-win')
  const r = await activeWin()
  return (r?.title ?? '').trim()
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
