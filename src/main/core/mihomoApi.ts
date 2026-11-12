import axios, { AxiosInstance } from 'axios'
import { getAppConfig, getControledMihomoConfig } from '../config'
import { mainWindow } from '..'
import WebSocket from 'ws'
import { customTrayWindow, tray } from '../resolve/tray'
import { calcTraffic } from '../utils/calc'
import { getRuntimeConfig } from './factory'
import { floatingWindow } from '../resolve/floatingWindow'
import { mihomoIpcPath } from '../utils/dirs'
import { safeSend } from '../utils/safeSend'
import { debounce } from '../utils/debounce'
import { t } from '../utils/i18n'
import { CoreError, reportCoreError, setCoreStatus } from './status'

// Socket-level failures mean nothing is listening on the controller, i.e. the core is down
const CORE_UNREACHABLE_CODES = new Set(['ENOENT', 'ECONNREFUSED', 'ECONNRESET', 'EPIPE'])

let axiosIns: AxiosInstance = null!
let mihomoTrafficWs: WebSocket | null = null
let trafficRetry = 10
let mihomoLogsWs: WebSocket | null = null
let logsRetry = 10
let mihomoLogsLevel: LogLevel = 'info'
let mihomoConnectionsWs: WebSocket | null = null
let connectionsRetry = 10
// The core is up, so the connections stream may run
let connectionsAvailable = false
// The connections page is open and visible: nothing else shows the list
let connectionsWanted = false
let connectionsOpening: Promise<void> | null = null

// Closing a socket that is still connecting emits an error, which would be unhandled once the
// listeners are gone; leaving it alone instead keeps it open and streaming for nobody
const disposeWs = (ws: WebSocket): void => {
  ws.removeAllListeners()
  ws.on('error', () => {
    // nothing is waiting for this socket any more
  })
  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
    ws.close()
  }
}

