import { mainWindow } from '..'
import { safeSend } from '../utils/safeSend'

export class CoreError extends Error {
  reason: CoreErrorReason

  constructor(reason: CoreErrorReason, detail: unknown) {
    super(detail instanceof Error ? detail.message : String(detail))
    this.name = 'CoreError'
    this.reason = reason
  }
}

let coreState: CoreState = { status: 'stopped' }

export function getCoreState(): CoreState {
  return coreState
}

function updateCoreState(state: CoreState): void {
  coreState = state
  safeSend(mainWindow, 'coreStateChanged', state)
}

export function setCoreStatus(status: 'starting' | 'running' | 'stopped'): void {
  if (status === 'running') {
    if (coreState.status === 'running' && !coreState.error) return
    // A core that came up is healthy again, so the previous failure no longer applies
    updateCoreState({ status })
    return
  }
  updateCoreState({ ...coreState, status })
}

export function reportCoreError(error: unknown): void {
  updateCoreState({
    // A config rejected before the old core was stopped leaves that core serving traffic
    status: coreState.status === 'running' ? 'running' : 'error',
    error: {
      reason: error instanceof CoreError ? error.reason : 'crashed',
      detail: error instanceof Error ? error.message : String(error),
      at: Date.now()
    }
  })
}
