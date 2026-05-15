import { app, globalShortcut, ipcMain, Notification } from 'electron'
import { t } from '../utils/i18n'
import { mainWindow, setNotQuitDialog, triggerMainWindow } from '..'
import {
  getAppConfig,
  getControledMihomoConfig,
  getCurrentProfileItem,
  patchAppConfig,
  patchControledMihomoConfig
} from '../config'
import { triggerSysProxy } from '../sys/sysproxy'
import { quitWithoutCore } from '../core/manager'
import { floatingWindow, triggerFloatingWindow } from './floatingWindow'
import { updateTrayIcon } from './tray'

export async function registerShortcut(
  oldShortcut: string,
  newShortcut: string,
  action: string
): Promise<boolean> {
  if (oldShortcut !== '') {
    globalShortcut.unregister(oldShortcut)
  }
  if (newShortcut === '') {
    return true
  }
  switch (action) {
    case 'showWindowShortcut': {
      return globalShortcut.register(newShortcut, async () => {
        await triggerMainWindow()
      })
    }
    case 'showFloatingWindowShortcut': {
      return globalShortcut.register(newShortcut, async () => {
        await triggerFloatingWindow()
      })
    }
    case 'triggerSysProxyShortcut': {
      return globalShortcut.register(newShortcut, async () => {
        const {
          proxyMode = false,
          sysProxy: { enable: writeSysProxy = true } = { enable: true },
          onlyActiveDevice = false
        } = await getAppConfig()
        const enable = !proxyMode
        try {
          if (enable) {
            await patchAppConfig({ proxyMode: true })
            if (writeSysProxy) {
              await triggerSysProxy(true, onlyActiveDevice)
            }
          } else {
            if (writeSysProxy) {
              await triggerSysProxy(false, onlyActiveDevice)
            }
            await patchAppConfig({ proxyMode: false })
          }
          new Notification({
            title: enable ? t('notification.sysProxyEnabled') : t('notification.sysProxyDisabled')
          }).show()
          mainWindow?.webContents.send('appConfigUpdated')
          floatingWindow?.webContents.send('appConfigUpdated')
          await updateTrayIcon()
        } catch {
          // ignore
        } finally {
          ipcMain.emit('updateTrayMenu')
        }
      })
    }
    case 'triggerTunShortcut': {
      return globalShortcut.register(newShortcut, async () => {
        const { tun } = await getControledMihomoConfig()
        const enable = tun?.enable ?? false
        try {
          if (!enable) {
            await patchControledMihomoConfig({ tun: { enable: !enable }, dns: { enable: true } })
          } else {
            await patchControledMihomoConfig({ tun: { enable: !enable } })
          }
          new Notification({
            title: !enable ? t('notification.tunEnabled') : t('notification.tunDisabled')
          }).show()
          mainWindow?.webContents.send('controledMihomoConfigUpdated')
          floatingWindow?.webContents.send('appConfigUpdated')
          await updateTrayIcon()
        } catch {
          // ignore
        } finally {
          ipcMain.emit('updateTrayMenu')
        }
      })
    }
    case 'ruleModeShortcut': {
      return globalShortcut.register(newShortcut, async () => {
        await patchControledMihomoConfig({ mode: 'rule' })
        new Notification({
          title: t('notification.switchedToRuleMode')
        }).show()
        mainWindow?.webContents.send('controledMihomoConfigUpdated')
        ipcMain.emit('updateTrayMenu')
      })
    }
    case 'globalModeShortcut': {
      return globalShortcut.register(newShortcut, async () => {
        const profile = await getCurrentProfileItem()
        if (profile.globalMode === false) return
        await patchControledMihomoConfig({ mode: 'global' })
        new Notification({
          title: t('notification.switchedToGlobalMode')
        }).show()
        mainWindow?.webContents.send('controledMihomoConfigUpdated')
        ipcMain.emit('updateTrayMenu')
      })
    }
    case 'directModeShortcut': {
      return globalShortcut.register(newShortcut, async () => {
        await patchControledMihomoConfig({ mode: 'direct' })
        new Notification({
          title: t('notification.switchedToDirectMode')
        }).show()
        mainWindow?.webContents.send('controledMihomoConfigUpdated')
        ipcMain.emit('updateTrayMenu')
      })
    }
    case 'quitWithoutCoreShortcut': {
      return globalShortcut.register(newShortcut, async () => {
        setNotQuitDialog()
        await quitWithoutCore()
      })
    }
    case 'restartAppShortcut': {
      return globalShortcut.register(newShortcut, () => {
        setNotQuitDialog()
        app.relaunch()
        app.quit()
      })
    }
  }
  throw new Error('Unknown action')
}

export async function initShortcut(): Promise<void> {
  const {
    showFloatingWindowShortcut,
    showWindowShortcut,
    triggerSysProxyShortcut,
    triggerTunShortcut,
    ruleModeShortcut,
    globalModeShortcut,
    directModeShortcut,
    quitWithoutCoreShortcut,
    restartAppShortcut
  } = await getAppConfig()
  if (showWindowShortcut) {
    try {
      await registerShortcut('', showWindowShortcut, 'showWindowShortcut')
    } catch {
      // ignore
    }
  }
  if (showFloatingWindowShortcut) {
    try {
      await registerShortcut('', showFloatingWindowShortcut, 'showFloatingWindowShortcut')
    } catch {
      // ignore
    }
  }
  if (triggerSysProxyShortcut) {
    try {
      await registerShortcut('', triggerSysProxyShortcut, 'triggerSysProxyShortcut')
    } catch {
      // ignore
    }
  }
  if (triggerTunShortcut) {
    try {
      await registerShortcut('', triggerTunShortcut, 'triggerTunShortcut')
    } catch {
      // ignore
    }
  }
  if (ruleModeShortcut) {
    try {
      await registerShortcut('', ruleModeShortcut, 'ruleModeShortcut')
    } catch {
      // ignore
    }
  }
  if (globalModeShortcut) {
    try {
      await registerShortcut('', globalModeShortcut, 'globalModeShortcut')
    } catch {
      // ignore
    }
  }
  if (directModeShortcut) {
    try {
      await registerShortcut('', directModeShortcut, 'directModeShortcut')
    } catch {
      // ignore
    }
  }
  if (quitWithoutCoreShortcut) {
    try {
      await registerShortcut('', quitWithoutCoreShortcut, 'quitWithoutCoreShortcut')
    } catch {
      // ignore
    }
  }
  if (restartAppShortcut) {
    try {
      await registerShortcut('', restartAppShortcut, 'restartAppShortcut')
    } catch {
      // ignore
    }
  }
}
