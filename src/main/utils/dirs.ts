import { is } from '@electron-toolkit/utils'
import { existsSync, mkdirSync } from 'fs'
import { app } from 'electron'
import path from 'path'
import { getAppConfigSync } from '../config/app'
import { checkCorePermissionSync } from '../core/manager'
import { t } from './i18n'

export const homeDir = app.getPath('home')

export function isPortable(): boolean {
  return existsSync(path.join(exeDir(), 'PORTABLE'))
}

export function dataDir(): string {
  if (isPortable()) {
    return path.join(exeDir(), 'data')
  } else {
    return app.getPath('userData')
  }
}

export function taskDir(): string {
  const dir = path.join(app.getPath('userData'), 'tasks')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function exeDir(): string {
  return path.dirname(exePath())
}

export function exePath(): string {
  return app.getPath('exe')
}

export function resourcesDir(): string {
  if (is.dev) {
    return path.join(__dirname, '../../extra')
  } else {
    if (app.getAppPath().endsWith('asar')) {
      return process.resourcesPath
    } else {
      return path.join(app.getAppPath(), 'resources')
    }
  }
}

export function resourcesFilesDir(): string {
  return path.join(resourcesDir(), 'files')
}

export function themesDir(): string {
  return path.join(dataDir(), 'themes')
}

export function mihomoIpcPath(): string {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\Koala-Clash\\mihomo'
  }
  const { core = 'mihomo' } = getAppConfigSync()
  if (!checkCorePermissionSync(core)) {
    return '/tmp/koala-clash-mihomo-api-noperm.sock'
  }
  return '/tmp/koala-clash-mihomo-api.sock'
}

export function serviceIpcPath(): string {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\sparkle\\service'
  }
  return '/tmp/sparkle-service.sock'
}

export function mihomoCoreDir(): string {
  return path.join(resourcesDir(), 'sidecar')
}

// Cores fetched at runtime, since the app's own resources are not writable without elevation
export function downloadedCoreDir(): string {
  return path.join(dataDir(), 'sidecar')
}

export function mihomoCorePath(core: string): string {
  if (core === 'mihomo' || core === 'mihomo-alpha') {
    const file = `${core}${process.platform === 'win32' ? '.exe' : ''}`
    const bundledPath = path.join(mihomoCoreDir(), file)
    // Builds ship the alpha core only on opt-in, otherwise the user downloads it
    if (core === 'mihomo-alpha' && !existsSync(bundledPath)) {
      return path.join(downloadedCoreDir(), file)
    }
    return bundledPath
  }
  throw new Error(t('error.corePathError'))
}

export function installedCores(): AppConfig['core'][] {
  return (['mihomo', 'mihomo-alpha'] as const).filter((core) => existsSync(mihomoCorePath(core)))
}

export function servicePath(): string {
  const isWin = process.platform === 'win32'
  return path.join(resourcesFilesDir(), `sparkle-service${isWin ? '.exe' : ''}`)
}

export function appConfigPath(): string {
  return path.join(dataDir(), 'config.yaml')
}

export function controledMihomoConfigPath(): string {
  return path.join(dataDir(), 'mihomo.yaml')
}

export function profileConfigPath(): string {
  return path.join(dataDir(), 'profile.yaml')
}

export function profilesDir(): string {
  return path.join(dataDir(), 'profiles')
}

export function profilePath(id: string): string {
  return path.join(profilesDir(), `${id}.yaml`)
}

export function mihomoWorkDir(): string {
  return path.join(dataDir(), 'work')
}

export function mihomoProfileWorkDir(id: string | undefined): string {
  return path.join(mihomoWorkDir(), id || 'default')
}

export function mihomoTestDir(): string {
  return path.join(dataDir(), 'test')
}

export function mihomoWorkConfigPath(id: string | undefined): string {
  if (id === 'work') {
    return path.join(mihomoWorkDir(), 'config.yaml')
  } else {
    return path.join(mihomoProfileWorkDir(id), 'config.yaml')
  }
}

export function logDir(): string {
  return path.join(dataDir(), 'logs')
}

export function logPath(): string {
  const date = new Date()
  const name = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
  return path.join(logDir(), `${name}.log`)
}

export function rulesDir(): string {
  return path.join(dataDir(), 'rules')
}

export function rulePath(id: string): string {
  return path.join(rulesDir(), `${id}.yaml`)
}
