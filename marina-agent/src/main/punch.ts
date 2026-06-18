import { BrowserWindow, ipcMain, Notification } from 'electron'
import path from 'path'
import { punchIn, punchOut } from './api'
import { bus } from './state'
import { pingOnce, reconcileTrackingNow } from './heartbeat'
import { bringToFront, hideDockIfIdle } from './window-utils'

let punchOutWindow: BrowserWindow | null = null

export async function performPunchIn(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await punchIn()
    bus.patch({
      activeShift: {
        id: res.shift.id,
        punchedInAt: res.shift.punchedInAt,
      },
      lastError: null,
    })
    // Instantly start tracking — we won't wait for the next heartbeat.
    reconcileTrackingNow()
    void pingOnce()
    if (!res.alreadyOpen) {
      new Notification({
        title: 'Marina · Punched in',
        body: 'Tracking is on. Have a great shift.',
      }).show()
    }
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    bus.patch({ lastError: `punch in: ${msg}` })
    return { ok: false, error: msg }
  }
}

export function openPunchOutWindow(): void {
  if (punchOutWindow) {
    bringToFront(punchOutWindow)
    return
  }
  punchOutWindow = new BrowserWindow({
    width: 560,
    height: 540,
    title: 'Punch out',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-punch.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  punchOutWindow.removeMenu()
  punchOutWindow.loadFile(path.join(__dirname, '..', 'renderer', 'punchout.html'))
  punchOutWindow.once('ready-to-show', () => {
    if (punchOutWindow) bringToFront(punchOutWindow)
  })
  punchOutWindow.on('closed', () => {
    punchOutWindow = null
    hideDockIfIdle()
  })
}

export function registerPunchIpc(): void {
  ipcMain.handle('marina:punch:state', () => {
    const s = bus.get()
    return {
      activeShift: s.activeShift,
      userLogin: s.userLogin,
    }
  })

  ipcMain.handle('marina:punch:in', async () => {
    return performPunchIn()
  })

  ipcMain.handle(
    'marina:punch:out',
    async (_e, payload: { summary: string }) => {
      const summary = (payload?.summary ?? '').trim()
      if (summary.length < 20) {
        return {
          ok: false,
          error: 'Please write at least 20 characters describing what you worked on.',
        }
      }
      try {
        const res = await punchOut(summary)
        bus.patch({ activeShift: null, lastError: null })
        reconcileTrackingNow()
        void pingOnce()
        new Notification({
          title: 'Marina · Punched out',
          // Only surface a score when the summary was actually verified. When
          // verification is off (status 'skipped') a "0/100" would read as a
          // failure, so just acknowledge the log.
          body:
            res.verification.status === 'skipped'
              ? 'Your summary is logged. Have a good one.'
              : `Summary scored ${res.verification.score}/100 (${res.verification.status})`,
        }).show()
        return { ok: true, verification: res.verification }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        bus.patch({ lastError: `punch out: ${msg}` })
        return { ok: false, error: msg }
      }
    }
  )

  ipcMain.handle('marina:punch:close', () => {
    punchOutWindow?.close()
    return true
  })
}
