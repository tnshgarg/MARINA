import { BrowserWindow, app } from 'electron'

/**
 * Menubar apps (LSUIElement on macOS) don't get window focus by default.
 * BrowserWindow.show() will create the window but it may sit behind other
 * apps. This helper does the full focus dance:
 *   1. Bring the app's activation policy forward (dock.show on mac)
 *   2. Force the window above other windows briefly
 *   3. show() + focus() + app.focus({steal:true})
 *   4. Drop alwaysOnTop after a tick so the user can drag it around
 */
export function bringToFront(win: BrowserWindow): void {
  if (process.platform === 'darwin' && app.dock?.show) {
    void app.dock.show()
  }

  win.setAlwaysOnTop(true, 'floating', 1)
  if (!win.isVisible()) {
    win.show()
  }
  win.focus()
  app.focus({ steal: true })

  // Drop alwaysOnTop after a beat so the window is just a normal window.
  setTimeout(() => {
    if (!win.isDestroyed()) {
      win.setAlwaysOnTop(false)
    }
  }, 600)
}

/**
 * Hide the dock if we're a menubar app and no visible windows are left.
 * Call this after closing a window so we go back to invisible mode.
 */
export function hideDockIfIdle(): void {
  if (process.platform !== 'darwin' || !app.dock?.hide) return
  // Defer one tick so the closing window has a chance to clear from BrowserWindow.getAllWindows()
  setTimeout(() => {
    const anyVisible = BrowserWindow.getAllWindows().some((w) => w.isVisible() && !w.isDestroyed())
    if (!anyVisible) {
      void app.dock.hide()
    }
  }, 50)
}
