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

export const useIconsStore = create<IconsStore>((set, get) => ({
  icons: {},
  appNames: {},
  requestIcon: (path): void => {
    if (!path) return
    const state = get()
    if (state.icons[path] || processingIcons.has(path) || iconQueue.has(path)) return
    try {
      const cached = localStorage.getItem(path)
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

      try {
        localStorage.setItem(path, processedDataURL)
      } catch {
        // ignore
      }

      useIconsStore.setState((s) => ({ icons: { ...s.icons, [path]: processedDataURL } }))
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
