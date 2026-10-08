import { create } from 'zustand'
import dayjs from 'dayjs'

const MAX_LOGS = 500
// The core can emit bursts of lines; batching keeps the list at one update per tick.
const FLUSH_INTERVAL = 100

export interface LogEntry extends ControllerLog {
  // Sequence number in arrival order, shown in the row
  id: number
  // Full date and time, shown on hover
  time: string
  // Time only, shown in the row. Fixed width keeps the level badges aligned across rows.
  clock: string
}

interface LogsStore {
  // Newest first
  logs: LogEntry[]
  clear: () => void
}

let nextId = 1
let pending: LogEntry[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

// Drops unflushed lines and restarts numbering, so the first line after a clear is #1 again.
const reset = (): void => {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  pending = []
  nextId = 1
}

export const useLogsStore = create<LogsStore>((set) => ({
  logs: [],
  clear: (): void => {
    reset()
    set({ logs: [] })
  }
}))

const flush = (): void => {
  flushTimer = null
  const next = pending.reverse().concat(useLogsStore.getState().logs)
  pending = []
  useLogsStore.setState({ logs: next.length > MAX_LOGS ? next.slice(0, MAX_LOGS) : next })
}

const handleIpcPayload = (log: ControllerLog): void => {
  const now = dayjs()
  pending.push({ ...log, id: nextId++, time: now.format('L LTS'), clock: now.format('HH:mm:ss') })
  if (!flushTimer) {
    flushTimer = setTimeout(flush, FLUSH_INTERVAL)
  }
}

let attached = false
let ipcListener: ((event: unknown, payload: ControllerLog) => void) | null = null

export const attachLogsStore = (): (() => void) => {
  if (attached) {
    return () => {
      /* already attached, noop detach */
    }
  }
  attached = true

  ipcListener = (_event, payload): void => {
    handleIpcPayload(payload)
  }
  window.electron.ipcRenderer.on('mihomoLogs', ipcListener)

  return (): void => {
    if (!attached) return
    attached = false
    if (ipcListener) {
      window.electron.ipcRenderer.removeListener('mihomoLogs', ipcListener)
      ipcListener = null
    }
    reset()
    useLogsStore.setState({ logs: [] })
  }
}
