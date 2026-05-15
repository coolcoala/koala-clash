import { TitleBarOverlayOptions } from 'electron'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ipcErrorWrapper(response: any): any {
  if (typeof response === 'object' && 'invokeError' in response) {
    throw response.invokeError
  } else {
    return response
  }
}

export async function mihomoVersion(): Promise<ControllerVersion> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('mihomoVersion'))
}

export async function mihomoConfig(): Promise<ControllerConfigs> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('mihomoConfig'))
}

export async function mihomoCloseConnection(id: string): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('mihomoCloseConnection', id))
}

export async function mihomoCloseAllConnections(name?: string): Promise<void> {
  return ipcErrorWrapper(
    await window.electron.ipcRenderer.invoke('mihomoCloseAllConnections', name)
  )
}

export async function mihomoRules(): Promise<ControllerRules> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('mihomoRules'))
}

export async function mihomoProxies(): Promise<ControllerProxies> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('mihomoProxies'))
}

export async function mihomoGroups(): Promise<ControllerMixedGroup[]> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('mihomoGroups'))
}

export async function mihomoProxyProviders(): Promise<ControllerProxyProviders> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('mihomoProxyProviders'))
}

export async function mihomoUpdateProxyProviders(name: string): Promise<void> {
  return ipcErrorWrapper(
    await window.electron.ipcRenderer.invoke('mihomoUpdateProxyProviders', name)
  )
}

export async function mihomoRuleProviders(): Promise<ControllerRuleProviders> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('mihomoRuleProviders'))
}

export async function mihomoUpdateRuleProviders(name: string): Promise<void> {
  return ipcErrorWrapper(
    await window.electron.ipcRenderer.invoke('mihomoUpdateRuleProviders', name)
  )
}

export async function mihomoChangeProxy(
  group: string,
  proxy: string
): Promise<ControllerProxiesDetail> {
  return ipcErrorWrapper(
    await window.electron.ipcRenderer.invoke('mihomoChangeProxy', group, proxy)
  )
}

export async function mihomoUnfixedProxy(group: string): Promise<ControllerProxiesDetail> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('mihomoUnfixedProxy', group))
}

export async function mihomoUpgradeGeo(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('mihomoUpgradeGeo'))
}

export async function mihomoUpgradeUI(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('mihomoUpgradeUI'))
}

export async function mihomoUpgrade(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('mihomoUpgrade'))
}

export async function mihomoHotReloadConfig(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('mihomoHotReloadConfig'))
}

export async function mihomoProxyDelay(
  proxy: string,
  url?: string
): Promise<ControllerProxiesDelay> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('mihomoProxyDelay', proxy, url))
}

export async function mihomoGroupDelay(group: string, url?: string): Promise<ControllerGroupDelay> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('mihomoGroupDelay', group, url))
}

export async function patchMihomoConfig(patch: Partial<MihomoConfig>): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('patchMihomoConfig', patch))
}

export async function checkAutoRun(): Promise<boolean> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('checkAutoRun'))
}

export async function enableAutoRun(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('enableAutoRun'))
}

export async function disableAutoRun(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('disableAutoRun'))
}

export async function getAppConfig(force = false): Promise<AppConfig> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('getAppConfig', force))
}

export async function patchAppConfig(patch: Partial<AppConfig>): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('patchAppConfig', patch))
}

export async function getControledMihomoConfig(force = false): Promise<Partial<MihomoConfig>> {
  return ipcErrorWrapper(
    await window.electron.ipcRenderer.invoke('getControledMihomoConfig', force)
  )
}

export async function patchControledMihomoConfig(patch: Partial<MihomoConfig>): Promise<void> {
  return ipcErrorWrapper(
    await window.electron.ipcRenderer.invoke('patchControledMihomoConfig', patch)
  )
}

export async function getProfileConfig(force = false): Promise<ProfileConfig> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('getProfileConfig', force))
}

export async function setProfileConfig(config: ProfileConfig): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('setProfileConfig', config))
}

export async function getCurrentProfileItem(): Promise<ProfileItem> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('getCurrentProfileItem'))
}

