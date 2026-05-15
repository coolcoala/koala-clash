import { addProfileItem, getProfileConfig } from '../config'

const TICK_INTERVAL_MS = 60_000
const START_DELAY_MS = 10_000

const inFlight = new Set<string>()
let started = false

function isDue(item: ProfileItem): boolean {
  if (item.type !== 'remote') return false
  if (!item.interval) return false
  if (item.autoUpdate === false) return false
  const timeSince = Date.now() - (item.updated || 0)
  return timeSince >= item.interval * 60 * 1000
}

async function runTick(): Promise<void> {
  try {
    const { items = [] } = await getProfileConfig()
    for (const item of items) {
      if (inFlight.has(item.id)) continue
      if (!isDue(item)) continue
      inFlight.add(item.id)
      try {
        await addProfileItem(item)
      } catch {
        // next tick will retry
      } finally {
        inFlight.delete(item.id)
      }
    }
  } catch {
    // ignore — ticker must not die
  } finally {
    setTimeout(runTick, TICK_INTERVAL_MS)
  }
}

export async function initProfileUpdater(): Promise<void> {
  if (started) return
  started = true
  setTimeout(runTick, START_DELAY_MS)
}
