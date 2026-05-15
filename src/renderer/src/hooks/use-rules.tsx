import React, { createContext, useContext, ReactNode } from 'react'
import useSWR from 'swr'
import { mihomoRules } from '@renderer/utils/ipc'
import { subscribeCoreStarted } from '@renderer/store/core-lifecycle-store'

interface RulesContextType {
  rules: ControllerRules | undefined
  mutate: () => void
}

const RulesContext = createContext<RulesContextType | undefined>(undefined)

export const RulesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data: rules, mutate } = useSWR<ControllerRules>('mihomoRules', mihomoRules, {
    errorRetryInterval: 200,
    errorRetryCount: 10
  })

  React.useEffect(() => {
    const onRulesUpdated = (): void => {
      mutate()
    }
    window.electron.ipcRenderer.on('rulesUpdated', onRulesUpdated)
    const unsubscribe = subscribeCoreStarted(() => {
      mutate()
    })
    return (): void => {
      window.electron.ipcRenderer.removeListener('rulesUpdated', onRulesUpdated)
      unsubscribe()
    }
  }, [])

  return <RulesContext.Provider value={{ rules, mutate }}>{children}</RulesContext.Provider>
}

export const useRules = (): RulesContextType => {
  const context = useContext(RulesContext)
  if (context === undefined) {
    throw new Error('useRules must be used within an RulesProvider')
  }
  return context
}
