import { ChildProcess, execFile, execFileSync, spawn } from 'child_process'
import {
  dataDir,
  installedCores,
  logPath,
  mihomoCorePath,
  mihomoIpcPath,
  mihomoProfileWorkDir,
  mihomoTestDir,
  mihomoWorkConfigPath,
  mihomoWorkDir
} from '../utils/dirs'
import { generateProfile, getRuntimeConfig } from './factory'
import {
  getAppConfig,
  getControledMihomoConfig,
  getProfileConfig,
  patchAppConfig,
  patchControledMihomoConfig
} from '../config'
import { app, ipcMain, net } from 'electron'
import {
  startMihomoTraffic,
  startMihomoConnections,
  startMihomoLogs,
  startMihomoMemory,
  stopMihomoConnections,
  stopMihomoTraffic,
  stopMihomoLogs,
  stopMihomoMemory,
  applyLogLevel,
  mihomoGroups
} from './mihomoApi'
import { readFile, rm, writeFile } from 'fs/promises'
import { promisify } from 'util'
import { mainWindow, showError } from '..'
import path from 'path'
import os from 'os'
import { existsSync } from 'fs'
import { disableSysProxy, triggerSysProxy } from '../sys/sysproxy'
import { getAxios } from './mihomoApi'
import { setSysDns } from '../service/api'
import { t } from '../utils/i18n'
import { RotatingLog } from '../utils/logs'
import { CoreError, reportCoreError, setCoreStatus } from './status'

const ctlParam = process.platform === 'win32' ? '-ext-ctl-pipe' : '-ext-ctl-unix'

// Shared by stdout, stderr and every restart, so one place tracks the size of the current file
const coreLog = new RotatingLog()

// Lines of core output attached to a crash report
const CORE_OUTPUT_TAIL = 20

// Spawn failures (ENOENT, EACCES, UNKNOWN...) mean the binary itself is gone or blocked
function isSpawnFailure(error: unknown): error is NodeJS.ErrnoException {
  const { code, syscall } = (error ?? {}) as NodeJS.ErrnoException
  return typeof code === 'string' && !!syscall?.startsWith('spawn')
}

class UserCancelledError extends Error {
  constructor(message = t('tray.userCancelled')) {
    super(message)
    this.name = 'UserCancelledError'
  }
}

function isUserCancelledError(error: unknown): boolean {
  if (error instanceof UserCancelledError) {
    return true
  }
  const errorMsg = error instanceof Error ? error.message : String(error)
  return (
    errorMsg.includes(t('tray.userCancelledCheck')) ||
    errorMsg.includes('User canceled') ||
    errorMsg.includes('(-128)') ||
    errorMsg.includes('user cancelled') ||
    errorMsg.includes('dismissed')
  )
}

let setPublicDNSTimer: NodeJS.Timeout | null = null
let recoverDNSTimer: NodeJS.Timeout | null = null
let networkDetectionTimer: NodeJS.Timeout | null = null
let networkDownHandled = false

let child: ChildProcess
let retry = 10

// The (re)start in flight, settled once its controller is up or the start has failed
let coreStarting: Promise<unknown> | null = null

let initialized = false
let providerNames = new Set<string>()
let unmatchedProviders = new Set<string>()

const normalize = (s: string): string =>
  s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .normalize('NFC')

export async function resetProviderTracking(): Promise<void> {
  const { 'rule-providers': ruleProviders, 'proxy-providers': proxyProviders } =
    await getRuntimeConfig()
  providerNames = new Set(
    [...Object.keys(ruleProviders || {}), ...Object.keys(proxyProviders || {})].map(normalize)
  )
  unmatchedProviders = new Set(providerNames)
  initialized = false
}

function trackCoreStart<T>(starting: Promise<T>): Promise<T> {
  coreStarting = starting
  const settle = (): void => {
    if (coreStarting === starting) coreStarting = null
  }
  starting.then(settle, settle)
  return starting
}

// Resolves once no (re)start is in flight; the core state then tells whether the core came up
export async function waitForCoreStart(): Promise<void> {
  while (coreStarting) {
    await coreStarting.catch(() => {})
  }
}

