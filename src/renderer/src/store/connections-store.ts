import { useEffect } from 'react'
import { create } from 'zustand'
import { onIpc, setMihomoConnectionsWanted } from '@renderer/utils/ipc'

export interface ConnectionsInfo {
  uploadTotal: number
  downloadTotal: number
  memory: number
}

interface ConnectionsStore {
  active: ControllerConnectionDetail[]
  closed: ControllerConnectionDetail[]
  info: ConnectionsInfo
  isPaused: boolean
  togglePause: () => void
  removeClosedById: (id: string) => void
  clearAllClosed: () => void
}

const MAX_CLOSED = 300

const initialInfo: ConnectionsInfo = {
  uploadTotal: 0,
  downloadTotal: 0,
  memory: 0
}

let previousActiveMap = new Map<string, ControllerConnectionDetail>()
// Set while the connections page is shown: the core streams the list only then
let streaming = false

export const useConnectionsStore = create<ConnectionsStore>((set) => ({
  active: [],
  closed: [],
  info: initialInfo,
  isPaused: false,
  togglePause: (): void => set((s) => ({ isPaused: !s.isPaused })),
  removeClosedById: (id): void =>
    set((s) => ({ closed: s.closed.filter((conn) => conn.id !== id) })),
  clearAllClosed: (): void => set({ closed: [] })
}))

const handleIpcPayload = (payload: ControllerConnections): void => {
  // A message sent just before the stream stopped
  if (!streaming) return
  const { uploadTotal, downloadTotal, memory } = payload
  const state = useConnectionsStore.getState()
  const prevInfo = state.info

  const infoChanged =
    prevInfo.uploadTotal !== uploadTotal ||
    prevInfo.downloadTotal !== downloadTotal ||
    prevInfo.memory !== memory

  if (infoChanged) {
    useConnectionsStore.setState({ info: { uploadTotal, downloadTotal, memory } })
  }

  if (state.isPaused) return
  const incoming = payload.connections
  if (!incoming) return

  const currentMap = new Map<string, ControllerConnectionDetail>()

  for (const conn of incoming) {
    if (conn.metadata.type === 'Inner') {
      conn.metadata.process = 'mihomo'
      conn.metadata.processPath = 'mihomo'
    }

    const pre = previousActiveMap.get(conn.id)
    conn.downloadSpeed = pre ? conn.download - pre.download : 0
    conn.uploadSpeed = pre ? conn.upload - pre.upload : 0
    conn.isActive = true

    previousActiveMap.delete(conn.id)
    currentMap.set(conn.id, conn)
  }

  let nextClosed = state.closed
  if (previousActiveMap.size > 0) {
    const newlyClosed: ControllerConnectionDetail[] = []
    for (const conn of previousActiveMap.values()) {
      conn.isActive = false
      conn.downloadSpeed = 0
      conn.uploadSpeed = 0
      newlyClosed.push(conn)
    }
    const merged = state.closed.concat(newlyClosed)
    nextClosed = merged.length > MAX_CLOSED ? merged.slice(merged.length - MAX_CLOSED) : merged
  }

  previousActiveMap = currentMap

  useConnectionsStore.setState({
    active: incoming,
    closed: nextClosed
  })
}

const setStreaming = (next: boolean): void => {
  if (next && !streaming) {
    // Totals from before the gap would turn into one huge speed sample
    previousActiveMap = new Map()
  }
  streaming = next
  setMihomoConnectionsWanted(next).catch(() => {})
}

// Streams connections while the calling page is mounted and the window is visible. The closed
// list is kept between visits, but only grows while the page is watched.
export const useConnectionsStream = (): void => {
  useEffect(() => {
    // Always sent on mount: a reloaded page must replace whatever the previous one asked for
    const sync = (): void => setStreaming(document.visibilityState === 'visible')
    sync()
    document.addEventListener('visibilitychange', sync)
    return (): void => {
      document.removeEventListener('visibilitychange', sync)
      setStreaming(false)
    }
  }, [])
}

let attached = false
let detachIpc: (() => void) | null = null

export const attachConnectionsStore = (): (() => void) => {
  if (attached) {
    return () => {
      /* already attached, noop detach */
    }
  }
  attached = true

  detachIpc = onIpc<[ControllerConnections]>('mihomoConnections', handleIpcPayload)

  return (): void => {
    if (!attached) return
    attached = false
    detachIpc?.()
    detachIpc = null
    previousActiveMap = new Map()
    useConnectionsStore.setState({
      active: [],
      closed: [],
      info: initialInfo,
      isPaused: false
    })
  }
}
