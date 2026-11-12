import { useEffect } from 'react'
import useSWR from 'swr'
import { mihomoRules, onIpc } from '@renderer/utils/ipc'
import { subscribeCoreStarted } from '@renderer/store/core-lifecycle-store'

interface UseRulesResult {
  rules: ControllerRules | undefined
  mutate: () => void
}

// Loaded by the rules page, not at startup: the list can be long and nothing else shows it.
// The cached list shows at once and is refreshed on every visit, so a profile switched elsewhere
// (the tray menu, a hot reload) does not leave it stale.
export const useRules = (): UseRulesResult => {
  const { data: rules, mutate } = useSWR<ControllerRules>('mihomoRules', mihomoRules, {
    errorRetryInterval: 200,
    errorRetryCount: 10
  })

  // Mounted on every visit to the page, so the listener has to really go away on leaving it
  useEffect(() => {
    const detachIpc = onIpc('rulesUpdated', () => {
      mutate()
    })
    const unsubscribe = subscribeCoreStarted(() => {
      mutate()
    })
    return (): void => {
      detachIpc()
      unsubscribe()
    }
  }, [mutate])

  return { rules, mutate }
}