export function startCore(detached = false): Promise<Promise<void>[]> {
  // A detached core is left running on quit, nothing waits for it
  return detached ? launchCore(true) : trackCoreStart(launchCore())
}

async function launchCore(detached = false): Promise<Promise<void>[]> {
  const {
    core = 'mihomo',
    autoSetDNSMode = 'exec',
    diffWorkDir = false,
    mihomoCpuPriority = 'PRIORITY_NORMAL',
    disableLoopbackDetector = false,
    disableEmbedCA = false,
    disableSystemCA = false,
    disableNftables = false,
    safePaths = []
  } = await getAppConfig()
  const { current } = await getProfileConfig()
  const { tun } = await getControledMihomoConfig()

  // Older configs may name the removed system core or an alpha core this build left out
  if (core !== 'mihomo' && !installedCores().includes(core)) {
    await patchAppConfig({ core: 'mihomo' })
    return launchCore(detached)
  }
  const corePath = mihomoCorePath(core)
  // An antivirus quarantining the binary leaves no other trace
  if (!existsSync(corePath)) {
    throw new CoreError('binary-missing', `${corePath}: ENOENT`)
  }

  const { logLevel } = await generateProfile().catch((e) => {
    throw new CoreError('config-invalid', e)
  })
  await checkProfile()
  await stopCore()
  if (tun?.enable && autoSetDNSMode !== 'none') {
    try {
      await setPublicDNS()
    } catch (error) {
      await writeFile(logPath(), `[Manager]: set dns failed, ${error}`, {
        flag: 'a'
      })
    }
  }
  await resetProviderTracking()
  const env = {
    DISABLE_LOOPBACK_DETECTOR: String(disableLoopbackDetector),
    DISABLE_EMBED_CA: String(disableEmbedCA),
    DISABLE_SYSTEM_CA: String(disableSystemCA),
    DISABLE_NFTABLES: String(disableNftables),
    SAFE_PATHS: safePaths.join(path.delimiter),
    PATH: process.env.PATH
  }
  child = spawn(
    corePath,
    [
      '-d',
      diffWorkDir ? mihomoProfileWorkDir(current) : mihomoWorkDir(),
      ctlParam,
      mihomoIpcPath()
    ],
    {
      detached: detached,
      stdio: detached ? 'ignore' : undefined,
      env: env
    }
  )
  if (process.platform === 'win32' && child.pid) {
    os.setPriority(child.pid, os.constants.priority[mihomoCpuPriority])
  }
  if (detached) {
    child.unref()
    return new Promise((resolve) => {
      resolve([new Promise(() => {})])
    })
  }
  setCoreStatus('starting')
  const outputTail: string[] = []
  const rememberOutput = (data: Buffer): void => {
    outputTail.push(...data.toString().split('\n').filter(Boolean))
    outputTail.splice(0, outputTail.length - CORE_OUTPUT_TAIL)
  }
  // The log outlives this core, so its exit must not end it
  child.stdout?.pipe(coreLog, { end: false })
  child.stderr?.pipe(coreLog, { end: false })
  child.stdout?.on('data', rememberOutput)
  child.stderr?.on('data', rememberOutput)
  return new Promise((resolve, reject) => {
    let ready = false
    child.on('error', (error) => {
      reject(isSpawnFailure(error) ? new CoreError('binary-missing', error) : error)
    })
    child.on('close', async (code, signal) => {
      await writeFile(logPath(), `[Manager]: Core closed, code: ${code}, signal: ${signal}\n`, {
        flag: 'a'
      })
      const failure = new CoreError(
        'crashed',
        [`code: ${code}, signal: ${signal}`, ...outputTail].join('\n')
      )
      // Exiting before the controller came up would fail the same way on every retry
      if (!ready) {
        reject(failure)
        return
      }
      if (retry) {
        await writeFile(logPath(), `[Manager]: Try Restart Core\n`, { flag: 'a' })
        retry--
        await restartCore()
      } else {
        await stopCore()
        reportCoreError(failure)
      }
    })
    child.stdout?.on('data', async (data) => {
      const str = data.toString()
      if (
        (process.platform !== 'win32' && str.includes('External controller unix listen error')) ||
        (process.platform === 'win32' && str.includes('External controller pipe listen error'))
      ) {
        reject(`${t('tray.controllerListenError')}:\n${str}`)
      }

      if (process.platform === 'win32' && str.includes('updater: finished')) {
        await runCore(() => stopCore(true))
      }

      if (
        (process.platform !== 'win32' && str.includes('RESTful API unix listening at')) ||
        (process.platform === 'win32' && str.includes('RESTful API pipe listening at'))
      ) {
        ready = true
        setCoreStatus('running')
        resolve([
          new Promise((resolve, reject) => {
            const handleProviderInitialization = async (logLine: string): Promise<void> => {
              for (const match of logLine.matchAll(/Start initial provider ([^"]+)"/g)) {
                const name = normalize(match[1])
                if (providerNames.has(name)) {
                  unmatchedProviders.delete(name)
                }
              }

              if (
                logLine.includes(
                  'Start TUN listening error: configure tun interface: Connect: operation not permitted'
                )
              ) {
                patchControledMihomoConfig({ tun: { enable: false } })
                mainWindow?.webContents.send('controledMihomoConfigUpdated')
                ipcMain.emit('updateTrayMenu')
                reject(t('tray.tunStartFailed'))
              }

              const isDefaultProvider = logLine.includes(
                'Start initial compatible provider default'
              )
              const isAllProvidersMatched = providerNames.size > 0 && unmatchedProviders.size === 0

              if ((providerNames.size === 0 && isDefaultProvider) || isAllProvidersMatched) {
                const waitForMihomoReady = async (): Promise<void> => {
                  const maxRetries = 30
                  const retryInterval = 100

                  for (let i = 0; i < maxRetries; i++) {
                    try {
                      await mihomoGroups()
                      break
                    } catch (error) {
                      await new Promise((r) => setTimeout(r, retryInterval))
                    }
                  }
                }

                await waitForMihomoReady()
                initialized = true
                Promise.all([
                  new Promise((r) => setTimeout(r, 100)).then(() => {
                    mainWindow?.webContents.send('groupsUpdated')
                    mainWindow?.webContents.send('rulesUpdated')
                  }),
                  new Promise((r) => setTimeout(r, 100)).then(() => applyLogLevel(logLevel))
                ]).then(() => resolve())
              }
            }
            child.stdout?.on('data', (data) => {
              if (!initialized) {
                handleProviderInitialization(data.toString())
              }
            })
          })
        ])
        await startMihomoTraffic()
        await startMihomoConnections()
        startMihomoLogs(logLevel)
        await startMihomoMemory()
        retry = 10
      }
    })
  })
}

export async function stopCore(force = false): Promise<void> {
  try {
    if (!force) {
      await recoverDNS()
    }
  } catch (error) {
    await writeFile(logPath(), `[Manager]: recover dns failed, ${error}`, {
      flag: 'a'
    })
  }

  stopMihomoTraffic()
  stopMihomoConnections()
  stopMihomoLogs()
  stopMihomoMemory()

  if (child && !child.killed) {
    await stopChildProcess(child)
    child = undefined as unknown as ChildProcess
  }
  setCoreStatus('stopped')

  await getAxios(true).catch(() => {})

  if (existsSync(path.join(dataDir(), 'core.pid'))) {
    const pidString = await readFile(path.join(dataDir(), 'core.pid'), 'utf-8')
    const pid = parseInt(pidString.trim())
    if (!isNaN(pid)) {
      try {
        process.kill(pid, 0)
        process.kill(pid, 'SIGINT')
        await new Promise((resolve) => setTimeout(resolve, 1000))
        try {
          process.kill(pid, 0)
          process.kill(pid, 'SIGKILL')
        } catch {
          // ignore
        }
      } catch {
        // ignore
      }
    }
    await rm(path.join(dataDir(), 'core.pid')).catch(() => {})
  }
}

async function stopChildProcess(process: ChildProcess): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!process || process.killed) {
      resolve()
      return
    }

    const pid = process.pid
    if (!pid) {
      resolve()
      return
    }

    process.removeAllListeners()

    let isResolved = false
    const timers: NodeJS.Timeout[] = []

    const resolveOnce = async (): Promise<void> => {
      if (!isResolved) {
        isResolved = true

        timers.forEach((timer) => clearTimeout(timer))
        resolve()
      }
    }

    process.once('close', resolveOnce)
    process.once('exit', resolveOnce)

    try {
      process.kill('SIGINT')

      const timer1 = setTimeout(async () => {
        if (!process.killed && !isResolved) {
          try {
            if (pid) {
              globalThis.process.kill(pid, 0)
              process.kill('SIGTERM')
            }
          } catch {
            await resolveOnce()
          }
        }
      }, 3000)
      timers.push(timer1)

      const timer2 = setTimeout(async () => {
        if (!process.killed && !isResolved) {
          try {
            if (pid) {
              globalThis.process.kill(pid, 0)
              process.kill('SIGKILL')
              await writeFile(logPath(), `[Manager]: Force killed process ${pid} with SIGKILL\n`, {
                flag: 'a'
              })
            }
          } catch {
            // ignore
          }
          await resolveOnce()
        }
      }, 6000)
      timers.push(timer2)
    } catch (error) {
      resolveOnce()
      return
    }
  })
}

