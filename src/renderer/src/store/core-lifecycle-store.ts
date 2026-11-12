import { create } from 'zustand'
import { getCoreState, onIpc } from '@renderer/utils/ipc'

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
let detachIpc: (() => void)[] = []

export const attachCoreLifecycleStore = (): (() => void) => {
  if (attached) {
    return () => {
      /* already attached, noop detach */
    }
  }
  attached = true

  detachIpc = [
    onIpc('core-started', () => {
      useCoreLifecycleStore.setState({ startedAt: Date.now() })
    }),
    onIpc<[CoreState]>('coreStateChanged', (coreState) => {
      useCoreLifecycleStore.setState({ coreState })
    })
  ]
  // A failure at startup can happen before this window was listening for events
  getCoreState()
    .then((coreState) => useCoreLifecycleStore.setState({ coreState }))
    .catch(() => {})

  return (): void => {
    if (!attached) return
    attached = false
    detachIpc.forEach((detach) => detach())
    detachIpc = []
  }
}
