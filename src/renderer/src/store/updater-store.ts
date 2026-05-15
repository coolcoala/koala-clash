import { create } from 'zustand'

export interface UpdaterStatus {
  downloading: boolean
  progress: number
  error?: string
}

interface UpdaterStore extends UpdaterStatus {
  setStatus: (status: UpdaterStatus) => void
  reset: () => void
}

const initialStatus: UpdaterStatus = {
  downloading: false,
  progress: 0
}

export const useUpdaterStore = create<UpdaterStore>((set) => ({
  ...initialStatus,
  setStatus: (status): void => set(status),
  reset: (): void => set(initialStatus)
}))

let attached = false
let ipcListener: ((event: unknown, payload: UpdaterStatus) => void) | null = null

export const attachUpdaterStore = (): (() => void) => {
  if (attached) {
    return () => {
      /* already attached, noop detach */
    }
  }
  attached = true

  ipcListener = (_event, payload): void => {
    useUpdaterStore.setState({
      downloading: payload.downloading,
      progress: payload.progress,
      error: payload.error
    })
  }
  window.electron.ipcRenderer.on('update-status', ipcListener)

  return (): void => {
    if (!attached) return
    attached = false
    if (ipcListener) {
      window.electron.ipcRenderer.removeListener('update-status', ipcListener)
      ipcListener = null
    }
  }
}
