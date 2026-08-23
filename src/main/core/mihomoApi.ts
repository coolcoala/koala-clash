import axios, { AxiosInstance } from 'axios'
import { getAppConfig, getControledMihomoConfig } from '../config'
import { mainWindow } from '..'
import WebSocket from 'ws'
import { tray } from '../resolve/tray'
import { calcTraffic } from '../utils/calc'
import { getRuntimeConfig } from './factory'
import { floatingWindow } from '../resolve/floatingWindow'
import { mihomoIpcPath } from '../utils/dirs'
import { safeSend } from '../utils/safeSend'
import { debounce } from '../utils/debounce'

let axiosIns: AxiosInstance = null!
let mihomoTrafficWs: WebSocket | null = null
let trafficRetry = 10
let mihomoMemoryWs: WebSocket | null = null
let memoryRetry = 10
let mihomoLogsWs: WebSocket | null = null
let logsRetry = 10
let mihomoLogsLevel: LogLevel = 'info'
let mihomoConnectionsWs: WebSocket | null = null
let connectionsRetry = 10

export const getAxios = async (force: boolean = false): Promise<AxiosInstance> => {
  const currentSocketPath = mihomoIpcPath()

  if (axiosIns && axiosIns.defaults.socketPath !== currentSocketPath) {
    force = true
  }

  if (axiosIns && !force) return axiosIns

  axiosIns = axios.create({
    baseURL: `http://localhost`,
    socketPath: currentSocketPath,
    timeout: 15000
  })

  axiosIns.interceptors.response.use(
    (response) => {
      return response.data
    },
    (error) => {
      if (error.response && error.response.data) {
        return Promise.reject(error.response.data)
      }
      return Promise.reject(error)
    }
  )
  return axiosIns
}

export async function mihomoVersion(): Promise<ControllerVersion> {
  const instance = await getAxios()
  return await instance.get('/version')
}

export const mihomoConfig = async (): Promise<ControllerConfigs> => {
  const instance = await getAxios()
  return await instance.get('/configs')
}

export const patchMihomoConfig = async (patch: Partial<ControllerConfigs>): Promise<void> => {
  const instance = await getAxios()
  return await instance.patch('/configs', patch)
}

export const mihomoCloseConnection = async (id: string): Promise<void> => {
  const instance = await getAxios()
  return await instance.delete(`/connections/${encodeURIComponent(id)}`)
}

export const mihomoGetConnections = async (): Promise<ControllerConnections> => {
  const instance = await getAxios()
  return await instance.get('/connections')
}

export const mihomoCloseAllConnections = async (name?: string): Promise<void> => {
  const instance = await getAxios()
  if (name) {
    const connectionsInfo = await mihomoGetConnections()
    const targetConnections =
      connectionsInfo?.connections?.filter((conn) => conn.chains && conn.chains.includes(name)) ||
      []
    for (const conn of targetConnections) {
      try {
        await mihomoCloseConnection(conn.id)
      } catch (error) {
        // ignore
      }
    }
  } else {
    return await instance.delete('/connections')
  }
}

export const mihomoRules = async (): Promise<ControllerRules> => {
  const instance = await getAxios()
  return await instance.get('/rules')
}

export const mihomoProxies = async (): Promise<ControllerProxies> => {
  const instance = await getAxios()
  return await instance.get('/proxies')
}

const isControllerGroupDetail = (
  proxy: ControllerProxiesDetail | ControllerGroupDetail | undefined
): proxy is ControllerGroupDetail => {
  return Boolean(proxy && 'all' in proxy)
}

const PROVIDER_DETAIL_FETCH_THRESHOLD = 8

const resolveProviderProxies = async (
  names: Set<string>,
  providerNames: Set<string>,
  fallbackToAllProviders: boolean
): Promise<Record<string, ControllerProxiesDetail>> => {
  if (names.size === 0) return {}
  let providers: ControllerProxyProviderDetail[]
  try {
    providers =
      fallbackToAllProviders || providerNames.size > PROVIDER_DETAIL_FETCH_THRESHOLD
        ? Object.values((await mihomoProxyProviders()).providers)
        : await Promise.all([...providerNames].map((name) => mihomoProxyProvider(name)))
  } catch {
    return {}
  }
  const providerProxies: Record<string, ControllerProxiesDetail> = {}
  providers.forEach((provider) => {
    provider.proxies?.forEach((proxy) => {
      if (names.has(proxy.name)) {
        providerProxies[proxy.name] = proxy
      }
    })
  })
  return providerProxies
}

