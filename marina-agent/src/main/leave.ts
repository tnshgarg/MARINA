import { BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { postLeave } from './api'
import { bus } from './state'
import { bringToFront, hideDockIfIdle } from './window-utils'

let leaveWindow: BrowserWindow | null = null

export function openLeaveWindow(): void {
  if (leaveWindow) {
    bringToFront(leaveWindow)
    return
  }
  leaveWindow = new BrowserWindow({
    width: 480,
    height: 460,
    title: 'Request leave',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-leave.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  leaveWindow.removeMenu()
  leaveWindow.loadFile(path.join(__dirname, '..', 'renderer', 'leave.html'))
  leaveWindow.once('ready-to-show', () => {
    if (leaveWindow) bringToFront(leaveWindow)
  })
  leaveWindow.on('closed', () => {
    leaveWindow = null
    hideDockIfIdle()
  })
}

export function registerLeaveIpc(): void {
  ipcMain.handle('marina:leave:state', () => {
    const s = bus.get()
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    return {
      hasOrg: s.primaryOrgId !== null,
      orgId: s.primaryOrgId,
      todayDate: todayStr,
    }
  })

  ipcMain.handle(
    'marina:leave:submit',
    async (_e, payload: { startDate: string; endDate: string; reason: string }) => {
      const reason = (payload?.reason ?? '').trim()
      const start = (payload?.startDate ?? '').trim()
      const end = (payload?.endDate ?? '').trim()
      if (!start || !end || reason.length === 0) {
        return { ok: false, error: 'Please fill all three fields.' }
      }
      try {
        const res = await postLeave({
          orgId: bus.get().primaryOrgId ?? undefined,
          startDate: start,
          endDate: end,
          reason,
        })
        bus.patch({ lastError: null })
        return { ok: true, leave: res.leave }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        bus.patch({ lastError: `leave: ${msg}` })
        return { ok: false, error: msg }
      }
    }
  )

  ipcMain.handle('marina:leave:close', () => {
    leaveWindow?.close()
    return true
  })
}
