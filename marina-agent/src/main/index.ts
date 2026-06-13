import { app, globalShortcut, Notification } from 'electron'
import { AGENT_VERSION, DEFAULT_SERVER_BASE_URL, STORE_KEYS } from './config'
import { get, readToken, set } from './store'
import { bus } from './state'
import { createTray } from './tray'
import { startUploader, stopUploader, drainOnQuit } from './uploader'
import { stopSampler } from './sampler'
import { stopShotter } from './shotter'
import { startHeartbeat, stopHeartbeat, pingOnce } from './heartbeat'
import { hasConsented, registerConsentIpc, showConsentWindow } from './consent'
import { openPairingWindow, registerPairingIpc } from './pairing'
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

  // First-run consent gate.
  if (!hasConsented()) {
    const accepted = await showConsentWindow()
    if (!accepted) {
      app.quit()
      return
    }
  }

  // If we already have a valid token, start the always-on services.
  // Heartbeat will start/stop the sampler+shotter based on punch state.
  const token = readToken()
  if (token) {
    bus.patch({ paired: true })
    startHeartbeat()
    startUploader()
    startNotifications()
    await pingOnce() // initial state sync — heartbeat reconciles tracking
  } else {
    // First-run / unpaired: open the pairing window immediately and surface a
    // notification — on a menubar-only macOS app, users sometimes miss the
    // pairing window even with focus tricks.
    openPairingWindow()
    try {
      const n = new Notification({
        title: 'Welcome to MARINA',
        body: 'Pair this device to your team. Click the MARINA icon in the menu bar if you don\'t see the pairing window.',
      })
      n.show()
    } catch {
      // Notifications may not be available in all dev environments
    }
  }
})
