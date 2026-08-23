import { execFile } from 'child_process'
import { promisify } from 'util'
import { patchAppConfig } from '../config/app'
import { t } from './i18n'

const execFilePromise = promisify(execFile)

/**
 * Argument the app is relaunched with when the user dismisses the UAC prompt.
 * It suppresses the elevation attempt for that run, before the refusal is persisted.
 */
export const ELEVATION_DECLINED_ARG = 'elevation-declined'

/**
 * Remember that the user refused to elevate, so the request is not repeated on every launch,
 * and fall back to a setup that works without admin rights: system proxy instead of TUN.
 * Elevation can still be requested later from the core settings page.
 */
export async function declineElevation(): Promise<void> {
  await patchAppConfig({ elevationDeclined: true, mainSwitchMode: 'sysproxy' })
}

let isAdminCached: boolean | null = null

async function isRunningAsAdmin(): Promise<boolean> {
  if (isAdminCached !== null) {
    return isAdminCached
  }

  try {
    await execFilePromise('net', ['session'], { timeout: 2000 })
    isAdminCached = true
    return true
  } catch {
    isAdminCached = false
    return false
  }
}

export async function execWithElevation(command: string, args: string[]): Promise<void> {
  if (process.platform === 'win32') {
    try {
      if (await isRunningAsAdmin()) {
        await execFilePromise(command, args, { timeout: 30000 })
      } else {
        const psArgs = args
          .map((arg) => {
            const escaped = arg.replace(/'/g, "''")
            return `'${escaped}'`
          })
          .join(',')
        await execFilePromise(
          'powershell.exe',
          [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            `& { $p = Start-Process -FilePath '${command}' -ArgumentList @(${psArgs}) -Verb RunAs -WindowStyle Hidden -PassThru -Wait; exit $p.ExitCode }`
          ],
          { timeout: 30000 }
        )
      }
    } catch (error) {
      throw new Error(
        `${t('error.windowsElevationFailed')}：${error instanceof Error ? error.message : String(error)}`
      )
    }
  } else if (process.platform === 'linux') {
    try {
      await execFilePromise('pkexec', [command, ...args])
    } catch (error) {
      throw new Error(
        `${t('error.linuxElevationFailed')}：${error instanceof Error ? error.message : String(error)}`
      )
    }
  } else if (process.platform === 'darwin') {
    const cmd = `${command} ${args.join(' ')}`
    try {
      await execFilePromise('osascript', [
        '-e',
        `do shell script "${cmd}" with administrator privileges`
      ])
    } catch (error) {
      throw new Error(
        `${t('error.macosElevationFailed')}：${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}
