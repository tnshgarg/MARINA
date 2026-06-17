import { BrowserWindow, app, ipcMain, shell } from 'electron'
import path from 'path'
import {
  AGENT_VERSION,
  DEFAULT_DEVICE_LABEL,
  DEFAULT_SERVER_BASE_URL,
  STORE_KEYS,
} from './config'
import { get, readToken } from './store'
import { bus } from './state'
import { hasConsented, recordConsent } from './consent'
import { runPairing } from './pairing'
import { bringToFront, hideDockIfIdle } from './window-utils'

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
let onboardingWindow: BrowserWindow | null = null

export function openOnboardingWindow(): void {
  if (onboardingWindow) {
    bringToFront(onboardingWindow)
    return
  }
  onboardingWindow = new BrowserWindow({
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
      preload: path.join(__dirname, 'preload-onboarding.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  onboardingWindow.removeMenu()
  onboardingWindow.loadFile(path.join(__dirname, '..', 'renderer', 'onboarding.html'))
  onboardingWindow.once('ready-to-show', () => {
    if (onboardingWindow) bringToFront(onboardingWindow)
  })
  onboardingWindow.on('closed', () => {
    onboardingWindow = null
    hideDockIfIdle()
  })
}

export function closeOnboardingWindow(): void {
  onboardingWindow?.close()
}

export function registerOnboardingIpc(): void {
  ipcMain.handle('marina:onboarding:defaults', () => ({
    serverBaseUrl: get(STORE_KEYS.serverBaseUrl) ?? DEFAULT_SERVER_BASE_URL,
    label: DEFAULT_DEVICE_LABEL,
    version: AGENT_VERSION,
    alreadyConsented: hasConsented(),
    alreadyPaired: !!readToken(),
    userLogin: bus.get().userLogin,
  }))

  ipcMain.handle('marina:onboarding:consent', () => {
    recordConsent()
    return { ok: true }
  })

  // Declining at the privacy step is the same contract as the old consent
  // window: no consent → the agent has nothing to do, so it quits.
  ipcMain.handle('marina:onboarding:decline', () => {
    onboardingWindow?.close()
    app.quit()
    return true
  })

  ipcMain.handle(
    'marina:onboarding:pair',
    async (_e, payload: { serverBaseUrl: string; code: string; label: string }) => {
      // runPairing persists everything and starts always-on services via the
      // onPaired callback registered in registerPairingIpc().
      return runPairing(payload)
    },
  )

  // Open a Marina web URL the renderer constructs (server base + path). We only
  // honour http(s) to avoid opening anything unexpected.
  ipcMain.handle('marina:onboarding:open-web', (_e, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      void shell.openExternal(url)
    }
    return true
  })

  ipcMain.handle('marina:onboarding:finish', () => {
    onboardingWindow?.close()
    return true
  })
}
