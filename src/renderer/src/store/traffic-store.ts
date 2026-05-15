import { create } from 'zustand'

interface TrafficStore {
  traffic: ControllerTraffic
}

const initialTraffic: ControllerTraffic = {
  up: 0,
  down: 0,
  upTotal: 0,
  downTotal: 0
}

export const useTrafficStore = create<TrafficStore>(() => ({
  traffic: initialTraffic
}))

const handleIpcPayload = (payload: ControllerTraffic): void => {
  const prev = useTrafficStore.getState().traffic
  if (
    prev.up === payload.up &&
    prev.down === payload.down &&
    prev.upTotal === payload.upTotal &&
    prev.downTotal === payload.downTotal
  ) {
    return
  }
  useTrafficStore.setState({
    traffic: {
      up: payload.up,
      down: payload.down,
      upTotal: payload.upTotal,
      downTotal: payload.downTotal
    }
  })
}

let attached = false
let ipcListener: ((event: unknown, payload: ControllerTraffic) => void) | null = null

export const attachTrafficStore = (): (() => void) => {
  if (attached) {
    return () => {
      /* already attached, noop detach */
    }
  }
  attached = true

  ipcListener = (_event, payload): void => {
    handleIpcPayload(payload)
  }
  window.electron.ipcRenderer.on('mihomoTraffic', ipcListener)

  return (): void => {
    if (!attached) return
    attached = false
    if (ipcListener) {
      window.electron.ipcRenderer.removeListener('mihomoTraffic', ipcListener)
      ipcListener = null
    }
    useTrafficStore.setState({ traffic: initialTraffic })
  }
}
