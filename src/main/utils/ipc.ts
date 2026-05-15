import { app, ipcMain } from 'electron'
import {
  mihomoChangeProxy,
  mihomoCloseAllConnections,
  mihomoCloseConnection,
  mihomoGroupDelay,
  mihomoGroups,
  mihomoProxies,
  mihomoProxyDelay,
  mihomoProxyProviders,
  mihomoRuleProviders,
  mihomoRules,
  mihomoUnfixedProxy,
  mihomoUpdateProxyProviders,
  mihomoUpdateRuleProviders,
  mihomoUpgrade,
  mihomoUpgradeUI,
  mihomoUpgradeGeo,
  mihomoHotReloadConfig,
  mihomoVersion,
  mihomoConfig,
  patchMihomoConfig,
  restartMihomoConnections
} from '../core/mihomoApi'
import { checkAutoRun, disableAutoRun, enableAutoRun } from '../sys/autoRun'
import {
  getAppConfig,
  patchAppConfig,
  getControledMihomoConfig,
  patchControledMihomoConfig,
  getProfileConfig,
  getCurrentProfileItem,
  getProfileItem,
  addProfileItem,
  removeProfileItem,
  changeCurrentProfile,
  getProfileStr,
  getFileStr,
  setFileStr,
  getRuleStr,
  setRuleStr,
  setProfileStr,
  updateProfileItem,
  setProfileConfig,
  convertMrsRuleset
} from '../config'
import {
  manualGrantCorePermition,
  quitWithoutCore,
  restartCore,
  startNetworkDetection,
  stopNetworkDetection,
  revokeCorePermission,
  checkCorePermission
} from '../core/manager'
import { triggerSysProxy } from '../sys/sysproxy'
import { checkUpdate, downloadAndInstallUpdate, cancelUpdate } from '../resolve/autoUpdater'
import {
  checkElevateTask,
  deleteElevateTask,
  getFilePath,
  openFile,
  openUWPTool,
  readTextFile,
  resetAppConfig,
  setNativeTheme,
  setupFirewall
} from '../sys/misc'
import {
  serviceStatus,
  installService,
  uninstallService,
  startService,
  stopService,
  initService,
  testServiceConnection,
  restartService
} from '../service/manager'
import { findSystemMihomo } from './dirs'
import {
  getRuntimeConfig,
  getRuntimeConfigStr,
  getRawProfileStr,
  getCurrentProfileStr
} from '../core/factory'
import { getInterfaces } from '../sys/interface'
import { closeTrayIcon, copyEnv, setDockVisible, showTrayIcon, updateTrayIcon } from '../resolve/tray'
import { registerShortcut } from '../resolve/shortcut'
import {
  closeMainWindow,
  mainWindow,
  needsFirstRunAdmin,
  setNotQuitDialog,
  showError,
  showMainWindow,
  triggerMainWindow
} from '..'
import {
  applyTheme,
  fetchThemes,
  importThemes,
  readTheme,
  resolveThemes,
  writeTheme
} from '../resolve/theme'
import { logDir } from './dirs'
import path from 'path'
import v8 from 'v8'
import { getIconDataURL, getImageDataURL } from './icon'
import { closeFloatingWindow, showContextMenu, showFloatingWindow } from '../resolve/floatingWindow'
import { getAppName } from './appName'
import { getUserAgent } from './userAgent'
import { setLanguage } from './i18n'
import { updateApplicationMenu } from '../resolve/menu'