export async function getProfileItem(id: string | undefined): Promise<ProfileItem> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('getProfileItem', id))
}

export async function changeCurrentProfile(id: string): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('changeCurrentProfile', id))
}

export async function addProfileItem(item: Partial<ProfileItem>): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('addProfileItem', item))
}

export async function removeProfileItem(id: string): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('removeProfileItem', id))
}

export async function updateProfileItem(item: ProfileItem): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('updateProfileItem', item))
}

export async function getProfileStr(id: string): Promise<string> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('getProfileStr', id))
}

export async function getFileStr(id: string): Promise<string> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('getFileStr', id))
}

export async function setFileStr(id: string, str: string): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('setFileStr', id, str))
}

export async function getRuleStr(id: string): Promise<string> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('getRuleStr', id))
}

export async function setRuleStr(id: string, str: string): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('setRuleStr', id, str))
}

export async function convertMrsRuleset(path: string, behavior: string): Promise<string> {
  return ipcErrorWrapper(
    await window.electron.ipcRenderer.invoke('convertMrsRuleset', path, behavior)
  )
}

export async function setProfileStr(id: string, str: string): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('setProfileStr', id, str))
}

export async function restartCore(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('restartCore'))
}

export async function restartMihomoConnections(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('restartMihomoConnections'))
}

export async function triggerSysProxy(enable: boolean, onlyActiveDevice: boolean): Promise<void> {
  return ipcErrorWrapper(
    await window.electron.ipcRenderer.invoke('triggerSysProxy', enable, onlyActiveDevice)
  )
}

export async function manualGrantCorePermition(
  cores?: ('mihomo' | 'mihomo-alpha')[]
): Promise<void> {
  return ipcErrorWrapper(
    await window.electron.ipcRenderer.invoke('manualGrantCorePermition', cores)
  )
}

export async function checkCorePermission(): Promise<{ mihomo: boolean; 'mihomo-alpha': boolean }> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('checkCorePermission'))
}

export async function checkElevateTask(): Promise<boolean> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('checkElevateTask'))
}

export async function needsFirstRunAdmin(): Promise<boolean> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('needsFirstRunAdmin'))
}

export async function restartAsAdmin(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('restartAsAdmin'))
}

export async function deleteElevateTask(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('deleteElevateTask'))
}

export async function revokeCorePermission(cores?: ('mihomo' | 'mihomo-alpha')[]): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('revokeCorePermission', cores))
}

export async function serviceStatus(): Promise<
  'running' | 'stopped' | 'not-installed' | 'unknown'
> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('serviceStatus'))
}

export async function testServiceConnection(): Promise<boolean> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('testServiceConnection'))
}

export async function initService(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('initService'))
}

export async function installService(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('installService'))
}

export async function uninstallService(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('uninstallService'))
}

export async function startService(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('startService'))
}

export async function restartService(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('restartService'))
}

export async function stopService(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('stopService'))
}

export async function findSystemMihomo(): Promise<string[]> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('findSystemMihomo'))
}

export async function getFilePath(ext: string[]): Promise<string[] | undefined> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('getFilePath', ext))
}

export async function readTextFile(filePath: string): Promise<string> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('readTextFile', filePath))
}

export async function getRuntimeConfigStr(): Promise<string> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('getRuntimeConfigStr'))
}

export async function getRawProfileStr(): Promise<string> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('getRawProfileStr'))
}

export async function getCurrentProfileStr(): Promise<string> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('getCurrentProfileStr'))
}

export async function getRuntimeConfig(): Promise<MihomoConfig> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('getRuntimeConfig'))
}

export async function checkUpdate(): Promise<AppVersion | undefined> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('checkUpdate'))
}

export async function downloadAndInstallUpdate(version: string): Promise<void> {
  return ipcErrorWrapper(
    await window.electron.ipcRenderer.invoke('downloadAndInstallUpdate', version)
  )
}

export async function cancelUpdate(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('cancelUpdate'))
}

export async function getVersion(): Promise<string> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('getVersion'))
}

export async function openUWPTool(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('openUWPTool'))
}

