import fs from 'fs'
import { readFile } from 'fs/promises'
import path from 'path'
import plist from 'plist'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { findBestAppPath, isIOSApp } from './icon'

const execFileAsync = promisify(execFile)

// Names already looked up, and lookups still running, so each path costs one lookup per run
const appNames = new Map<string, Promise<string>>()

export function getAppName(appPath: string): Promise<string> {
  let name = appNames.get(appPath)
  if (!name) {
    name = lookupAppName(appPath)
    appNames.set(appPath, name)
  }
  return name
}

async function lookupAppName(appPath: string): Promise<string> {
  if (process.platform !== 'darwin') return ''
  try {
    const targetPath = findBestAppPath(appPath)
    if (!targetPath) return ''

    if (isIOSApp(targetPath)) {
      return await readBundleName(path.join(targetPath, 'Info.plist'))
    }

    try {
      const appName = await getLocalizedAppName(targetPath)
      if (appName) return appName
    } catch {
      // ignore
    }

    const plistPath = path.join(targetPath, 'Contents', 'Info.plist')
    if (fs.existsSync(plistPath)) {
      return await readBundleName(plistPath)
    }
  } catch {
    // ignore
  }
  return ''
}

async function readBundleName(plistPath: string): Promise<string> {
  const parsed = plist.parse(await readFile(plistPath, 'utf-8')) as Record<string, unknown>
  return (parsed.CFBundleDisplayName as string) || (parsed.CFBundleName as string) || ''
}

// osascript takes a noticeable moment to start. Run synchronously, it froze the whole app for
// every new process the connections page showed.
async function getLocalizedAppName(appPath: string): Promise<string> {
  const jxa = `ObjC.import('Foundation'); $.NSFileManager.defaultManager.displayNameAtPath(${JSON.stringify(appPath)}).js`
  const { stdout } = await execFileAsync('osascript', ['-l', 'JavaScript', '-e', jxa], {
    encoding: 'utf8',
    timeout: 5000
  })
  return stdout.trim()
}