function ipcErrorWrapper<T>( // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (...args: any[]) => Promise<T> // eslint-disable-next-line @typescript-eslint/no-explicit-any
): (...args: any[]) => Promise<T | { invokeError: unknown }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (...args: any[]) => {
    try {
      return await fn(...args)
    } catch (e) {
      if (e && typeof e === 'object') {
        if ('message' in e) {
          return { invokeError: e.message }
        } else {
          return { invokeError: JSON.stringify(e) }
        }
      }
      if (e instanceof Error || typeof e === 'string') {
        return { invokeError: e }
      }
      return { invokeError: 'Unknown Error' }
    }
  }
}
export function registerIpcMainHandlers(): void {
  ipcMain.handle('mihomoVersion', ipcErrorWrapper(mihomoVersion))
  ipcMain.handle('mihomoConfig', ipcErrorWrapper(mihomoConfig))
  ipcMain.handle('mihomoCloseConnection', (_e, id) => ipcErrorWrapper(mihomoCloseConnection)(id))
  ipcMain.handle('mihomoCloseAllConnections', (_e, name) =>
    ipcErrorWrapper(mihomoCloseAllConnections)(name)
  )
  ipcMain.handle('mihomoRules', ipcErrorWrapper(mihomoRules))
  ipcMain.handle('mihomoProxies', ipcErrorWrapper(mihomoProxies))
  ipcMain.handle('mihomoGroups', ipcErrorWrapper(mihomoGroups))
  ipcMain.handle('mihomoProxyProviders', ipcErrorWrapper(mihomoProxyProviders))
  ipcMain.handle('mihomoUpdateProxyProviders', (_e, name) =>
    ipcErrorWrapper(mihomoUpdateProxyProviders)(name)
  )
  ipcMain.handle('mihomoRuleProviders', ipcErrorWrapper(mihomoRuleProviders))
  ipcMain.handle('mihomoUpdateRuleProviders', (_e, name) =>
    ipcErrorWrapper(mihomoUpdateRuleProviders)(name)
  )
  ipcMain.handle('mihomoChangeProxy', (_e, group, proxy) =>
    ipcErrorWrapper(mihomoChangeProxy)(group, proxy)
  )
  ipcMain.handle('mihomoUnfixedProxy', (_e, group) => ipcErrorWrapper(mihomoUnfixedProxy)(group))
  ipcMain.handle('mihomoUpgradeGeo', ipcErrorWrapper(mihomoUpgradeGeo))
  ipcMain.handle('mihomoUpgradeUI', ipcErrorWrapper(mihomoUpgradeUI))
  ipcMain.handle('mihomoUpgrade', ipcErrorWrapper(mihomoUpgrade))
  ipcMain.handle('mihomoHotReloadConfig', ipcErrorWrapper(mihomoHotReloadConfig))
  ipcMain.handle('mihomoProxyDelay', (_e, proxy, url) =>
    ipcErrorWrapper(mihomoProxyDelay)(proxy, url)
  )
  ipcMain.handle('mihomoGroupDelay', (_e, group, url) =>
    ipcErrorWrapper(mihomoGroupDelay)(group, url)
  )
  ipcMain.handle('patchMihomoConfig', (_e, patch) => ipcErrorWrapper(patchMihomoConfig)(patch))
  ipcMain.handle('checkAutoRun', ipcErrorWrapper(checkAutoRun))
  ipcMain.handle('enableAutoRun', ipcErrorWrapper(enableAutoRun))
  ipcMain.handle('disableAutoRun', ipcErrorWrapper(disableAutoRun))
  ipcMain.handle('getAppConfig', (_e, force) => ipcErrorWrapper(getAppConfig)(force))
  ipcMain.handle('patchAppConfig', (_e, config) => ipcErrorWrapper(patchAppConfig)(config))
  ipcMain.handle('getControledMihomoConfig', (_e, force) =>
    ipcErrorWrapper(getControledMihomoConfig)(force)
  )
  ipcMain.handle('patchControledMihomoConfig', (_e, config) =>
    ipcErrorWrapper(patchControledMihomoConfig)(config)
  )
  ipcMain.handle('getProfileConfig', (_e, force) => ipcErrorWrapper(getProfileConfig)(force))
  ipcMain.handle('setProfileConfig', (_e, config) => ipcErrorWrapper(setProfileConfig)(config))
  ipcMain.handle('getCurrentProfileItem', ipcErrorWrapper(getCurrentProfileItem))
  ipcMain.handle('getProfileItem', (_e, id) => ipcErrorWrapper(getProfileItem)(id))
  ipcMain.handle('getProfileStr', (_e, id) => ipcErrorWrapper(getProfileStr)(id))
  ipcMain.handle('getFileStr', (_e, path) => ipcErrorWrapper(getFileStr)(path))
  ipcMain.handle('setFileStr', (_e, path, str) => ipcErrorWrapper(setFileStr)(path, str))
  ipcMain.handle('getRuleStr', (_e, path) => ipcErrorWrapper(getRuleStr)(path))
  ipcMain.handle('setRuleStr', (_e, path, str) => ipcErrorWrapper(setRuleStr)(path, str))
  ipcMain.handle('convertMrsRuleset', (_e, path, behavior) =>
    ipcErrorWrapper(convertMrsRuleset)(path, behavior)
  )
  ipcMain.handle('setProfileStr', (_e, id, str) => ipcErrorWrapper(setProfileStr)(id, str))
  ipcMain.handle('updateProfileItem', (_e, item) => ipcErrorWrapper(updateProfileItem)(item))
  ipcMain.handle('changeCurrentProfile', (_e, id) => ipcErrorWrapper(changeCurrentProfile)(id))
  ipcMain.handle('addProfileItem', (_e, item) => ipcErrorWrapper(addProfileItem)(item))
  ipcMain.handle('removeProfileItem', (_e, id) => ipcErrorWrapper(removeProfileItem)(id))
  ipcMain.handle('restartCore', ipcErrorWrapper(restartCore))
  ipcMain.handle('restartMihomoConnections', ipcErrorWrapper(restartMihomoConnections))
  ipcMain.handle('triggerSysProxy', (_e, enable, onlyActiveDevice) =>
    ipcErrorWrapper(triggerSysProxy)(enable, onlyActiveDevice)
  )
  ipcMain.handle('manualGrantCorePermition', (_e, cores?: ('mihomo' | 'mihomo-alpha')[]) =>
    ipcErrorWrapper(manualGrantCorePermition)(cores)
  )
  ipcMain.handle('checkCorePermission', () => ipcErrorWrapper(checkCorePermission)())
  ipcMain.handle('revokeCorePermission', (_e, cores?: ('mihomo' | 'mihomo-alpha')[]) =>
    ipcErrorWrapper(revokeCorePermission)(cores)
  )
  ipcMain.handle('checkElevateTask', () => ipcErrorWrapper(checkElevateTask)())
  ipcMain.handle('deleteElevateTask', () => ipcErrorWrapper(deleteElevateTask)())
  ipcMain.handle('serviceStatus', () => ipcErrorWrapper(serviceStatus)())
  ipcMain.handle('testServiceConnection', () => ipcErrorWrapper(testServiceConnection)())
  ipcMain.handle('initService', () => ipcErrorWrapper(initService)())
  ipcMain.handle('installService', () => ipcErrorWrapper(installService)())
  ipcMain.handle('uninstallService', () => ipcErrorWrapper(uninstallService)())
  ipcMain.handle('startService', () => ipcErrorWrapper(startService)())
  ipcMain.handle('restartService', () => ipcErrorWrapper(restartService)())
  ipcMain.handle('stopService', () => ipcErrorWrapper(stopService)())
  ipcMain.handle('findSystemMihomo', () => findSystemMihomo())
  ipcMain.handle('getFilePath', (_e, ext) => getFilePath(ext))
  ipcMain.handle('readTextFile', (_e, filePath) => ipcErrorWrapper(readTextFile)(filePath))
  ipcMain.handle('getRuntimeConfigStr', ipcErrorWrapper(getRuntimeConfigStr))
  ipcMain.handle('getRawProfileStr', ipcErrorWrapper(getRawProfileStr))
  ipcMain.handle('getCurrentProfileStr', ipcErrorWrapper(getCurrentProfileStr))
  ipcMain.handle('getRuntimeConfig', ipcErrorWrapper(getRuntimeConfig))
  ipcMain.handle('downloadAndInstallUpdate', (_e, version) =>
    ipcErrorWrapper(downloadAndInstallUpdate)(version)
  )
  ipcMain.handle('checkUpdate', ipcErrorWrapper(checkUpdate))
  ipcMain.handle('cancelUpdate', ipcErrorWrapper(cancelUpdate))
  ipcMain.handle('getVersion', () => app.getVersion())
  ipcMain.handle('platform', () => process.platform)
  ipcMain.handle('openUWPTool', ipcErrorWrapper(openUWPTool))
  ipcMain.handle('setupFirewall', ipcErrorWrapper(setupFirewall))
  ipcMain.handle('getInterfaces', getInterfaces)
  ipcMain.handle('registerShortcut', (_e, oldShortcut, newShortcut, action) =>
    ipcErrorWrapper(registerShortcut)(oldShortcut, newShortcut, action)
  )
  ipcMain.handle('setNativeTheme', (_e, theme) => {
    setNativeTheme(theme)
  })
  ipcMain.handle('setTitleBarOverlay', (_e, overlay) =>
    ipcErrorWrapper(async (overlay): Promise<void> => {
      if (typeof mainWindow?.setTitleBarOverlay === 'function') {
        mainWindow.setTitleBarOverlay(overlay)
      }
    })(overlay)
  )
  ipcMain.handle('setAlwaysOnTop', (_e, alwaysOnTop) => {
    mainWindow?.setAlwaysOnTop(alwaysOnTop)
  })
  ipcMain.handle('isAlwaysOnTop', () => {
    return mainWindow?.isAlwaysOnTop()
  })
  ipcMain.handle('showTrayIcon', () => ipcErrorWrapper(showTrayIcon)())
  ipcMain.handle('closeTrayIcon', () => ipcErrorWrapper(closeTrayIcon)())
  ipcMain.handle('updateTrayIcon', () => ipcErrorWrapper(updateTrayIcon)())
  ipcMain.handle('setDockVisible', (_e, visible: boolean) => setDockVisible(visible))
  ipcMain.handle('showMainWindow', showMainWindow)
  ipcMain.handle('closeMainWindow', closeMainWindow)
  ipcMain.handle('triggerMainWindow', triggerMainWindow)
  ipcMain.handle('showFloatingWindow', () => ipcErrorWrapper(showFloatingWindow)())
  ipcMain.handle('closeFloatingWindow', () => ipcErrorWrapper(closeFloatingWindow)())
  ipcMain.handle('showContextMenu', () => ipcErrorWrapper(showContextMenu)())
  ipcMain.handle('openFile', (_e, id) => openFile(id))
  ipcMain.handle('openDevTools', () => {
    mainWindow?.webContents.openDevTools()
  })
  ipcMain.handle('createHeapSnapshot', () => {
    v8.writeHeapSnapshot(path.join(logDir(), `${Date.now()}.heapsnapshot`))
  })
  ipcMain.handle('getUserAgent', () => ipcErrorWrapper(getUserAgent)())
  ipcMain.handle('getAppName', (_e, appPath) => ipcErrorWrapper(getAppName)(appPath))
  ipcMain.handle('getImageDataURL', (_e, url) => ipcErrorWrapper(getImageDataURL)(url))
  ipcMain.handle('getIconDataURL', (_e, appPath) => ipcErrorWrapper(getIconDataURL)(appPath))
  ipcMain.handle('resolveThemes', () => ipcErrorWrapper(resolveThemes)())
  ipcMain.handle('fetchThemes', () => ipcErrorWrapper(fetchThemes)())
  ipcMain.handle('importThemes', (_e, file) => ipcErrorWrapper(importThemes)(file))
  ipcMain.handle('readTheme', (_e, theme) => ipcErrorWrapper(readTheme)(theme))
  ipcMain.handle('writeTheme', (_e, theme, css) => ipcErrorWrapper(writeTheme)(theme, css))
  ipcMain.handle('applyTheme', (_e, theme) => ipcErrorWrapper(applyTheme)(theme))
  ipcMain.handle('copyEnv', (_e, type) => ipcErrorWrapper(copyEnv)(type))
  ipcMain.handle('alert', (_e, msg) => {
    showError('Koala Clash', msg)
  })
  ipcMain.handle('resetAppConfig', resetAppConfig)
  ipcMain.handle('relaunchApp', () => {
    setNotQuitDialog()
    app.relaunch()
    app.quit()
  })
  ipcMain.handle('quitWithoutCore', ipcErrorWrapper(quitWithoutCore))
  ipcMain.handle('startNetworkDetection', ipcErrorWrapper(startNetworkDetection))
  ipcMain.handle('stopNetworkDetection', ipcErrorWrapper(stopNetworkDetection))
  ipcMain.handle('quitApp', () => app.quit())
  ipcMain.handle('notDialogQuit', () => {
    setNotQuitDialog()
    app.quit()
  })
  ipcMain.handle('setLanguage', async (_e, lang: string) => {
    setLanguage(lang)
    ipcMain.emit('updateTrayMenu')
    await updateApplicationMenu()
  })
  ipcMain.handle('windowMinimize', () => {
    mainWindow?.minimize()
  })
  ipcMain.handle('windowMaximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.handle('windowClose', () => {
    mainWindow?.close()
  })
  ipcMain.handle('windowIsMaximized', () => {
    return mainWindow?.isMaximized() ?? false
  })
  ipcMain.handle('needsFirstRunAdmin', () => needsFirstRunAdmin)
  ipcMain.handle('restartAsAdmin', async () => {
    if (process.platform !== 'win32') return
    const { exec } = await import('child_process')
    const exePath = process.execPath
    const args = process.argv.slice(1)
    const escapedExePath = exePath.replace(/'/g, "''")
    const argsString = args.map((a) => a.replace(/'/g, "''")).join("' '")
    const command = args.length > 0
      ? `powershell -NoProfile -Command "Start-Process -FilePath '${escapedExePath}' -ArgumentList '${argsString}' -Verb RunAs"`
      : `powershell -NoProfile -Command "Start-Process -FilePath '${escapedExePath}' -Verb RunAs"`
    exec(command, { windowsHide: true })
    setNotQuitDialog()
    app.quit()
  })
}