// A failed start leaves no core running, while a rejected readiness promise (e.g. TUN) does not
async function runCore(stop: () => Promise<void>): Promise<void> {
  let promises: Promise<void>[]
  try {
    // Tracked from the stop on, so nobody mistakes the stopped core for one that is down for good
    promises = await trackCoreStart(
      (async (): Promise<Promise<void>[]> => {
        await stop()
        return startCore()
      })()
    )
  } catch (e) {
    reportCoreError(e)
    return
  }
  try {
    await Promise.all(promises)
  } catch (e) {
    showError(t('tray.coreStartError'), `${e}`)
  }
}

export async function restartCore(): Promise<void> {
  await runCore(() => stopCore())
}

export async function keepCoreAlive(): Promise<void> {
  try {
    await startCore(true)
    if (child && child.pid) {
      await writeFile(path.join(dataDir(), 'core.pid'), child.pid.toString())
    }
  } catch (e) {
    showError(t('tray.coreStartError'), `${e}`)
  }
}

export async function quitWithoutCore(): Promise<void> {
  await keepCoreAlive()
  app.exit()
}

async function checkProfile(): Promise<void> {
  const { core = 'mihomo', diffWorkDir = false, safePaths = [] } = await getAppConfig()
  const { current } = await getProfileConfig()
  const corePath = mihomoCorePath(core)
  const execFilePromise = promisify(execFile)
  const env = {
    SAFE_PATHS: safePaths.join(path.delimiter)
  }
  try {
    await execFilePromise(
      corePath,
      [
        '-t',
        '-f',
        diffWorkDir ? mihomoWorkConfigPath(current) : mihomoWorkConfigPath('work'),
        '-d',
        mihomoTestDir()
      ],
      { env }
    )
  } catch (error) {
    // The promisified execFile attaches stdout even when the binary never ran
    if (isSpawnFailure(error)) {
      throw new CoreError('binary-missing', error)
    }
    const { stdout = '', stderr = '' } = error as { stdout?: string; stderr?: string }
    const errorLines = `${stdout}\n${stderr}`
      .split('\n')
      .filter((line) => /level=(error|fatal)/.test(line))
      .map((line) => line.split(/level=(?:error|fatal)/)[1].trim())
    if (errorLines.length > 0) {
      throw new CoreError('config-invalid', errorLines.join('\n'))
    }
    throw error
  }
}