export const mihomoGroups = async (): Promise<ControllerMixedGroup[]> => {
  const { mode = 'rule' } = await getControledMihomoConfig()
  if (mode === 'direct') return []
  const [proxies, runtime] = await Promise.all([mihomoProxies(), getRuntimeConfig()])

  const serverDescriptionMap = new Map<string, string>()
  if (runtime?.proxies) {
    for (const p of runtime.proxies as { name?: string; serverDescription?: string }[]) {
      if (p.name && p.serverDescription) {
        serverDescriptionMap.set(p.name, p.serverDescription)
      }
    }
  }

  const enrichProxy = (
    proxy: ControllerProxiesDetail | ControllerGroupDetail
  ): ControllerProxiesDetail | ControllerGroupDetail => {
    if (!('all' in proxy)) {
      const desc = serverDescriptionMap.get(proxy.name)
      if (desc) {
        proxy.serverDescription = desc
      }
    }
    return proxy
  }

  const rawGroups: { group: ControllerGroupDetail; providers: string[] }[] = []
  runtime?.['proxy-groups']?.forEach((group: { name: string; url?: string; use?: string[] }) => {
    const { name, url, use } = group
    if (name === 'GLOBAL') return
    const detail = proxies.proxies[name]
    if (isControllerGroupDetail(detail) && !detail.hidden) {
      rawGroups.push({ group: { ...detail, testUrl: url }, providers: use || [] })
    }
  })
  if (mode === 'global') {
    const newGlobal = proxies.proxies['GLOBAL']
    if (isControllerGroupDetail(newGlobal) && !newGlobal.hidden) {
      const globalConfig = (
        runtime?.['proxy-groups'] as { name: string; url?: string }[] | undefined
      )?.find((g) => g.name === 'GLOBAL')
      rawGroups.unshift({
        group: { ...newGlobal, testUrl: globalConfig?.url ?? newGlobal.testUrl },
        // GLOBAL holds every node and has no `use`, so providers can't be narrowed down
        providers: []
      })
    }
  }

  const missingProxyNames = new Set<string>()
  const providerNames = new Set<string>()
  let fallbackToAllProviders = false
  rawGroups.forEach(({ group, providers }) => {
    group.all.forEach((name) => {
      if (proxies.proxies[name]) return
      missingProxyNames.add(name)
      if (providers.length > 0) {
        providers.forEach((provider) => providerNames.add(provider))
      } else {
        fallbackToAllProviders = true
      }
    })
  })
  const providerProxies = await resolveProviderProxies(
    missingProxyNames,
    providerNames,
    fallbackToAllProviders
  )

  return rawGroups.map(({ group }) => ({
    ...group,
    all: group.all
      .map((name) => proxies.proxies[name] || providerProxies[name])
      .filter((proxy): proxy is ControllerProxiesDetail | ControllerGroupDetail => Boolean(proxy))
      .map(enrichProxy)
  }))
}

export const mihomoProxyProviders = async (): Promise<ControllerProxyProviders> => {
  const instance = await getAxios()
  return await instance.get('/providers/proxies')
}

const mihomoProxyProvider = async (name: string): Promise<ControllerProxyProviderDetail> => {
  const instance = await getAxios()
  return await instance.get(`/providers/proxies/${encodeURIComponent(name)}`)
}

export const mihomoUpdateProxyProviders = async (name: string): Promise<void> => {
  const instance = await getAxios()
  return await instance.put(`/providers/proxies/${encodeURIComponent(name)}`)
}

export const mihomoRuleProviders = async (): Promise<ControllerRuleProviders> => {
  const instance = await getAxios()
  return await instance.get('/providers/rules')
}

export const mihomoUpdateRuleProviders = async (name: string): Promise<void> => {
  const instance = await getAxios()
  return await instance.put(`/providers/rules/${encodeURIComponent(name)}`)
}

export const mihomoChangeProxy = async (
  group: string,
  proxy: string
): Promise<ControllerProxiesDetail> => {
  const instance = await getAxios()
  return await instance.put(`/proxies/${encodeURIComponent(group)}`, { name: proxy })
}

