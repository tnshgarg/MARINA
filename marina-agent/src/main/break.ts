import { BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { postBreak, endActiveBreak, fetchTeamRoster } from './api'
import type { StartBreakInput } from './api'
import { bus } from './state'
import { pingOnce } from './heartbeat'
import { bringToFront, hideDockIfIdle } from './window-utils'

let breakWindow: BrowserWindow | null = null

export function openBreakWindow(): void {
  if (breakWindow) {
    bringToFront(breakWindow)
    return
  }
  breakWindow = new BrowserWindow({
    width: 520,
    height: 560,
    title: 'Pause tracking',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-break.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  breakWindow.removeMenu()
  breakWindow.loadFile(path.join(__dirname, '..', 'renderer', 'break.html'))
  breakWindow.once('ready-to-show', () => {
    if (breakWindow) bringToFront(breakWindow)
  })
  breakWindow.on('closed', () => {
    breakWindow = null
    hideDockIfIdle()
  })
}

export function registerBreakIpc(): void {
  ipcMain.handle('marina:break:state', () => {
    const s = bus.get()
    return {
      activeBreak: s.activeBreak,
      userLogin: s.userLogin,
    }
  })

  ipcMain.handle('marina:break:start', async (_e, payload: StartBreakInput) => {
    const reason = (payload?.reason ?? '').trim()
    const category = payload?.category ?? 'other'
    if (reason.length === 0 && category !== 'blocked') {
      return { ok: false, error: 'Add a short note so your team knows what’s up.' }
    }
    try {
      const res = await postBreak({
        reason,
        orgId: bus.get().primaryOrgId ?? undefined,
        category,
        waitingOnUserId: payload?.waitingOnUserId ?? null,
        waitingOnExternal: payload?.waitingOnExternal ?? null,
        expectedEndAt: payload?.expectedEndAt ?? null,
      })
      bus.patch({
        activeBreak: {
          id: res.break.id,
          startedAt: res.break.startedAt,
          reason: res.break.reason,
        },
        lastError: null,
      })
      void pingOnce()
      return { ok: true, break: res.break }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      bus.patch({ lastError: `break: ${msg}` })
      return { ok: false, error: msg }
    }
  })

  ipcMain.handle('marina:break:roster', async () => {
    try {
      const res = await fetchTeamRoster()
      return { ok: true, members: res.members }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg, members: [] }
    }
  })

  ipcMain.handle('marina:break:end', async () => {
    try {
      const res = await endActiveBreak()
      bus.patch({ activeBreak: null, lastError: null })
      void pingOnce()
      return { ok: true, ended: res.ended }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      bus.patch({ lastError: `break-end: ${msg}` })
      return { ok: false, error: msg }
    }
  })

  ipcMain.handle('marina:break:close', () => {
    breakWindow?.close()
    return true
  })
}
