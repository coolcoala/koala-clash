import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { getTotalTraffic, resetTotalTraffic } from '@renderer/utils/ipc'

interface TotalTrafficContextType {
  totalUp: number
  totalDown: number
  reset: () => void
}

const TotalTrafficContext = createContext<TotalTrafficContextType | undefined>(undefined)

export const TotalTrafficProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [totalUp, setTotalUp] = useState(0)
  const [totalDown, setTotalDown] = useState(0)

  useEffect(() => {
    const handleTotalTraffic = (_e: unknown, data: { up: number; down: number }): void => {
      setTotalUp(data.up)
      setTotalDown(data.down)
    }

    window.electron.ipcRenderer.on('totalTraffic', handleTotalTraffic)

    getTotalTraffic().then((data) => {
      if (data && typeof data === 'object') {
        setTotalUp(data.up || 0)
        setTotalDown(data.down || 0)
      }
    })

    return (): void => {
      window.electron.ipcRenderer.removeListener('totalTraffic', handleTotalTraffic)
    }
  }, [])

  const reset = async (): Promise<void> => {
    await resetTotalTraffic()
    setTotalUp(0)
    setTotalDown(0)
  }

  return (
    <TotalTrafficContext.Provider value={{ totalUp, totalDown, reset }}>
      {children}
    </TotalTrafficContext.Provider>
  )
}

export const useTotalTraffic = (): TotalTrafficContextType => {
  const context = useContext(TotalTrafficContext)
  if (context === undefined) {
    throw new Error('useTotalTraffic must be used within TotalTrafficProvider')
  }
  return context
}
