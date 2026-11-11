import { mihomoHotReloadConfig, triggerSysProxy, updateTrayIcon } from '@renderer/utils/ipc'

interface ConnectionDeps {
  appConfig?: AppConfig
  controledMihomoConfig?: Partial<MihomoConfig>
  patchAppConfig: (value: Partial<AppConfig>) => Promise<void>
  patchControledMihomoConfig: (value: Partial<MihomoConfig>) => Promise<void>
}

// Traffic goes through the app while either TUN or the system proxy mode is on
export function isConnectionOn(
  appConfig?: AppConfig,
  controledMihomoConfig?: Partial<MihomoConfig>
): boolean {
  return (controledMihomoConfig?.tun?.enable ?? false) || (appConfig?.proxyMode ?? false)
}

// A manual system proxy points at the mixed port, so with that port closed there is nothing to turn on
export function isConnectionSwitchBlocked(
  appConfig?: AppConfig,
  controledMihomoConfig?: Partial<MihomoConfig>
): boolean {
  const { mainSwitchMode = 'tun', sysProxy } = appConfig || {}
  const { enable: writeSysProxy = true, mode } = sysProxy || {}
  return (
    mainSwitchMode === 'sysproxy' &&
    writeSysProxy &&
    mode == 'manual' &&
    controledMihomoConfig?.['mixed-port'] == 0
  )
}

// The main switch of the home screen and the tray menu
export async function setConnectionEnabled(enable: boolean, deps: ConnectionDeps): Promise<void> {
  const { appConfig, controledMihomoConfig, patchAppConfig, patchControledMihomoConfig } = deps
  const {
    mainSwitchMode = 'tun',
    sysProxy,
    proxyMode = false,
    onlyActiveDevice = false
  } = appConfig || {}
  const { enable: writeSysProxy = true } = sysProxy || {}

  if (enable) {
    if (mainSwitchMode === 'tun') {
      await patchControledMihomoConfig({ tun: { enable: true }, dns: { enable: true } })
      await mihomoHotReloadConfig()
    } else {
      if (isConnectionSwitchBlocked(appConfig, controledMihomoConfig)) return
      await patchAppConfig({ proxyMode: true })
      await mihomoHotReloadConfig()
      if (writeSysProxy) {
        await triggerSysProxy(true, onlyActiveDevice)
      }
    }
  } else {
    const tunWasEnabled = controledMihomoConfig?.tun?.enable ?? false
    const proxyModeWasEnabled = proxyMode
    if (tunWasEnabled) {
      await patchControledMihomoConfig({ tun: { enable: false } })
    }
    if (proxyModeWasEnabled) {
      if (writeSysProxy) {
        await triggerSysProxy(false, onlyActiveDevice)
      }
      await patchAppConfig({ proxyMode: false })
    }
    if (tunWasEnabled || proxyModeWasEnabled) {
      await mihomoHotReloadConfig()
    }
  }
  window.electron.ipcRenderer.send('updateFloatingWindow')
  window.electron.ipcRenderer.send('updateTrayMenu')
  await updateTrayIcon()
}
