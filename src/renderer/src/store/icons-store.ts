import { create } from 'zustand'
import { useEffect } from 'react'
import { getIconDataURL, getAppName } from '@renderer/utils/ipc'
import { cropAndPadTransparent } from '@renderer/utils/image'
import { platform } from '@renderer/utils/init'

interface IconsStore {
  icons: Record<string, string>
  appNames: Record<string, string>
  requestIcon: (path: string) => void
  requestAppName: (path: string) => void
}

const ICON_CONCURRENCY = 5
const APP_NAME_CONCURRENCY = 3
const SCHEDULE_DELAY_MS = 50

const iconQueue = new Set<string>()
const processingIcons = new Set<string>()
let iconTimer: ReturnType<typeof setTimeout> | null = null

const appNameQueue = new Set<string>()
const processingAppNames = new Set<string>()
let appNameTimer: ReturnType<typeof setTimeout> | null = null

// A path stores only the hash of its icon, so paths sharing one (every CLI tool gets the
// default icon, helper processes reuse their app's) keep a single copy of the image
const ICON_PATH_PREFIX = 'icon:'
const ICON_DATA_PREFIX = 'iconData:'
const ICON_CACHE_VERSION_KEY = 'iconCacheVersion'
const ICON_CACHE_VERSION = '2'

const iconsByHash = new Map<string, string>()

// cyrb53, a fast 53-bit string hash
const hashIcon = (dataURL: string): string => {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < dataURL.length; i++) {
    const ch = dataURL.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

const readCachedIcon = (path: string): string | null => {
  const hash = localStorage.getItem(ICON_PATH_PREFIX + path)
  if (!hash) return null
  const known = iconsByHash.get(hash)
  if (known) return known
  const dataURL = localStorage.getItem(ICON_DATA_PREFIX + hash)
  if (dataURL) iconsByHash.set(hash, dataURL)
  return dataURL
}

const cacheIcon = (path: string, dataURL: string): string => {
  const hash = hashIcon(dataURL)
  const shared = iconsByHash.get(hash) ?? dataURL
  iconsByHash.set(hash, shared)
  try {
    if (localStorage.getItem(ICON_DATA_PREFIX + hash) === null) {
      localStorage.setItem(ICON_DATA_PREFIX + hash, shared)
    }
    localStorage.setItem(ICON_PATH_PREFIX + path, hash)
  } catch {
    // ignore
  }
  return shared
}

// Earlier versions kept a full-size icon under each raw path, which filled the storage quota
const dropLegacyIconCache = (): void => {
  if (localStorage.getItem(ICON_CACHE_VERSION_KEY) === ICON_CACHE_VERSION) return
  for (const key of Object.keys(localStorage)) {
    // Proxy group icons are keyed by their URL
    if (
      key.startsWith('http') ||
      key.startsWith(ICON_PATH_PREFIX) ||
      key.startsWith(ICON_DATA_PREFIX)
    ) {
      continue
    }
    if (localStorage.getItem(key)?.startsWith('data:')) localStorage.removeItem(key)
  }
  localStorage.setItem(ICON_CACHE_VERSION_KEY, ICON_CACHE_VERSION)
}

try {
  dropLegacyIconCache()
} catch {
  // ignore
}

export const useIconsStore = create<IconsStore>((set, get) => ({
  icons: {},
  appNames: {},
  requestIcon: (path): void => {
    if (!path) return
    const state = get()
    if (state.icons[path] || processingIcons.has(path) || iconQueue.has(path)) return
    try {
      const cached = readCachedIcon(path)
      if (cached) {
        set((s) => ({ icons: { ...s.icons, [path]: cached } }))
        return
      }
    } catch {
      // ignore
    }
    iconQueue.add(path)
    scheduleIconProcess()
  },
  requestAppName: (path): void => {
    if (!path) return
    const state = get()
    if (state.appNames[path] || processingAppNames.has(path) || appNameQueue.has(path)) return
    appNameQueue.add(path)
    scheduleAppNameProcess()
  }
}))

const scheduleIconProcess = (): void => {
  if (iconTimer) return
  iconTimer = setTimeout(() => {
    iconTimer = null
    void processIcons()
  }, SCHEDULE_DELAY_MS)
}

const processIcons = async (): Promise<void> => {
  const slots = ICON_CONCURRENCY - processingIcons.size
  if (slots <= 0 || iconQueue.size === 0) return
  const toProcess = Array.from(iconQueue).slice(0, slots)
  toProcess.forEach((p) => iconQueue.delete(p))

  const promises = toProcess.map(async (path) => {
    processingIcons.add(path)
    try {
      const rawBase64 = await getIconDataURL(path)
      if (!rawBase64) return

      const fullDataURL = rawBase64.startsWith('data:')
        ? rawBase64
        : `data:image/png;base64,${rawBase64}`

      let processedDataURL = fullDataURL
      if (platform !== 'darwin') {
        processedDataURL = await cropAndPadTransparent(fullDataURL)
      }

      const iconDataURL = cacheIcon(path, processedDataURL)
      useIconsStore.setState((s) => ({ icons: { ...s.icons, [path]: iconDataURL } }))
    } catch {
      // ignore
    } finally {
      processingIcons.delete(path)
    }
  })

  await Promise.all(promises)
  if (iconQueue.size > 0) scheduleIconProcess()
}

const scheduleAppNameProcess = (): void => {
  if (appNameTimer) return
  appNameTimer = setTimeout(() => {
    appNameTimer = null
    void processAppNames()
  }, SCHEDULE_DELAY_MS)
}

const processAppNames = async (): Promise<void> => {
  const slots = APP_NAME_CONCURRENCY - processingAppNames.size
  if (slots <= 0 || appNameQueue.size === 0) return
  const toProcess = Array.from(appNameQueue).slice(0, slots)
  toProcess.forEach((p) => appNameQueue.delete(p))

  const promises = toProcess.map(async (path) => {
    processingAppNames.add(path)
    try {
      const appName = await getAppName(path)
      if (appName) {
        useIconsStore.setState((s) => ({ appNames: { ...s.appNames, [path]: appName } }))
      }
    } catch {
      // ignore
    } finally {
      processingAppNames.delete(path)
    }
  })

  await Promise.all(promises)
  if (appNameQueue.size > 0) scheduleAppNameProcess()
}

export function useProcessIcon(path: string, enabled: boolean): string {
  const requestIcon = useIconsStore((s) => s.requestIcon)
  const icon = useIconsStore((s) => s.icons[path] || '')

  useEffect(() => {
    if (enabled && path) requestIcon(path)
  }, [path, enabled, requestIcon])

  return enabled ? icon : ''
}

export function useProcessAppName(path: string, enabled: boolean): string {
  const requestAppName = useIconsStore((s) => s.requestAppName)
  const appName = useIconsStore((s) => s.appNames[path] || '')

  useEffect(() => {
    if (enabled && path) requestAppName(path)
  }, [path, enabled, requestAppName])

  return enabled ? appName : ''
}
