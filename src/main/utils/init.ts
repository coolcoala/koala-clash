import {
  appConfigPath,
  controledMihomoConfigPath,
  dataDir,
  logDir,
  logPath,
  mihomoTestDir,
  mihomoWorkDir,
  profileConfigPath,
  profilePath,
  profilesDir,
  resourcesFilesDir,
  rulesDir,
  themesDir
} from './dirs'
import {
  defaultConfig,
  defaultControledMihomoConfig,
  defaultProfile,
  defaultProfileConfig
} from './template'
import { stringifyYaml } from './yaml'
import { mkdir, writeFile, cp, rm, readdir, stat, utimes } from 'fs/promises'
import { createReadStream, createWriteStream, existsSync } from 'fs'
import { pipeline } from 'stream/promises'
import { createGzip } from 'zlib'
import path from 'path'
import { GEO_FILES, linkGeoFiles, removeUnusedMetadb } from './geo'
import {
  startPacServer
} from '../resolve/server'
import { triggerSysProxy } from '../sys/sysproxy'
import {
  getAppConfig,
  getControledMihomoConfig,
  patchAppConfig,
  patchControledMihomoConfig
} from '../config'
import { app } from 'electron'
import { startSSIDCheck } from '../sys/ssid'
import { startNetworkDetection } from '../core/manager'
import { PORT_KEYS } from '../core/factory'
import { initKeyManager } from '../service/manager'
import { migrateFromOldApp } from './migration'

async function initDirs(): Promise<void> {
  if (!existsSync(dataDir())) {
    await mkdir(dataDir())
  }
  const dirs = [
    themesDir(),
    profilesDir(),
    rulesDir(),
    mihomoWorkDir(),
    logDir(),
    mihomoTestDir(),
  ]
  await Promise.all(
    dirs.map(async (dir) => {
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true })
      }
    })
  )
}

async function initConfig(): Promise<void> {
  const configTasks: Promise<void>[] = []

  if (!existsSync(appConfigPath())) {
    configTasks.push(writeFile(appConfigPath(), stringifyYaml(defaultConfig)))
  }
  if (!existsSync(profileConfigPath())) {
    configTasks.push(writeFile(profileConfigPath(), stringifyYaml(defaultProfileConfig)))
  }
  if (!existsSync(profilePath('default'))) {
    configTasks.push(writeFile(profilePath('default'), stringifyYaml(defaultProfile)))
  }
  if (!existsSync(controledMihomoConfigPath())) {
    configTasks.push(
      writeFile(controledMihomoConfigPath(), stringifyYaml(defaultControledMihomoConfig))
    )
  }

  if (configTasks.length > 0) {
    await Promise.all(configTasks)
  }
}

async function initFiles(): Promise<void> {
  const copy = async (file: string): Promise<void> => {
    const targetPath = path.join(mihomoWorkDir(), file)
    const sourcePath = path.join(resourcesFilesDir(), file)
    if (!existsSync(targetPath) && existsSync(sourcePath)) {
      await cp(sourcePath, targetPath, { recursive: true })
    }
  }
  await Promise.all(GEO_FILES.map(copy))
  await removeUnusedMetadb(mihomoWorkDir())
  await linkGeoFiles(mihomoTestDir())
}

async function cleanup(): Promise<void> {
  // update cache
  const files = await readdir(dataDir())
  for (const file of files) {
    if (file.endsWith('.exe') || file.endsWith('.pkg') || file.endsWith('.7z')) {
      try {
        await rm(path.join(dataDir(), file))
      } catch {
        // ignore
      }
    }
  }
  // logs, aged by mtime since heap snapshots are named by timestamp rather than by date
  const { maxLogDays = 7 } = await getAppConfig()
  const currentLog = path.basename(logPath())
  const logs = await readdir(logDir())
  for (const log of logs) {
    const logFile = path.join(logDir(), log)
    try {
      const { atime, mtime } = await stat(logFile)
      if (Date.now() - mtime.getTime() > maxLogDays * 24 * 60 * 60 * 1000) {
        await rm(logFile)
      } else if (log.endsWith('.log') && log !== currentLog) {
        // Past days are no longer written to, and text logs shrink about tenfold
        await pipeline(createReadStream(logFile), createGzip(), createWriteStream(`${logFile}.gz`))
        // The archive keeps the log's date so it expires on the same schedule
        await utimes(`${logFile}.gz`, atime, mtime)
        await rm(logFile)
      }
    } catch {
      // ignore
    }
  }
}

