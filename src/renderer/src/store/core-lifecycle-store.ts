import { create } from 'zustand'
import { getCoreState } from '@renderer/utils/ipc'

interface CoreLifecycleStore {
  startedAt: number
  coreState: CoreState
  // `at` of the error the user closed; a newer error opens the alert again
  dismissedErrorAt: number
}

export const useCoreLifecycleStore = create<CoreLifecycleStore>(() => ({
  startedAt: 0,
  coreState: { status: 'stopped' },
  dismissedErrorAt: 0
}))

export const subscribeCoreStarted = (callback: () => void): (() => void) =>
  useCoreLifecycleStore.subscribe((state, previous) => {
    if (state.startedAt !== previous.startedAt) callback()
  })

export const dismissCoreError = (): void => {
  const { error } = useCoreLifecycleStore.getState().coreState
  useCoreLifecycleStore.setState({ dismissedErrorAt: error?.at ?? 0 })
}

export const reopenCoreError = (): void => {
  useCoreLifecycleStore.setState({ dismissedErrorAt: 0 })
}

let attached = false
let ipcListener: (() => void) | null = null
let coreStateListener: ((_event: unknown, coreState: CoreState) => void) | null = null

export const attachCoreLifecycleStore = (): (() => void) => {
  if (attached) {
    return () => {
      /* already attached, noop detach */
    }
  }
  attached = true

  ipcListener = (): void => {
    useCoreLifecycleStore.setState({ startedAt: Date.now() })
  }
  window.electron.ipcRenderer.on('core-started', ipcListener)

  coreStateListener = (_event, coreState): void => {
    useCoreLifecycleStore.setState({ coreState })
  }
  window.electron.ipcRenderer.on('coreStateChanged', coreStateListener)
  // A failure at startup can happen before this window was listening for events
  getCoreState()
    .then((coreState) => useCoreLifecycleStore.setState({ coreState }))
    .catch(() => {})

  return (): void => {
    if (!attached) return
    attached = false
    if (ipcListener) {
      window.electron.ipcRenderer.removeListener('core-started', ipcListener)
      ipcListener = null
    }
    if (coreStateListener) {
      window.electron.ipcRenderer.removeListener('coreStateChanged', coreStateListener)
      coreStateListener = null
    }
  }
}