export const getAxios = async (force: boolean = false): Promise<AxiosInstance> => {
  const currentSocketPath = mihomoIpcPath()

  if (axiosIns && axiosIns.defaults.socketPath !== currentSocketPath) {
    force = true
  }

  if (axiosIns && !force) return axiosIns

  axiosIns = axios.create({
    baseURL: `http://localhost`,
    socketPath: currentSocketPath,
    timeout: 15000,
    // The controller never redirects. Through follow-redirects, axios leaves an error listener on
    // the kept-alive socket after every request, and a few quick toggles in a row warned of a leak
    maxRedirects: 0
  })

  axiosIns.interceptors.response.use(
    (response) => {
      return response.data
    },
    (error) => {
      if (error.response && error.response.data) {
        return Promise.reject(error.response.data)
      }
      if (CORE_UNREACHABLE_CODES.has(error.code)) {
        return Promise.reject(new Error(t('error.coreUnreachable')))
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

// Error bodies returned by the controller, as opposed to transport failures
const isControllerError = (e: unknown): e is { message: string } =>
  typeof e === 'object' &&
  e !== null &&
  !(e instanceof Error) &&
  typeof (e as { message?: unknown }).message === 'string'

// A hot reload that failed this way left the previous config running; any other failure (a timeout,
// an unreachable core) says nothing about the config itself
export const isConfigRejection = (e: unknown): boolean =>
  (e instanceof CoreError && e.reason === 'config-invalid') || isControllerError(e)

export const mihomoHotReloadConfig = async (): Promise<void> => {
  const { generateProfile } = await import('./factory')
  const { getProfileConfig } = await import('../config')
  const { logLevel } = await generateProfile().catch((e) => {
    const error = new CoreError('config-invalid', e)
    reportCoreError(error)
    throw error
  })
  const { current } = await getProfileConfig()
  const { diffWorkDir = false } = await getAppConfig()
  const { mihomoWorkConfigPath } = await import('../utils/dirs')
  const configPath = diffWorkDir ? mihomoWorkConfigPath(current) : mihomoWorkConfigPath('work')
  const instance = await getAxios()
  try {
    await instance.put('/configs?force=true', { path: configPath })
  } catch (e) {
    // The controller answers with the parse error and keeps serving the previous config
    if (isControllerError(e)) {
      reportCoreError(new CoreError('config-invalid', e.message))
    }
    throw e
  }
  setCoreStatus('running')
  // The controller answers once the new config is applied, providers included
  safeSend(mainWindow, 'groupsUpdated')
  safeSend(mainWindow, 'rulesUpdated')
  await applyLogLevel(logLevel)
}

// Only the log level changed, so a hot reload, which also resets the fake-ip pool, is not needed
export const mihomoApplyLogLevel = async (): Promise<void> => {
  const { generateProfile } = await import('./factory')
  const { logLevel } = await generateProfile()
  try {
    await applyLogLevel(logLevel)
  } catch {
    // running core may not be ready; the level will apply on next restart/reload
  }
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
      // The tray menu window stays alive while hidden, it only needs the numbers while shown
      if (customTrayWindow?.isVisible()) {
        safeSend(customTrayWindow, 'mihomoTraffic', json)
      }
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

// The core can emit bursts of lines; one message per tick keeps both IPC and the log list cheap
const LOGS_FLUSH_INTERVAL = 100
// The window keeps this many lines, older ones in a burst would be dropped there anyway
const MAX_PENDING_LOGS = 500
let pendingLogs: ControllerLog[] = []
let logsFlushTimer: NodeJS.Timeout | null = null

const flushLogs = (): void => {
  if (logsFlushTimer) {
    clearTimeout(logsFlushTimer)
    logsFlushTimer = null
  }
  if (pendingLogs.length === 0) return
  const batch = pendingLogs
  pendingLogs = []
  safeSend(mainWindow, 'mihomoLogs', batch)
}

export const startMihomoLogs = (level: LogLevel): void => {
  mihomoLogsLevel = level
  mihomoLogs()
}

export const stopMihomoLogs = (): void => {
  // The last lines of a core that is going down are the ones worth reading
  flushLogs()
  if (mihomoLogsWs) {
    disposeWs(mihomoLogsWs)
    mihomoLogsWs = null
  }
}

export const applyLogLevel = async (level: LogLevel): Promise<void> => {
  // The core may still run a level patched earlier, so the config file can't tell whether it is current
  await patchMihomoConfig({ 'log-level': level })
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
      pendingLogs.push(JSON.parse(data) as ControllerLog)
    } catch {
      return
    }
    if (pendingLogs.length > MAX_PENDING_LOGS) {
      pendingLogs.splice(0, pendingLogs.length - MAX_PENDING_LOGS)
    }
    if (!logsFlushTimer) {
      logsFlushTimer = setTimeout(flushLogs, LOGS_FLUSH_INTERVAL)
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

const sendConnectionsDebounced = debounce((payload: ControllerConnections): void => {
  safeSend(mainWindow, 'mihomoConnections', payload)
}, 100)

// The full list is parsed and copied to the window on every tick, so it only runs while shown
const openConnections = async (): Promise<void> => {
  if (!connectionsAvailable || !connectionsWanted) return
  if (mihomoConnectionsWs || connectionsOpening) return
  connectionsOpening = mihomoConnections().finally(() => {
    connectionsOpening = null
  })
  await connectionsOpening
}

const closeConnections = (): void => {
  sendConnectionsDebounced.cancel()
  if (mihomoConnectionsWs) {
    disposeWs(mihomoConnectionsWs)
    mihomoConnectionsWs = null
  }
}

export const startMihomoConnections = async (): Promise<void> => {
  connectionsAvailable = true
  await openConnections()
}

export const stopMihomoConnections = (): void => {
  connectionsAvailable = false
  closeConnections()
}

export const restartMihomoConnections = async (): Promise<void> => {
  closeConnections()
  await openConnections()
}

export const setMihomoConnectionsWanted = async (wanted: boolean): Promise<void> => {
  connectionsWanted = wanted
  if (wanted) {
    await openConnections()
  } else {
    closeConnections()
  }
}

const mihomoConnections = async (): Promise<void> => {
  const { connectionInterval = 500 } = await getAppConfig()
  // The page may have closed or the core stopped while the config was read
  if (!connectionsAvailable || !connectionsWanted) return
  const ws = new WebSocket(`ws+unix:${mihomoIpcPath()}:/connections?interval=${connectionInterval}`)
  mihomoConnectionsWs = ws

  ws.onmessage = (e): void => {
    const data = e.data as string
    connectionsRetry = 10
    try {
      sendConnectionsDebounced(JSON.parse(data) as ControllerConnections)
    } catch {
      // ignore
    }
  }

  ws.onclose = (): void => {
    if (mihomoConnectionsWs !== ws) return
    mihomoConnectionsWs = null
    if (connectionsRetry) {
      connectionsRetry--
      openConnections().catch(() => {})
    }
  }

  ws.onerror = (): void => {
    // a failed socket always closes afterwards, and the close handler retries
  }
}