async function migration(): Promise<void> {
  const appConfig = await getAppConfig()
  const mihomoConfig = await getControledMihomoConfig()

  const mihomoConfigPatch: Partial<MihomoConfig> = {}

  for (const key in defaultControledMihomoConfig) {
    if (
      !(key in mihomoConfig) &&
      defaultControledMihomoConfig[key as keyof MihomoConfig] !== undefined
    ) {
      ;(mihomoConfigPatch as Record<string, unknown>)[key] =
        defaultControledMihomoConfig[key as keyof MihomoConfig]
    }
  }

  // 清理已弃用的配置
  if (mihomoConfig['external-controller-pipe' as keyof MihomoConfig]) {
    mihomoConfigPatch['external-controller-pipe' as keyof MihomoConfig] = undefined as never
  }
  if (mihomoConfig['external-controller-unix' as keyof MihomoConfig]) {
    mihomoConfigPatch['external-controller-unix' as keyof MihomoConfig] = undefined as never
  }

  if (mihomoConfig['external-controller'] === undefined) {
    mihomoConfigPatch['external-controller'] = ''
  }

  if (Object.keys(mihomoConfigPatch).length > 0) {
    await patchControledMihomoConfig(mihomoConfigPatch)
  }

  const appConfigPatch: Partial<AppConfig> = {}

  for (const key in defaultConfig) {
    if (!(key in appConfig) && defaultConfig[key as keyof AppConfig] !== undefined) {
      ;(appConfigPatch as Record<string, unknown>)[key] = defaultConfig[key as keyof AppConfig]
    }
  }

  // Before customPorts existed, a port that differs from the default was set by the user
  if (appConfig.customPorts === undefined) {
    appConfigPatch.customPorts = PORT_KEYS.filter(
      (key) => key in mihomoConfig && mihomoConfig[key] !== defaultControledMihomoConfig[key]
    )
  }

  // Migrate: the old sysProxy.enable toggle now maps to the new proxyMode toggle.
  // sysProxy.enable becomes a sub-toggle (default ON) that only writes proxy to the OS.
  const legacyAppConfig = appConfig as Partial<AppConfig>
  if (!('proxyMode' in legacyAppConfig)) {
    appConfigPatch.proxyMode = legacyAppConfig.sysProxy?.enable ?? false
    if (!legacyAppConfig.sysProxy?.enable) {
      appConfigPatch.sysProxy = { ...(legacyAppConfig.sysProxy ?? {}), enable: true }
    }
  }

  if (Object.keys(appConfigPatch).length > 0) {
    await patchAppConfig(appConfigPatch)
  }
}

function initDeeplink(): void {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('clash', process.execPath, [path.resolve(process.argv[1])])
      app.setAsDefaultProtocolClient('mihomo', process.execPath, [path.resolve(process.argv[1])])
      app.setAsDefaultProtocolClient('koala-clash', process.execPath, [
        path.resolve(process.argv[1])
      ])
    }
  } else {
    app.setAsDefaultProtocolClient('clash')
    app.setAsDefaultProtocolClient('mihomo')
    app.setAsDefaultProtocolClient('koala-clash')
  }
}

export async function init(): Promise<void> {
  await initDirs()
  await Promise.all([initConfig(), initFiles()])
  try {
    await migrateFromOldApp()
  } catch {
    // migration failure should not block app startup
  }
  await migration()

  const [appConfig] = await Promise.all([
    getAppConfig(),
    initKeyManager(),
    cleanup().catch(() => {
      // ignore
    })
  ])

  const {
    sysProxy,
    proxyMode = false,
    onlyActiveDevice = false,
    networkDetection = false
  } = appConfig
  const writeSysProxy = proxyMode && sysProxy.enable

  const initTasks: Promise<void>[] = [
    startSSIDCheck()
  ]

  if (networkDetection) {
    initTasks.push(startNetworkDetection())
  }

  initTasks.push(
    (async (): Promise<void> => {
      try {
        if (writeSysProxy) {
          await startPacServer()
        }
        await triggerSysProxy(writeSysProxy, onlyActiveDevice)
      } catch {
        // ignore
      }
    })()
  )

  await Promise.all(initTasks)

  initDeeplink()
}