export async function manualGrantCorePermition(
  cores?: ('mihomo' | 'mihomo-alpha')[]
): Promise<void> {
  const execFilePromise = promisify(execFile)

  const grantPermission = async (coreName: 'mihomo' | 'mihomo-alpha'): Promise<void> => {
    const corePath = mihomoCorePath(coreName)
    try {
      if (process.platform === 'darwin') {
        const escapedPath = corePath.replace(/"/g, '\\"')
        const shell = `chown root:admin \\"${escapedPath}\\" && chmod +sx \\"${escapedPath}\\"`
        const command = `do shell script "${shell}" with administrator privileges`
        await execFilePromise('osascript', ['-e', command])
      }
      if (process.platform === 'linux') {
        await execFilePromise('pkexec', [
          'bash',
          '-c',
          `chown root:root "${corePath}" && chmod +sx "${corePath}"`
        ])
      }
    } catch (error) {
      if (isUserCancelledError(error)) {
        throw new UserCancelledError()
      }
      throw error
    }
  }

  const targetCores = cores || installedCores()
  await Promise.all(targetCores.map((core) => grantPermission(core)))
}

export function checkCorePermissionSync(coreName: 'mihomo' | 'mihomo-alpha'): boolean {
  if (process.platform === 'win32') return true
  try {
    const corePath = mihomoCorePath(coreName)
    const stdout = execFileSync('ls', ['-l', corePath], { encoding: 'utf8' })
    const permissions = stdout.trim().split(/\s+/)[0]
    return permissions.includes('s') || permissions.includes('S')
  } catch {
    return false
  }
}

export async function checkCorePermission(): Promise<{ mihomo: boolean; 'mihomo-alpha': boolean }> {
  const execFilePromise = promisify(execFile)

  const checkPermission = async (coreName: 'mihomo' | 'mihomo-alpha'): Promise<boolean> => {
    try {
      const corePath = mihomoCorePath(coreName)
      const { stdout } = await execFilePromise('ls', ['-l', corePath])
      const permissions = stdout.trim().split(/\s+/)[0]
      return permissions.includes('s') || permissions.includes('S')
    } catch (error) {
      return false
    }
  }

  const [mihomoPermission, mihomoAlphaPermission] = await Promise.all([
    checkPermission('mihomo'),
    checkPermission('mihomo-alpha')
  ])

  return {
    mihomo: mihomoPermission,
    'mihomo-alpha': mihomoAlphaPermission
  }
}

export async function revokeCorePermission(cores?: ('mihomo' | 'mihomo-alpha')[]): Promise<void> {
  const execFilePromise = promisify(execFile)

  const revokePermission = async (coreName: 'mihomo' | 'mihomo-alpha'): Promise<void> => {
    const corePath = mihomoCorePath(coreName)
    try {
      if (process.platform === 'darwin') {
        const escapedPath = corePath.replace(/"/g, '\\"')
        const shell = `chmod a-s \\"${escapedPath}\\"`
        const command = `do shell script "${shell}" with administrator privileges`
        await execFilePromise('osascript', ['-e', command])
      }
      if (process.platform === 'linux') {
        await execFilePromise('pkexec', ['bash', '-c', `chmod a-s "${corePath}"`])
      }
    } catch (error) {
      if (isUserCancelledError(error)) {
        throw new UserCancelledError()
      }
      throw error
    }
  }

  const targetCores = cores || installedCores()
  await Promise.all(targetCores.map((core) => revokePermission(core)))
}

export async function getDefaultDevice(): Promise<string> {
  const execFilePromise = promisify(execFile)
  const { stdout: deviceOut } = await execFilePromise('route', ['-n', 'get', 'default'])
  let device = deviceOut.split('\n').find((s) => s.includes('interface:'))
  device = device?.trim().split(' ').slice(1).join(' ')
  if (!device) throw new Error('Get device failed')
  return device
}

async function getDefaultService(): Promise<string> {
  const execFilePromise = promisify(execFile)
  const device = await getDefaultDevice()
  const { stdout: order } = await execFilePromise('networksetup', ['-listnetworkserviceorder'])
  const block = order.split('\n\n').find((s) => s.includes(`Device: ${device}`))
  if (!block) throw new Error('Get networkservice failed')
  for (const line of block.split('\n')) {
    if (line.match(/^\(\d+\).*/)) {
      return line.trim().split(' ').slice(1).join(' ')
    }
  }
  throw new Error('Get service failed')
}

async function getOriginDNS(): Promise<void> {
  const execFilePromise = promisify(execFile)
  const service = await getDefaultService()
  const { stdout: dns } = await execFilePromise('networksetup', ['-getdnsservers', service])
  if (dns.startsWith("There aren't any DNS Servers set on")) {
    await patchAppConfig({ originDNS: 'Empty' })
  } else {
    await patchAppConfig({ originDNS: dns.trim().replace(/\n/g, ' ') })
  }
}

async function setDNS(dns: string, mode: 'none' | 'exec' | 'service'): Promise<void> {
  const service = await getDefaultService()
  const dnsServers = dns.split(' ')
  if (mode === 'exec') {
    const execFilePromise = promisify(execFile)
    await execFilePromise('networksetup', ['-setdnsservers', service, ...dnsServers])
    return
  }
  if (mode === 'service') {
    await setSysDns(service, dnsServers)
    return
  }
}

export async function setPublicDNS(): Promise<void> {
  if (process.platform !== 'darwin') return
  if (net.isOnline()) {
    const { originDNS, autoSetDNSMode = 'none' } = await getAppConfig()
    if (!originDNS) {
      await getOriginDNS()
      await setDNS('1.1.1.1', autoSetDNSMode)
    }
  } else {
    if (setPublicDNSTimer) clearTimeout(setPublicDNSTimer)
    setPublicDNSTimer = setTimeout(() => setPublicDNS(), 5000)
  }
}

export async function recoverDNS(): Promise<void> {
  if (process.platform !== 'darwin') return
  if (net.isOnline()) {
    const { originDNS, autoSetDNSMode = 'none' } = await getAppConfig()
    if (originDNS) {
      await setDNS(originDNS, autoSetDNSMode)
      await patchAppConfig({ originDNS: undefined })
    }
  } else {
    if (recoverDNSTimer) clearTimeout(recoverDNSTimer)
    recoverDNSTimer = setTimeout(() => recoverDNS(), 5000)
  }
}

export async function startNetworkDetection(): Promise<void> {
  const {
    onlyActiveDevice = false,
    networkDetectionBypass = [],
    networkDetectionInterval = 10,
    sysProxy = { enable: false },
    proxyMode = false
  } = await getAppConfig()
  const writeSysProxy = proxyMode && sysProxy.enable
  const { tun: { device = process.platform === 'darwin' ? undefined : 'mihomo' } = {} } =
    await getControledMihomoConfig()
  if (networkDetectionTimer) {
    clearInterval(networkDetectionTimer)
  }
  const extendedBypass = networkDetectionBypass.concat(
    [device, 'lo', 'docker0', 'utun'].filter((item): item is string => item !== undefined)
  )

  networkDetectionTimer = setInterval(async () => {
    if (isAnyNetworkInterfaceUp(extendedBypass) && net.isOnline()) {
      if ((networkDownHandled && !child) || (child && child.killed)) {
        const promises = await startCore()
        await Promise.all(promises)
        if (writeSysProxy) triggerSysProxy(true, onlyActiveDevice)
        networkDownHandled = false
      }
    } else {
      if (!networkDownHandled) {
        if (writeSysProxy) disableSysProxy(onlyActiveDevice)
        await stopCore()
        networkDownHandled = true
      }
    }
  }, networkDetectionInterval * 1000)
}

export async function stopNetworkDetection(): Promise<void> {
  if (networkDetectionTimer) {
    clearInterval(networkDetectionTimer)
    networkDetectionTimer = null
  }
}

function isAnyNetworkInterfaceUp(excludedKeywords: string[] = []): boolean {
  const interfaces = os.networkInterfaces()
  return Object.entries(interfaces).some(([name, ifaces]) => {
    if (excludedKeywords.some((keyword) => name.includes(keyword))) return false

    return ifaces?.some((iface) => {
      return !iface.internal && (iface.family === 'IPv4' || iface.family === 'IPv6')
    })
  })
}