export async function setupFirewall(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('setupFirewall'))
}

export async function getInterfaces(): Promise<Record<string, NetworkInterfaceInfo[]>> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('getInterfaces'))
}

export async function setTitleBarOverlay(overlay: TitleBarOverlayOptions): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('setTitleBarOverlay', overlay))
}

export async function setAlwaysOnTop(alwaysOnTop: boolean): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('setAlwaysOnTop', alwaysOnTop))
}

export async function isAlwaysOnTop(): Promise<boolean> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('isAlwaysOnTop'))
}

export async function relaunchApp(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('relaunchApp'))
}

export async function quitWithoutCore(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('quitWithoutCore'))
}

export async function quitApp(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('quitApp'))
}

export async function notDialogQuit(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('notDialogQuit'))
}

export async function setNativeTheme(theme: 'system' | 'light' | 'dark'): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('setNativeTheme', theme))
}

export async function showTrayIcon(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('showTrayIcon'))
}

export async function closeTrayIcon(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('closeTrayIcon'))
}

export async function updateTrayIcon(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('updateTrayIcon'))
}

export async function setDockVisible(visible: boolean): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('setDockVisible', visible))
}

export async function showMainWindow(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('showMainWindow'))
}

export async function closeMainWindow(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('closeMainWindow'))
}

export async function triggerMainWindow(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('triggerMainWindow'))
}

export async function showFloatingWindow(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('showFloatingWindow'))
}

export async function closeFloatingWindow(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('closeFloatingWindow'))
}

export async function showContextMenu(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('showContextMenu'))
}

export async function openFile(id: string): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('openFile', id))
}

export async function openDevTools(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('openDevTools'))
}

export async function resetAppConfig(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('resetAppConfig'))
}

export async function createHeapSnapshot(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('createHeapSnapshot'))
}

export async function getUserAgent(): Promise<string> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('getUserAgent'))
}

export async function getAppName(appPath: string): Promise<string> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('getAppName', appPath))
}

export async function getImageDataURL(url: string): Promise<string> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('getImageDataURL', url))
}

export async function getIconDataURL(appPath: string): Promise<string> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('getIconDataURL', appPath))
}

export async function resolveThemes(): Promise<{ key: string; label: string; content: string }[]> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('resolveThemes'))
}

export async function fetchThemes(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('fetchThemes'))
}

export async function importThemes(files: string[]): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('importThemes', files))
}

export async function readTheme(theme: string): Promise<string> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('readTheme', theme))
}

export async function writeTheme(theme: string, css: string): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('writeTheme', theme, css))
}

export async function startNetworkDetection(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('startNetworkDetection'))
}

export async function stopNetworkDetection(): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('stopNetworkDetection'))
}

let applyThemeRunning = false
const waitList: string[] = []
export async function applyTheme(theme: string): Promise<void> {
  if (applyThemeRunning) {
    waitList.push(theme)
    return
  }
  applyThemeRunning = true
  try {
    return await ipcErrorWrapper(window.electron.ipcRenderer.invoke('applyTheme', theme))
  } finally {
    applyThemeRunning = false
    if (waitList.length > 0) {
      await applyTheme(waitList.shift() || '')
    }
  }
}

export async function registerShortcut(
  oldShortcut: string,
  newShortcut: string,
  action: string
): Promise<boolean> {
  return ipcErrorWrapper(
    await window.electron.ipcRenderer.invoke('registerShortcut', oldShortcut, newShortcut, action)
  )
}

export async function copyEnv(type: 'bash' | 'cmd' | 'powershell' | 'nushell'): Promise<void> {
  return ipcErrorWrapper(await window.electron.ipcRenderer.invoke('copyEnv', type))
}

export async function setMainLanguage(lang: string): Promise<void> {
  await window.electron.ipcRenderer.invoke('setLanguage', lang)
}

// Override window.alert to use toast notifications instead of system dialogs
async function alert<T>(msg: T): Promise<void> {
  const { toast } = await import('sonner')
  const msgStr = typeof msg === 'string' ? msg : JSON.stringify(msg)
  toast.error(msgStr)
}

window.alert = alert
