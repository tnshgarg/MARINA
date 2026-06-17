import { BrowserWindow, ipcMain, Notification } from 'electron'
import path from 'path'
import { postDeliverable } from './api'
import type { LogDeliverableInput } from './api'
import { bus } from './state'
import { bringToFront, hideDockIfIdle } from './window-utils'

/**
 * "Mark work as done" — the fastest path for an employee to log a shipped
 * deliverable from the desktop. Mirrors the web app's LogDeliverableCard but
 * lives in the menubar so it stays one click away while focused on real work.
 *
 * Why we have this in the agent: managers care less about "what you typed
 * in standup" and more about "what you ACTUALLY shipped today". The agent
 * also pins the active screenshot at the moment of logging — the web app
 * shows that timestamp to the manager as honest verification ("this was
 * pinned at 2:14pm when they marked it done"). Logging from the desktop
 * keeps the screenshot pin recent and relevant.
 */
let doneWindow: BrowserWindow | null = null

export function openDoneWindow(): void {
  if (doneWindow) {
    bringToFront(doneWindow)
    return
  }
  doneWindow = new BrowserWindow({
    width: 480,
    height: 420,
    title: 'Mark work as done',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-done.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  doneWindow.removeMenu()
  doneWindow.loadFile(path.join(__dirname, '..', 'renderer', 'done.html'))
  doneWindow.once('ready-to-show', () => {
    if (doneWindow) bringToFront(doneWindow)
  })
  doneWindow.on('closed', () => {
    doneWindow = null
    hideDockIfIdle()
  })
}

export function registerDoneIpc(): void {
  ipcMain.handle('marina:done:state', () => {
    const s = bus.get()
    return { userLogin: s.userLogin, paired: s.paired }
  })

  ipcMain.handle('marina:done:submit', async (_e, payload: LogDeliverableInput) => {
    const title = (payload?.title ?? '').trim()
    if (title.length < 10) {
      return {
        ok: false,
        error: 'Tell us a bit more — at least 10 characters so your manager can recognise it.',
      }
    }
    const url = typeof payload?.url === 'string' && payload.url.trim().length > 0 ? payload.url.trim() : null
    try {
      const res = await postDeliverable({ title, url })
      if (!res.ok) {
        return {
          ok: false,
          error: res.duplicateOf
            ? 'Looks like you already logged this in the last 4 hours.'
            : 'Could not log your deliverable.',
        }
      }
      // Toast the user — same UX shape as the punch flow.
      try {
        const n = new Notification({
          title: 'Logged on Marina',
          body: title.length > 80 ? `${title.slice(0, 78)}…` : title,
          silent: true,
        })
        n.show()
      } catch {
        // No-op if notifications aren't permitted.
      }
      return { ok: true, deliverable: res.deliverable }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      bus.patch({ lastError: `done: ${msg}` })
      return { ok: false, error: msg }
    }
  })

  ipcMain.handle('marina:done:cancel', () => {
    doneWindow?.close()
  })
}
