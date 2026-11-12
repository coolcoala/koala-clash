import { create } from 'zustand'
import { onIpc } from '@renderer/utils/ipc'

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
let detachIpc: (() => void) | null = null

export const attachUpdaterStore = (): (() => void) => {
  if (attached) {
    return () => {
      /* already attached, noop detach */
    }
  }
  attached = true

  detachIpc = onIpc<[UpdaterStatus]>('update-status', (payload) => {
    useUpdaterStore.setState({
      downloading: payload.downloading,
      progress: payload.progress,
      error: payload.error
    })
  })

  return (): void => {
    if (!attached) return
    attached = false
    detachIpc?.()
    detachIpc = null
  }
}
