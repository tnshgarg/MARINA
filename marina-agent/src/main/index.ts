import { app, globalShortcut } from 'electron'
import { AGENT_VERSION, DEFAULT_SERVER_BASE_URL, STORE_KEYS } from './config'
import { get, readToken, set } from './store'
import { bus } from './state'
import { createTray } from './tray'
import { startUploader, stopUploader, drainOnQuit } from './uploader'
import { stopSampler } from './sampler'
import { stopShotter } from './shotter'
import { startHeartbeat, stopHeartbeat, pingOnce } from './heartbeat'
import { hasConsented, registerConsentIpc } from './consent'
import { registerPairingIpc } from './pairing'
import { openOnboardingWindow, registerOnboardingIpc } from './onboarding'
import { registerBreakIpc, openBreakWindow } from './break'
import { registerLeaveIpc } from './leave'
import { registerPunchIpc } from './punch'
import { registerDoneIpc, openDoneWindow } from './done'
import { startNotifications, stopNotifications } from './notifications'

// Single-instance lock — second launch focuses any open pairing/consent window.
const got = app.requestSingleInstanceLock()
if (!got) {
  app.quit()
}

app.on('second-instance', () => {
  // Bring something interactive to the front if a window is open.
  // No-op otherwise — the agent is a menubar app.
})

// macOS: prevent the dock icon entirely. (Also handled via LSUIElement in plist.)
// Windows: nothing to hide — tray-only by virtue of never creating a frame window.
if (process.platform === 'darwin' && app.dock && typeof app.dock.hide === 'function') {
  app.dock.hide()
}

app.on('window-all-closed', () => {
  // Keep the app alive when all windows close; tray is the only UI.
  // (Default behavior on macOS is to keep running; we add this to be explicit
  // and to ensure platforms other than macOS also keep the tray active.)
})

let isQuitting = false
app.on('before-quit', async (e) => {
  if (isQuitting) return
  isQuitting = true
  e.preventDefault()
  try {
    stopShotter()
    stopSampler({ flush: true })
    await drainOnQuit()
  } finally {
    stopNotifications()
    stopHeartbeat()
    stopUploader()
    app.exit(0)
  }
})

app.whenReady().then(async () => {
  console.log('marina-agent', AGENT_VERSION, 'starting')

  // Auto-launch at login (off in dev — only persist for packaged builds).
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
    })
  }

  // Seed state from store.
  const storedServer = get(STORE_KEYS.serverBaseUrl) ?? DEFAULT_SERVER_BASE_URL
  bus.patch({
    serverBaseUrl: storedServer,
    paused: get(STORE_KEYS.paused) ?? false,
    windowTitlesEnabled: get(STORE_KEYS.windowTitlesEnabled) ?? false,
    sampleIntervalSeconds: get(STORE_KEYS.sampleIntervalSeconds) ?? 30,
    flushIntervalSeconds: get(STORE_KEYS.flushIntervalSeconds) ?? 300,
    userLogin: get(STORE_KEYS.userLogin) ?? null,
  })

  registerConsentIpc()
  registerOnboardingIpc()
  registerBreakIpc()
  registerLeaveIpc()
  registerPunchIpc()
  registerDoneIpc()
  registerPairingIpc(() => {
    // Once paired, start the always-on services. Tracking (sampler+shotter)
    // only starts when the user punches in — heartbeat will turn it on.
    startHeartbeat()
    startUploader()
    startNotifications()
  })

  // Always create the tray first so the user has UI even before consent finishes.
  createTray()

  // Global keyboard shortcuts — these stay registered as long as the agent
  // is running, regardless of which app is focused. The shortcut hints in
  // the tray menu (`accelerator` field) only describe these, they do NOT
  // register them — `globalShortcut.register()` is the source of truth.
  //
  // Mac uses Cmd+Shift+<key>, Windows/Linux uses Ctrl+Shift+<key>. We pick
  // letters that don't collide with anything common in IDEs or browsers.
  const mod = process.platform === 'darwin' ? 'Cmd' : 'Ctrl'
  try {
    globalShortcut.register(`${mod}+Shift+D`, () => openDoneWindow())
    globalShortcut.register(`${mod}+Shift+B`, () => openBreakWindow())
  } catch (err) {
    console.error('globalShortcut.register failed', err)
  }

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })

  // First-run flow. If this device is already paired AND consent is on record,
  // boot straight into the always-on services. Otherwise run onboarding — one
  // guided flow that covers consent + pairing + how-to and starts services the
  // moment pairing completes (via the onPaired callback above). Consent is a
  // hard gate, enforced because every "not paired" entry point routes here.
  const token = readToken()
  if (token && hasConsented()) {
    bus.patch({ paired: true })
    startHeartbeat()
    startUploader()
    startNotifications()
    await pingOnce() // initial state sync — heartbeat reconciles tracking
  } else {
    openOnboardingWindow()
  }
})