export const mihomoUnfixedProxy = async (group: string): Promise<ControllerProxiesDetail> => {
  const instance = await getAxios()
  return await instance.delete(`/proxies/${encodeURIComponent(group)}`)
}

export const mihomoProxyDelay = async (
  proxy: string,
  url?: string,
  provider?: string
): Promise<ControllerProxiesDelay> => {
  const appConfig = await getAppConfig()
  const { delayTestUrl, delayTestTimeout } = appConfig
  const instance = await getAxios()
  const path = provider
    ? `/providers/proxies/${encodeURIComponent(provider)}/${encodeURIComponent(proxy)}/healthcheck`
    : `/proxies/${encodeURIComponent(proxy)}/delay`
  return await instance.get(path, {
    params: {
      url: url || delayTestUrl || 'https://www.gstatic.com/generate_204',
      timeout: delayTestTimeout || 5000
    }
  })
}

export const mihomoGroupDelay = async (
  group: string,
  url?: string
): Promise<ControllerGroupDelay> => {
  const appConfig = await getAppConfig()
  const { delayTestUrl, delayTestTimeout } = appConfig
  const instance = await getAxios()
  return await instance.get(`/group/${encodeURIComponent(group)}/delay`, {
    params: {
      url: url || delayTestUrl || 'https://www.gstatic.com/generate_204',
      timeout: delayTestTimeout || 5000
    }
  })
}

export const mihomoUpgrade = async (): Promise<void> => {
  if (process.platform === 'win32') await patchMihomoConfig({ 'log-level': 'info' })
  const instance = await getAxios()
  return await instance.post('/upgrade')
}

export const mihomoUpgradeGeo = async (): Promise<void> => {
  const instance = await getAxios()
  return await instance.post('/upgrade/geo')
}

export const mihomoUpgradeUI = async (): Promise<void> => {
  const instance = await getAxios()
  return await instance.post('/upgrade/ui')
}

export const mihomoHotReloadConfig = async (): Promise<void> => {
  const { generateProfile } = await import('./factory')
  const { getProfileConfig } = await import('../config')
  const { resetProviderTracking } = await import('./manager')
  const { logLevel } = await generateProfile()
  const { current } = await getProfileConfig()
  const { diffWorkDir = false } = await getAppConfig()
  const { mihomoWorkConfigPath } = await import('../utils/dirs')
  const configPath = diffWorkDir ? mihomoWorkConfigPath(current) : mihomoWorkConfigPath('work')
  await resetProviderTracking()
  const instance = await getAxios()
  await instance.put('/configs?force=true', { path: configPath })
  await applyLogLevel(logLevel)
}

export const startMihomoTraffic = async (): Promise<void> => {
  await mihomoTraffic()
}

export const stopMihomoTraffic = (): void => {
  if (mihomoTrafficWs) {
    mihomoTrafficWs.removeAllListeners()
    if (mihomoTrafficWs.readyState === WebSocket.OPEN) {
      mihomoTrafficWs.close()
    }
    mihomoTrafficWs = null
  }
}

const mihomoTraffic = async (): Promise<void> => {
  mihomoTrafficWs = new WebSocket(`ws+unix:${mihomoIpcPath()}:/traffic`)

  mihomoTrafficWs.onmessage = async (e): Promise<void> => {
    const data = e.data as string
    const json = JSON.parse(data) as ControllerTraffic
    trafficRetry = 10
    try {
      safeSend(mainWindow, 'mihomoTraffic', json)
      if (process.platform !== 'linux') {
        tray?.setToolTip(
          '↑' +
            `${calcTraffic(json.up)}/s`.padStart(9) +
            '\n↓' +
            `${calcTraffic(json.down)}/s`.padStart(9)
        )
      }
      safeSend(floatingWindow, 'mihomoTraffic', json)
    } catch {
      // ignore
    }
  }

  mihomoTrafficWs.onclose = (): void => {
    if (trafficRetry) {
      trafficRetry--
      mihomoTraffic()
    }
  }

  mihomoTrafficWs.onerror = (): void => {
    if (mihomoTrafficWs) {
      mihomoTrafficWs.close()
      mihomoTrafficWs = null
    }
  }
}

export const startMihomoMemory = async (): Promise<void> => {
  await mihomoMemory()
}

