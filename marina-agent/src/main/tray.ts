import { Menu, Tray, app, nativeImage, shell } from 'electron'
import { bus } from './state'
import { postPause } from './api'
import { drainOnQuit } from './uploader'
import { pingOnce } from './heartbeat'
import { startSampler, stopSampler } from './sampler'
import { startShotter, stopShotter } from './shotter'
import { openPairingWindow } from './pairing'
import { openBreakWindow } from './break'
import { openLeaveWindow } from './leave'
import { openPunchOutWindow, performPunchIn } from './punch'
import { openDoneWindow } from './done'

let tray: Tray | null = null

// 1x1 fully-transparent PNG — Electron requires a real image even when we set
// only the menubar title. We render the visible state via setTitle().
const TRANSPARENT_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

export function createTray(): Tray {
  const image = nativeImage.createFromBuffer(Buffer.from(TRANSPARENT_PNG_BASE64, 'base64'))
  image.setTemplateImage(true)
  tray = new Tray(image)
  tray.setIgnoreDoubleClickEvents(true)
  rebuild()
  bus.on('change', rebuild)
  // Single-click on the tray icon opens pairing if not paired — saves users
  // having to discover the menu.
  tray.on('click', () => {
    if (!bus.get().paired) {
      openPairingWindow()
    }
  })
  return tray
}

let cameraUntil = 0
function statusGlyph(): string {
  const s = bus.get()
  if (Date.now() < cameraUntil) return '◉' // brief capture indicator
  if (!s.paired) return '◌'
  if (s.paused) return '⏸'
  if (s.lastError) return '!'
  return '●'
}

export function flashCameraIndicator(durationMs = 1500): void {
  cameraUntil = Date.now() + durationMs
  // Force a rebuild now and again when the flash ends.
  rebuild()
  setTimeout(() => rebuild(), durationMs + 50)
}

function statusLine(): string {
  const s = bus.get()
  if (!s.paired) return 'Not paired'
  if (!s.activeShift) return 'Off-clock · not punched in'
  if (s.activeBreak) {
    const mins = Math.floor((Date.now() - new Date(s.activeBreak.startedAt).getTime()) / 60000)
    return `On break · ${mins}m`
  }
  if (s.paused) return 'Paused'
  if (s.lastError) return s.lastError
  const shiftMins = Math.floor((Date.now() - new Date(s.activeShift.punchedInAt).getTime()) / 60000)
  const h = Math.floor(shiftMins / 60)
  const m = shiftMins % 60
  return `Available · ${h}h ${m}m${s.pendingCount > 0 ? ` · ${s.pendingCount} pending` : ''}`
}

function rebuild(): void {
  if (!tray) return
  const state = bus.get()
  // macOS: text title in the menubar. Windows: tooltip on hover.
  if (process.platform === 'darwin') {
    tray.setTitle(`${statusGlyph()} MARINA`)
  } else {
    tray.setToolTip(`MARINA · ${statusLine()}`)
  }

  const items: Electron.MenuItemConstructorOptions[] = [
    { label: statusLine(), enabled: false },
  ]

  if (!state.paired) {
    // Top-of-menu pairing CTA when not paired so users can never miss it
    items.push({
      label: '🔗  Pair this device…',
      click: () => openPairingWindow(),
    })
  } else if (state.userLogin) {
    items.push({ label: `@${state.userLogin}`, enabled: false })
  }
  items.push({ type: 'separator' })

  if (state.paired) {
    // Punch state — the primary action
    if (!state.activeShift) {
      items.push({
        label: '▶︎  Punch in for today',
        click: () => void performPunchIn(),
      })
    } else {
      items.push({
        label: '⏏︎  Punch out…',
        click: () => openPunchOutWindow(),
      })
      items.push({ type: 'separator' })
      if (state.activeBreak) {
        items.push({
          label: `End break · ${state.activeBreak.reason.slice(0, 40)}${state.activeBreak.reason.length > 40 ? '…' : ''}`,
          click: () => openBreakWindow(),
        })
      } else {
        items.push({
          label: 'Take a break…',
          accelerator: process.platform === 'darwin' ? 'Cmd+Shift+B' : 'Ctrl+Shift+B',
          click: () => openBreakWindow(),
        })
      }
      // "Mark work as done" — the fast path that puts visible output into the
      // manager's daily digest. Available whenever the user is on the clock.
      items.push({
        label: 'Mark work as done…',
        accelerator: process.platform === 'darwin' ? 'Cmd+Shift+D' : 'Ctrl+Shift+D',
        click: () => openDoneWindow(),
      })
    }
    items.push({
      label: 'Request leave…',
      click: () => openLeaveWindow(),
    })
    items.push({ type: 'separator' })
    items.push({
      label: state.paused ? 'Resume tracking' : 'Pause tracking',
      click: () => void togglePause(),
      enabled: !!state.activeShift,
    })
    items.push({
      label: 'Open dashboard',
      click: () => void shell.openExternal(`${state.serverBaseUrl}/dashboard`),
    })
    items.push({
      label: 'Open settings',
      click: () => void shell.openExternal(`${state.serverBaseUrl}/settings`),
    })
    items.push({ type: 'separator' })
    items.push({
      label: 'Re-pair this device…',
      click: () => openPairingWindow(),
    })
  }

  items.push({ type: 'separator' })
  items.push({
    label: 'Quit Project MARINA',
    click: async () => {
      await drainOnQuit()
      app.quit()
    },
  })

  tray.setContextMenu(Menu.buildFromTemplate(items))
}

async function togglePause(): Promise<void> {
  const desired = !bus.get().paused
  // Fast local apply for snappy UX.
  bus.patch({ paused: desired })
  if (desired) {
    stopSampler({ flush: true })
    stopShotter()
  } else {
    startSampler()
    startShotter()
  }

  try {
    await postPause(desired)
    // Reconcile with the server (covers the race where pause was changed elsewhere).
    void pingOnce()
  } catch (err) {
    console.error('togglePause failed', err)
    bus.patch({ lastError: `pause: ${String(err)}` })
  }
}
