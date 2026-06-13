import { BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { completePairing } from './api'
import { DEFAULT_DEVICE_LABEL, DEFAULT_SERVER_BASE_URL, STORE_KEYS } from './config'
import { get, set, writeToken } from './store'
import { bus } from './state'
import { bringToFront, hideDockIfIdle } from './window-utils'

let pairingWindow: BrowserWindow | null = null

export function openPairingWindow(): void {
  if (pairingWindow) {
    bringToFront(pairingWindow)
    return
  }
  pairingWindow = new BrowserWindow({
    width: 480,
    height: 480,
    title: 'Pair this device',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    alwaysOnTop: true,
    center: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-pairing.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  pairingWindow.removeMenu()
  pairingWindow.loadFile(path.join(__dirname, '..', 'renderer', 'pairing.html'))
  pairingWindow.once('ready-to-show', () => {
    if (pairingWindow) bringToFront(pairingWindow)
  })
  pairingWindow.on('closed', () => {
    pairingWindow = null
    hideDockIfIdle()
  })
}

export function registerPairingIpc(onPaired: (login: string) => void): void {
  ipcMain.handle('marina:pairing:defaults', () => ({
    serverBaseUrl: get(STORE_KEYS.serverBaseUrl) ?? DEFAULT_SERVER_BASE_URL,
    label: DEFAULT_DEVICE_LABEL,
  }))

  ipcMain.handle(
    'marina:pairing:submit',
    async (_e, payload: { serverBaseUrl: string; code: string; label: string }) => {
      const serverBaseUrl = (payload.serverBaseUrl ?? '').trim().replace(/\/+$/, '')
      const code = (payload.code ?? '').trim().toUpperCase().replace(/[^A-Z2-9]/g, '')
      const label = (payload.label ?? DEFAULT_DEVICE_LABEL).trim().slice(0, 80) || DEFAULT_DEVICE_LABEL

      if (!/^https?:\/\//i.test(serverBaseUrl)) {
        return { ok: false, error: 'Server URL must start with http:// or https://' }
      }
      if (code.length !== 8) {
        return { ok: false, error: 'Code must be exactly 8 characters' }
      }

      try {
        const res = await completePairing({ serverBaseUrl, code, label })
        writeToken(res.token)
        set(STORE_KEYS.serverBaseUrl, serverBaseUrl)
        set(STORE_KEYS.deviceId, res.device.id)
        set(STORE_KEYS.userLogin, res.user.login)
        set(STORE_KEYS.userName, res.user.name ?? null)
        set(STORE_KEYS.sampleIntervalSeconds, res.config.sampleIntervalSeconds)
        set(STORE_KEYS.flushIntervalSeconds, res.config.flushIntervalSeconds)
        set(STORE_KEYS.windowTitlesEnabled, res.config.windowTitlesEnabled)
        set(STORE_KEYS.paused, false)

        bus.patch({
          paired: true,
          paused: false,
          windowTitlesEnabled: res.config.windowTitlesEnabled,
          sampleIntervalSeconds: res.config.sampleIntervalSeconds,
          flushIntervalSeconds: res.config.flushIntervalSeconds,
          userLogin: res.user.login,
          serverBaseUrl,
          lastError: null,
        })

        onPaired(res.user.login)
        pairingWindow?.close()
        return { ok: true, login: res.user.login }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, error: msg }
      }
    }
  )

  ipcMain.handle('marina:pairing:cancel', () => {
    pairingWindow?.close()
    return true
  })
}