export const stopMihomoMemory = (): void => {
  if (mihomoMemoryWs) {
    mihomoMemoryWs.removeAllListeners()
    if (mihomoMemoryWs.readyState === WebSocket.OPEN) {
      mihomoMemoryWs.close()
    }
    mihomoMemoryWs = null
  }
}

const mihomoMemory = async (): Promise<void> => {
  mihomoMemoryWs = new WebSocket(`ws+unix:${mihomoIpcPath()}:/memory`)

  mihomoMemoryWs.onmessage = (e): void => {
    const data = e.data as string
    memoryRetry = 10
    try {
      safeSend(mainWindow, 'mihomoMemory', JSON.parse(data) as ControllerMemory)
    } catch {
      // ignore
    }
  }

  mihomoMemoryWs.onclose = (): void => {
    if (memoryRetry) {
      memoryRetry--
      mihomoMemory()
    }
  }

  mihomoMemoryWs.onerror = (): void => {
    if (mihomoMemoryWs) {
      mihomoMemoryWs.close()
      mihomoMemoryWs = null
    }
  }
}

export const startMihomoLogs = (level: LogLevel): void => {
  mihomoLogsLevel = level
  mihomoLogs()
}

export const stopMihomoLogs = (): void => {
  if (mihomoLogsWs) {
    mihomoLogsWs.removeAllListeners()
    if (mihomoLogsWs.readyState === WebSocket.OPEN) {
      mihomoLogsWs.close()
    }
    mihomoLogsWs = null
  }
}

export const applyLogLevel = async (level: LogLevel): Promise<void> => {
  if (level !== (await getRuntimeConfig())?.['log-level']) {
    await patchMihomoConfig({ 'log-level': level })
  }
  if (mihomoLogsWs && level !== mihomoLogsLevel) {
    stopMihomoLogs()
    startMihomoLogs(level)
  }
}

const mihomoLogs = (): void => {
  mihomoLogsWs = new WebSocket(`ws+unix:${mihomoIpcPath()}:/logs?level=${mihomoLogsLevel}`)

  mihomoLogsWs.onmessage = (e): void => {
    const data = e.data as string
    logsRetry = 10
    try {
      safeSend(mainWindow, 'mihomoLogs', JSON.parse(data) as ControllerLog)
    } catch {
      // ignore
    }
  }

  mihomoLogsWs.onclose = (): void => {
    if (logsRetry) {
      logsRetry--
      mihomoLogs()
    }
  }

  mihomoLogsWs.onerror = (): void => {
    if (mihomoLogsWs) {
      mihomoLogsWs.close()
      mihomoLogsWs = null
    }
  }
}

export const startMihomoConnections = async (): Promise<void> => {
  await mihomoConnections()
}

const sendConnectionsDebounced = debounce((payload: ControllerConnections): void => {
  safeSend(mainWindow, 'mihomoConnections', payload)
}, 100)

export const stopMihomoConnections = (): void => {
  sendConnectionsDebounced.cancel()
  if (mihomoConnectionsWs) {
    mihomoConnectionsWs.removeAllListeners()
    if (mihomoConnectionsWs.readyState === WebSocket.OPEN) {
      mihomoConnectionsWs.close()
    }
    mihomoConnectionsWs = null
  }
}

export const restartMihomoConnections = async (): Promise<void> => {
  stopMihomoConnections()
  await startMihomoConnections()
}

const mihomoConnections = async (): Promise<void> => {
  const { connectionInterval = 500 } = await getAppConfig()
  mihomoConnectionsWs = new WebSocket(
    `ws+unix:${mihomoIpcPath()}:/connections?interval=${connectionInterval}`
  )

  mihomoConnectionsWs.onmessage = (e): void => {
    const data = e.data as string
    connectionsRetry = 10
    try {
      sendConnectionsDebounced(JSON.parse(data) as ControllerConnections)
    } catch {
      // ignore
    }
  }

  mihomoConnectionsWs.onclose = (): void => {
    if (connectionsRetry) {
      connectionsRetry--
      mihomoConnections()
    }
  }

  mihomoConnectionsWs.onerror = (): void => {
    if (mihomoConnectionsWs) {
      mihomoConnectionsWs.close()
      mihomoConnectionsWs = null
    }
  }
}
