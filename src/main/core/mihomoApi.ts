import axios, { AxiosInstance } from 'axios'
import { getAppConfig, getControledMihomoConfig } from '../config'
import { mainWindow } from '..'
import WebSocket from 'ws'
import { tray } from '../resolve/tray'
import { calcTraffic } from '../utils/calc'
import { getRuntimeConfig } from './factory'
import { floatingWindow } from '../resolve/floatingWindow'
import { mihomoIpcPath } from '../utils/dirs'

let axiosIns: AxiosInstance = null!
let mihomoTrafficWs: WebSocket | null = null
let trafficRetry = 10
let trafficReconnectTimer: NodeJS.Timeout | null = null
let mihomoMemoryWs: WebSocket | null = null
let memoryRetry = 10
let memoryReconnectTimer: NodeJS.Timeout | null = null
let mihomoLogsWs: WebSocket | null = null
let logsRetry = 10
let logsReconnectTimer: NodeJS.Timeout | null = null
let mihomoConnectionsWs: WebSocket | null = null
let connectionsRetry = 10
let connectionsReconnectTimer: NodeJS.Timeout | null = null
let logsSubscribers = 0
let connectionsSubscribers = 0
let totalUpTraffic = 0
let totalDownTraffic = 0

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

export const mihomoGroups = async (): Promise<ControllerMixedGroup[]> => {
  const { mode = 'rule' } = await getControledMihomoConfig()
  if (mode === 'direct') return []
  const proxies = await mihomoProxies()
  const runtime = await getRuntimeConfig()

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

  const groups: ControllerMixedGroup[] = []
  runtime?.['proxy-groups']?.forEach((group: { name: string; url?: string }) => {
    const { name, url } = group
    if (proxies.proxies[name] && 'all' in proxies.proxies[name] && !proxies.proxies[name].hidden) {
      const newGroup = proxies.proxies[name]
      newGroup.testUrl = url
      const newAll = newGroup.all.map((name) => enrichProxy(proxies.proxies[name]))
      groups.push({ ...newGroup, all: newAll })
    }
  })
  if (!groups.find((group) => group.name === 'GLOBAL') && mode === 'global') {
    const newGlobal = proxies.proxies['GLOBAL'] as ControllerGroupDetail
    if (!newGlobal.hidden) {
      const newAll = newGlobal.all.map((name) => enrichProxy(proxies.proxies[name]))
      groups.push({ ...newGlobal, all: newAll })
    }
  }
  if (mode === 'global') {
    const global = groups.findIndex((group) => group.name === 'GLOBAL')
    groups.unshift(groups.splice(global, 1)[0])
  }
  return groups
}

