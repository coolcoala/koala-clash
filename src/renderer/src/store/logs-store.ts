import { create } from 'zustand'
import dayjs from 'dayjs'

const MAX_LOGS = 500

interface LogsStore {
  logs: ControllerLog[]
  clear: () => void
}

export const useLogsStore = create<LogsStore>((set) => ({
  logs: [],
  clear: (): void => set({ logs: [] })
}))

const handleIpcPayload = (log: ControllerLog): void => {
  log.time = dayjs().format('L LTS')
  const prev = useLogsStore.getState().logs
  const next = prev.length >= MAX_LOGS ? prev.slice(prev.length - MAX_LOGS + 1).concat(log) : prev.concat(log)
  useLogsStore.setState({ logs: next })
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
    useLogsStore.setState({ logs: [] })
  }
}
