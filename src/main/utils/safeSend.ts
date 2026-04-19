import { BrowserWindow } from 'electron'

export function safeSend(
  win: BrowserWindow | null | undefined,
  channel: string,
  ...args: unknown[]
): void {
  if (!win || win.isDestroyed()) return
  const wc = win.webContents
  if (wc.isDestroyed() || wc.isCrashed() || wc.isLoading()) return
  try {
    wc.send(channel, ...args)
  } catch {
    // render frame may have been disposed between the checks and the send
  }
}