export const mihomoProxyProviders = async (): Promise<ControllerProxyProviders> => {
  const instance = await getAxios()
  return await instance.get('/providers/proxies')
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
  url?: string
): Promise<ControllerProxiesDelay> => {
  const appConfig = await getAppConfig()
  const { delayTestUrl, delayTestTimeout } = appConfig
  const instance = await getAxios()
  return await instance.get(`/proxies/${encodeURIComponent(proxy)}/delay`, {
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

export const getTotalTraffic = (): { up: number; down: number } => {
  return { up: totalUpTraffic, down: totalDownTraffic }
}

export const resetTotalTraffic = (): void => {
  totalUpTraffic = 0
  totalDownTraffic = 0
  mainWindow?.webContents.send('totalTraffic', { up: 0, down: 0 })
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

export const startMihomoTraffic = async (): Promise<void> => {
  trafficRetry = 10
  await mihomoTraffic()
}

export const stopMihomoTraffic = (): void => {
  if (trafficReconnectTimer) {
    clearTimeout(trafficReconnectTimer)
    trafficReconnectTimer = null
  }
  trafficRetry = 0
  if (mihomoTrafficWs) {
    mihomoTrafficWs.removeAllListeners()
    if (mihomoTrafficWs.readyState === WebSocket.OPEN) {
      mihomoTrafficWs.close()
    }
    mihomoTrafficWs = null
  }
}

const mihomoTraffic = async (): Promise<void> => {
  if (trafficReconnectTimer) {
    clearTimeout(trafficReconnectTimer)
    trafficReconnectTimer = null
  }

  if (mihomoTrafficWs) {
    mihomoTrafficWs.removeAllListeners()
    if (mihomoTrafficWs.readyState === WebSocket.OPEN) {
      mihomoTrafficWs.close()
    }
    mihomoTrafficWs = null
  }

  mihomoTrafficWs = new WebSocket(`ws+unix:${mihomoIpcPath()}:/traffic`)

  mihomoTrafficWs.onmessage = async (e): Promise<void> => {
    const data = e.data as string
    const json = JSON.parse(data) as ControllerTraffic
    trafficRetry = 10
    totalUpTraffic += json.up
    totalDownTraffic += json.down
    try {
      mainWindow?.webContents.send('mihomoTraffic', json)
      mainWindow?.webContents.send('totalTraffic', { up: totalUpTraffic, down: totalDownTraffic })
      if (process.platform !== 'linux') {
        tray?.setToolTip(
          '↑' +
            `${calcTraffic(json.up)}/s`.padStart(9) +
            '\n↓' +
            `${calcTraffic(json.down)}/s`.padStart(9)
        )
      }
      floatingWindow?.webContents.send('mihomoTraffic', json)
    } catch {
      // ignore
    }
  }

  mihomoTrafficWs.onclose = (): void => {
    if (trafficRetry > 0) {
      trafficRetry--
      trafficReconnectTimer = setTimeout(() => mihomoTraffic(), 1000)
    }
  }

  mihomoTrafficWs.onerror = (): void => {
    if (mihomoTrafficWs) {
      mihomoTrafficWs.removeAllListeners()
      mihomoTrafficWs.close()
      mihomoTrafficWs = null
    }
  }
}

export const startMihomoMemory = async (): Promise<void> => {
  memoryRetry = 10
  await mihomoMemory()
}

export const stopMihomoMemory = (): void => {
  if (memoryReconnectTimer) {
    clearTimeout(memoryReconnectTimer)
    memoryReconnectTimer = null
  }
  memoryRetry = 0
  if (mihomoMemoryWs) {
    mihomoMemoryWs.removeAllListeners()
    if (mihomoMemoryWs.readyState === WebSocket.OPEN) {
      mihomoMemoryWs.close()
    }
    mihomoMemoryWs = null
  }
}

const mihomoMemory = async (): Promise<void> => {
  if (memoryReconnectTimer) {
    clearTimeout(memoryReconnectTimer)
    memoryReconnectTimer = null
  }

  if (mihomoMemoryWs) {
    mihomoMemoryWs.removeAllListeners()
    if (mihomoMemoryWs.readyState === WebSocket.OPEN) {
      mihomoMemoryWs.close()
    }
    mihomoMemoryWs = null
  }

  mihomoMemoryWs = new WebSocket(`ws+unix:${mihomoIpcPath()}:/memory`)

  mihomoMemoryWs.onmessage = (e): void => {
    const data = e.data as string
    memoryRetry = 10
    try {
      mainWindow?.webContents.send('mihomoMemory', JSON.parse(data) as ControllerMemory)
    } catch {
      // ignore
    }
  }

  mihomoMemoryWs.onclose = (): void => {
    if (memoryRetry > 0) {
      memoryRetry--
      memoryReconnectTimer = setTimeout(() => mihomoMemory(), 1000)
    }
  }

  mihomoMemoryWs.onerror = (): void => {
    if (mihomoMemoryWs) {
      mihomoMemoryWs.removeAllListeners()
      mihomoMemoryWs.close()
      mihomoMemoryWs = null
    }
  }
}

export const startMihomoLogs = async (): Promise<void> => {
  if (logsSubscribers <= 0) return
  logsRetry = 10
  await mihomoLogs()
}

export const stopMihomoLogs = (): void => {
  if (logsReconnectTimer) {
    clearTimeout(logsReconnectTimer)
    logsReconnectTimer = null
  }
  logsRetry = 0
  if (mihomoLogsWs) {
    mihomoLogsWs.removeAllListeners()
    if (mihomoLogsWs.readyState === WebSocket.OPEN) {
      mihomoLogsWs.close()
    }
    mihomoLogsWs = null
  }
}

export const hasMihomoLogsSubscribers = (): boolean => {
  return logsSubscribers > 0
}

export const subscribeMihomoLogs = async (): Promise<void> => {
  logsSubscribers++
  if (logsSubscribers === 1) {
    await startMihomoLogs()
  }
}

export const unsubscribeMihomoLogs = (): void => {
  logsSubscribers = Math.max(0, logsSubscribers - 1)
  if (logsSubscribers === 0) {
    stopMihomoLogs()
  }
}

const mihomoLogs = async (): Promise<void> => {
  if (logsSubscribers <= 0) return

  if (logsReconnectTimer) {
    clearTimeout(logsReconnectTimer)
    logsReconnectTimer = null
  }

  if (mihomoLogsWs) {
    mihomoLogsWs.removeAllListeners()
    if (mihomoLogsWs.readyState === WebSocket.OPEN) {
      mihomoLogsWs.close()
    }
    mihomoLogsWs = null
  }

  const { 'log-level': logLevel = 'info' } = await getControledMihomoConfig()

  mihomoLogsWs = new WebSocket(`ws+unix:${mihomoIpcPath()}:/logs?level=${logLevel}`)

  mihomoLogsWs.onmessage = (e): void => {
    const data = e.data as string
    logsRetry = 10
    try {
      mainWindow?.webContents.send('mihomoLogs', JSON.parse(data) as ControllerLog)
    } catch {
      // ignore
    }
  }

  mihomoLogsWs.onclose = (): void => {
    if (logsSubscribers > 0 && logsRetry > 0) {
      logsRetry--
      logsReconnectTimer = setTimeout(() => mihomoLogs(), 1000)
    }
  }

  mihomoLogsWs.onerror = (): void => {
    if (mihomoLogsWs) {
      mihomoLogsWs.removeAllListeners()
      mihomoLogsWs.close()
      mihomoLogsWs = null
    }
  }
}

export const startMihomoConnections = async (): Promise<void> => {
  if (connectionsSubscribers <= 0) return
  connectionsRetry = 10
  await mihomoConnections()
}

export const stopMihomoConnections = (): void => {
  if (connectionsReconnectTimer) {
    clearTimeout(connectionsReconnectTimer)
    connectionsReconnectTimer = null
  }
  connectionsRetry = 0
  if (mihomoConnectionsWs) {
    mihomoConnectionsWs.removeAllListeners()
    if (mihomoConnectionsWs.readyState === WebSocket.OPEN) {
      mihomoConnectionsWs.close()
    }
    mihomoConnectionsWs = null
  }
}

export const hasMihomoConnectionsSubscribers = (): boolean => {
  return connectionsSubscribers > 0
}

export const subscribeMihomoConnections = async (): Promise<void> => {
  connectionsSubscribers++
  if (connectionsSubscribers === 1) {
    await startMihomoConnections()
  }
}

export const unsubscribeMihomoConnections = (): void => {
  connectionsSubscribers = Math.max(0, connectionsSubscribers - 1)
  if (connectionsSubscribers === 0) {
    stopMihomoConnections()
  }
}

export const restartMihomoConnections = async (): Promise<void> => {
  stopMihomoConnections()
  await startMihomoConnections()
}

const mihomoConnections = async (): Promise<void> => {
  if (connectionsSubscribers <= 0) return

  if (connectionsReconnectTimer) {
    clearTimeout(connectionsReconnectTimer)
    connectionsReconnectTimer = null
  }

  if (mihomoConnectionsWs) {
    mihomoConnectionsWs.removeAllListeners()
    if (mihomoConnectionsWs.readyState === WebSocket.OPEN) {
      mihomoConnectionsWs.close()
    }
    mihomoConnectionsWs = null
  }

  const { connectionInterval = 500 } = await getAppConfig()
  mihomoConnectionsWs = new WebSocket(
    `ws+unix:${mihomoIpcPath()}:/connections?interval=${connectionInterval}`
  )

  mihomoConnectionsWs.onmessage = (e): void => {
    const data = e.data as string
    connectionsRetry = 10
    try {
      mainWindow?.webContents.send('mihomoConnections', JSON.parse(data) as ControllerConnections)
    } catch {
      // ignore
    }
  }

  mihomoConnectionsWs.onclose = (): void => {
    if (connectionsSubscribers > 0 && connectionsRetry > 0) {
      connectionsRetry--
      connectionsReconnectTimer = setTimeout(() => mihomoConnections(), 1000)
    }
  }

  mihomoConnectionsWs.onerror = (): void => {
    if (mihomoConnectionsWs) {
      mihomoConnectionsWs.removeAllListeners()
      mihomoConnectionsWs.close()
      mihomoConnectionsWs = null
    }
  }
}
