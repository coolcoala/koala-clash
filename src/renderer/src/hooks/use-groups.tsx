import React, { createContext, useContext, ReactNode } from 'react'
import useSWR, { KeyedMutator } from 'swr'
import { mihomoGroups, onIpc } from '@renderer/utils/ipc'
import { subscribeCoreStarted } from '@renderer/store/core-lifecycle-store'

interface GroupsContextType {
  groups: ControllerMixedGroup[] | undefined
  mutate: KeyedMutator<ControllerMixedGroup[]>
}

const GroupsContext = createContext<GroupsContextType | undefined>(undefined)

// The groups last seen, shown until the core is up so that the current server is there from the
// first frame instead of a moment after the window. Only the newest delay of each proxy is kept,
// which is all the pages show.
const SNAPSHOT_KEY = 'groupsSnapshot'

const readSnapshot = (): ControllerMixedGroup[] | undefined => {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    return raw ? (JSON.parse(raw) as ControllerMixedGroup[]) : undefined
  } catch {
    return undefined
  }
}

const writeSnapshot = (groups: ControllerMixedGroup[]): void => {
  const compact = groups.map((group) => ({
    ...group,
    extra: {},
    history: group.history?.slice(-1) ?? [],
    all: group.all.map((proxy) => ({
      ...proxy,
      extra: {},
      history: proxy.history?.slice(-1) ?? []
    }))
  }))
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(compact))
  } catch {
    // ignore
  }
}

const snapshot = readSnapshot()
let pendingSnapshot: ControllerMixedGroup[] | null = null

// Written when the window is idle, and only the latest of several fetches in a row
const saveSnapshot = (groups: ControllerMixedGroup[]): void => {
  if (pendingSnapshot === null) {
    requestIdleCallback(
      () => {
        const latest = pendingSnapshot
        pendingSnapshot = null
        if (latest) writeSnapshot(latest)
      },
      { timeout: 2000 }
    )
  }
  pendingSnapshot = groups
}

export const GroupsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data: groups, mutate } = useSWR<ControllerMixedGroup[]>('mihomoGroups', mihomoGroups, {
    errorRetryInterval: 200,
    errorRetryCount: 10,
    keepPreviousData: true,
    dedupingInterval: 300,
    fallbackData: snapshot,
    onSuccess: saveSnapshot
  })

  React.useEffect(() => {
    const detachIpc = onIpc('groupsUpdated', () => {
      mutate()
    })
    const unsubscribe = subscribeCoreStarted(() => {
      mutate()
    })
    return (): void => {
      detachIpc()
      unsubscribe()
    }
  }, [])

  return <GroupsContext.Provider value={{ groups, mutate }}>{children}</GroupsContext.Provider>
}

export const useGroups = (): GroupsContextType => {
  const context = useContext(GroupsContext)
  if (context === undefined) {
    throw new Error('useGroups must be used within an GroupsProvider')
  }
  return context
}
