import React, { createContext, useContext, ReactNode, useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import useSWR from 'swr'
import {
  getProfileConfig,
  setProfileConfig as set,
  addProfileItem as add,
  removeProfileItem as remove,
  updateProfileItem as update,
  changeCurrentProfile as change,
  onIpc
} from '@renderer/utils/ipc'

interface ProfileConfigContextType {
  profileConfig: ProfileConfig | undefined
  setProfileConfig: (config: ProfileConfig) => Promise<void>
  mutateProfileConfig: () => void
  addProfileItem: (item: Partial<ProfileItem>) => Promise<void>
  updateProfileItem: (item: ProfileItem) => Promise<void>
  removeProfileItem: (id: string) => Promise<void>
  changeCurrentProfile: (id: string) => Promise<void>
  hwidLimitError: string | null
  clearHwidLimitError: () => void
}

const ProfileConfigContext = createContext<ProfileConfigContextType | undefined>(undefined)

export const ProfileConfigProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data: profileConfig, mutate: mutateProfileConfig } = useSWR('getProfileConfig', () =>
    getProfileConfig()
  )
  const [hwidLimitError, setHwidLimitError] = useState<string | null>(null)

  const setHwidLimitErrorFromMessage = useCallback((message: string): void => {
    const match = message.match(/HWID_LIMIT:(.*)/)
    if (match) {
      setHwidLimitError(match[1].trim())
      return
    }
    setHwidLimitError(message.trim())
  }, [])

  const clearHwidLimitError = useCallback(() => setHwidLimitError(null), [])

  const setProfileConfig = async (config: ProfileConfig): Promise<void> => {
    try {
      await set(config)
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      mutateProfileConfig()
      window.electron.ipcRenderer.send('updateTrayMenu')
    }
  }

  const addProfileItem = async (item: Partial<ProfileItem>): Promise<void> => {
    try {
      await add(item)
    } catch (e) {
      if (`${e}`.includes('HWID_LIMIT')) {
        setHwidLimitErrorFromMessage(`${e}`)
      } else {
        toast.error(`${e}`)
      }
    } finally {
      mutateProfileConfig()
      window.electron.ipcRenderer.send('updateTrayMenu')
    }
  }

  const removeProfileItem = async (id: string): Promise<void> => {
    try {
      await remove(id)
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      mutateProfileConfig()
      window.electron.ipcRenderer.send('updateTrayMenu')
    }
  }

  const updateProfileItem = async (item: ProfileItem): Promise<void> => {
    try {
      await update(item)
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      mutateProfileConfig()
      window.electron.ipcRenderer.send('updateTrayMenu')
    }
  }

  const changeCurrentProfile = async (id: string): Promise<void> => {
    try {
      await change(id)
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      mutateProfileConfig()
      window.electron.ipcRenderer.send('updateTrayMenu')
    }
  }

  useEffect(() => {
    const detachProfileConfig = onIpc('profileConfigUpdated', () => {
      mutateProfileConfig()
    })
    const detachHwidLimit = onIpc<[string?]>('show-hwid-limit-error', (supportUrl = '') => {
      setHwidLimitErrorFromMessage(supportUrl)
    })

    return (): void => {
      detachProfileConfig()
      detachHwidLimit()
    }
  }, [mutateProfileConfig, setHwidLimitErrorFromMessage])

  return (
    <ProfileConfigContext.Provider
      value={{
        profileConfig,
        setProfileConfig,
        mutateProfileConfig,
        addProfileItem,
        removeProfileItem,
        updateProfileItem,
        changeCurrentProfile,
        hwidLimitError,
        clearHwidLimitError
      }}
    >
      {children}
    </ProfileConfigContext.Provider>
  )
}

export const useProfileConfig = (): ProfileConfigContextType => {
  const context = useContext(ProfileConfigContext)
  if (context === undefined) {
    throw new Error('useProfileConfig must be used within a ProfileConfigProvider')
  }
  return context
}
