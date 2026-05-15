import BasePage from '@renderer/components/base/base-page'
import { mihomoCloseAllConnections, mihomoCloseConnection } from '@renderer/utils/ipc'
import { useConnectionsStore } from '@renderer/store/connections-store'
import React, { useCallback, useMemo, useState } from 'react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from '@renderer/components/ui/input-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { calcTraffic } from '@renderer/utils/calc'
import ConnectionItem from '@renderer/components/connections/connection-item'
import ConnectionTable from '@renderer/components/connections/connection-table'
import ProcessItem, { ProcessGroup } from '@renderer/components/connections/process-item'
import { Virtuoso } from 'react-virtuoso'
import dayjs from 'dayjs'
import ConnectionDetailModal from '@renderer/components/connections/connection-detail-modal'
import ConnectionSettingModal from '@renderer/components/connections/connection-setting-modal'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { includesIgnoreCase } from '@renderer/utils/includes'
import { useIconsStore, useProcessAppName } from '@renderer/store/icons-store'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useTranslation } from 'react-i18next'
import {
  ArrowDownNarrowWide,
  ArrowDownWideNarrow,
  ArrowLeft,
  Pause,
  Play,
  SlidersHorizontal,
  Table2,
  TableOfContents,
  Trash2,
  X
} from 'lucide-react'

const Connections: React.FC = () => {
  const { t } = useTranslation()
  const { controledMihomoConfig } = useControledMihomoConfig()
  const { 'find-process-mode': findProcessMode = 'always' } = controledMihomoConfig || {}
  const [filter, setFilter] = useState('')
  const { appConfig, patchAppConfig } = useAppConfig()
  const {
    connectionDirection = 'asc',
    connectionOrderBy = 'time',
    connectionListMode = 'process',
    connectionViewMode = 'list',
    connectionTableColumns = [
      'status',
      'establishTime',
      'type',
      'host',
      'process',
      'rule',
      'proxyChain',
      'remoteDestination',
      'uploadSpeed',
      'downloadSpeed',
      'upload',
      'download'
    ],
    connectionTableColumnWidths,
    connectionTableSortColumn,
    connectionTableSortDirection,
    displayIcon = true,
    displayAppName = true
  } = appConfig || {}
  const info = useConnectionsStore((s) => s.info)
  const activeConnections = useConnectionsStore((s) => s.active)
  const closedConnections = useConnectionsStore((s) => s.closed)
  const isPaused = useConnectionsStore((s) => s.isPaused)
  const togglePause = useConnectionsStore((s) => s.togglePause)
  const removeClosedById = useConnectionsStore((s) => s.removeClosedById)
  const clearAllClosed = useConnectionsStore((s) => s.clearAllClosed)

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isSettingModalOpen, setIsSettingModalOpen] = useState(false)
  const [selected, setSelected] = useState<ControllerConnectionDetail>()

  const [tab, setTab] = useState('active')
  const [viewMode, setViewMode] = useState<'list' | 'table'>(connectionViewMode)
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(connectionTableColumns))

  // Two-level navigation: null = process list, string = selected process path
  const [selectedProcess, setSelectedProcess] = useState<string | null>(null)

  const columnOptions = useMemo(
    () => [
      { key: 'status', label: t('connections.detail.status') },
      { key: 'establishTime', label: t('connections.detail.establishTime') },
      { key: 'type', label: t('connections.detail.connectionType') },
      { key: 'host', label: t('connections.detail.host') },
      { key: 'sniffHost', label: t('connections.detail.sniffHost') },
      { key: 'process', label: t('connections.detail.processName') },
      { key: 'processPath', label: t('connections.detail.processPath') },
      { key: 'rule', label: t('connections.detail.rule') },
      { key: 'proxyChain', label: t('connections.detail.proxyChain') },
      { key: 'sourceIP', label: t('connections.detail.sourceIP') },
      { key: 'sourcePort', label: t('connections.detail.sourcePort') },
      { key: 'destinationPort', label: t('connections.detail.destinationPort') },
      { key: 'inboundIP', label: t('connections.detail.inboundIP') },
      { key: 'inboundPort', label: t('connections.detail.inboundPort') },
      { key: 'uploadSpeed', label: t('pages.connections.uploadSpeed') },
      { key: 'downloadSpeed', label: t('pages.connections.downloadSpeed') },
      { key: 'upload', label: t('pages.connections.uploadAmount') },
      { key: 'download', label: t('pages.connections.downloadAmount') },
      { key: 'dscp', label: t('connections.detail.dscp') },
      { key: 'remoteDestination', label: t('connections.detail.remoteDestination') },
      { key: 'dnsMode', label: t('connections.detail.dnsMode') }
    ],
    [t]
  )

  // Build process groups from connections
  const processGroups = useMemo(() => {
    const groupMap = new Map<
      string,
      {
        processPath: string
        processName: string
        activeCount: number
        closedCount: number
        totalUpload: number
        totalDownload: number
        totalUploadSpeed: number
        totalDownloadSpeed: number
      }
    >()

    const addToGroup = (conn: ControllerConnectionDetail, isActive: boolean) => {
      const processPath =
        conn.metadata.processPath || conn.metadata.process || conn.metadata.sourceIP || ''
      const processName = conn.metadata.process || conn.metadata.sourceIP || ''
      const existing = groupMap.get(processPath)
      if (existing) {
        if (isActive) {
          existing.activeCount++
          existing.totalUploadSpeed += conn.uploadSpeed || 0
          existing.totalDownloadSpeed += conn.downloadSpeed || 0
        } else {
          existing.closedCount++
        }
        existing.totalUpload += conn.upload
        existing.totalDownload += conn.download
      } else {
        groupMap.set(processPath, {
          processPath,
          processName,
          activeCount: isActive ? 1 : 0,
          closedCount: isActive ? 0 : 1,
          totalUpload: conn.upload,
          totalDownload: conn.download,
          totalUploadSpeed: isActive ? conn.uploadSpeed || 0 : 0,
          totalDownloadSpeed: isActive ? conn.downloadSpeed || 0 : 0
        })
      }
    }

    activeConnections.forEach((conn) => addToGroup(conn, true))
    closedConnections.forEach((conn) => addToGroup(conn, false))

    const groups: ProcessGroup[] = Array.from(groupMap.values())

    groups.sort((a, b) => {
      if (b.activeCount !== a.activeCount) return b.activeCount - a.activeCount
      return b.totalUpload + b.totalDownload - (a.totalUpload + a.totalDownload)
    })

    return groups
  }, [activeConnections, closedConnections])

  const filteredProcessGroups = useMemo(() => {
    if (filter === '') return processGroups
    const appNames = useIconsStore.getState().appNames
    return processGroups.filter((pg) => {
      const name = displayAppName && pg.processPath ? appNames[pg.processPath] : undefined
      const searchable = [pg.processName, name, pg.processPath].filter(Boolean).join(' ')
      return includesIgnoreCase(searchable, filter)
    })
  }, [processGroups, filter, displayAppName])

  const filteredConnections = useMemo(() => {
    const connections = tab === 'active' ? activeConnections : closedConnections

    let filtered = connections

    // When a process is selected, filter by process
    if (selectedProcess !== null) {
      filtered = filtered.filter((conn) => {
        const connProcessPath =
          conn.metadata.processPath || conn.metadata.process || conn.metadata.sourceIP || ''
        return connProcessPath === selectedProcess
      })
    }

    if (filter !== '') {
      filtered = filtered.filter((connection) => {
        const searchableFields = [
          connection.metadata.process,
          connection.metadata.host,
          connection.metadata.sniffHost,
          connection.metadata.destinationIP,
          connection.metadata.remoteDestination,
          connection.metadata.sourceIP,
          connection.chains?.[0],
          connection.rule,
          connection.rulePayload
        ]
          .filter(Boolean)
          .join(' ')

        return includesIgnoreCase(searchableFields, filter)
      })
    }

    if (connectionOrderBy) {
      filtered = [...filtered].sort((a, b) => {
        if (connectionDirection === 'asc') {
          switch (connectionOrderBy) {
            case 'time':
              return dayjs(b.start).unix() - dayjs(a.start).unix()
            case 'upload':
              return a.upload - b.upload
            case 'download':
              return a.download - b.download
            case 'uploadSpeed':
              return (a.uploadSpeed || 0) - (b.uploadSpeed || 0)
            case 'downloadSpeed':
              return (a.downloadSpeed || 0) - (b.downloadSpeed || 0)
            case 'process':
              return (a.metadata.process || '').localeCompare(b.metadata.process || '')
          }
        } else {
          switch (connectionOrderBy) {
            case 'time':
              return dayjs(a.start).unix() - dayjs(b.start).unix()
            case 'upload':
              return b.upload - a.upload
            case 'download':
              return b.download - a.download
            case 'uploadSpeed':
              return (b.uploadSpeed || 0) - (a.uploadSpeed || 0)
            case 'downloadSpeed':
              return (b.downloadSpeed || 0) - (a.downloadSpeed || 0)
            case 'process':
              return (b.metadata.process || '').localeCompare(a.metadata.process || '')
          }
        }
      })
    }

    return filtered
  }, [
    activeConnections,
    closedConnections,
    filter,
    connectionDirection,
    connectionOrderBy,
    tab,
    selectedProcess
  ])

  const closeAllConnections = useCallback((): void => {
    if (tab === 'active') {
      mihomoCloseAllConnections()
    } else {
      clearAllClosed()
    }
  }, [tab, clearAllClosed])

  const closeConnection = useCallback(
    (id: string): void => {
      if (tab === 'active') {
        mihomoCloseConnection(id)
      } else {
        removeClosedById(id)
      }
    },
    [tab, removeClosedById]
  )

  const handleColumnWidthChange = useCallback(
    async (widths: Record<string, number>) => {
      await patchAppConfig({ connectionTableColumnWidths: widths })
    },
    [patchAppConfig]
  )

  const handleSortChange = useCallback(
    async (column: string | null, direction: 'asc' | 'desc') => {
      await patchAppConfig({
        connectionTableSortColumn: column || undefined,
        connectionTableSortDirection: direction
      })
    },
    [patchAppConfig]
  )

  const handleTabChange = useCallback((value: string) => {
    setTab(value)
  }, [])

  const handleOrderByChange = useCallback(
    async (value: string) => {
      await patchAppConfig({
        connectionOrderBy: value as
          | 'time'
          | 'upload'
          | 'download'
          | 'uploadSpeed'
          | 'downloadSpeed'
          | 'process'
      })
    },
    [patchAppConfig]
  )

  const handleDirectionToggle = useCallback(async () => {
    await patchAppConfig({
      connectionDirection: connectionDirection === 'asc' ? 'desc' : 'asc'
    })
  }, [connectionDirection, patchAppConfig])

  const handleVisibleColumnToggle = useCallback(
    (key: string, checked: boolean) => {
      setVisibleColumns((prev) => {
        const next = new Set(prev)
        if (checked) {
          next.add(key)
        } else {
          next.delete(key)
        }
        void patchAppConfig({ connectionTableColumns: Array.from(next) })
        return next
      })
    },
    [patchAppConfig]
  )

  const handleProcessClick = useCallback((processPath: string) => {
    setSelectedProcess(processPath)
    setFilter('')
    setTab('active')
  }, [])

  const handleBackToProcesses = useCallback(() => {
    setSelectedProcess(null)
    setFilter('')
  }, [])

  const selectedProcessAppName = useProcessAppName(
    selectedProcess || '',
    displayAppName && selectedProcess !== null
  )

  const selectedProcessName = useMemo(() => {
    if (selectedProcess === null) return ''
    if (selectedProcessAppName) return selectedProcessAppName
    const group = processGroups.find((g) => g.processPath === selectedProcess)
    if (!group) return selectedProcess
    return group.processName || t('pages.connections.unknownProcess')
  }, [selectedProcess, selectedProcessAppName, processGroups, t])

  const matchesSelectedProcess = useCallback(
    (conn: ControllerConnectionDetail) => {
      const connProcessPath =
        conn.metadata.processPath || conn.metadata.process || conn.metadata.sourceIP || ''
      return connProcessPath === selectedProcess
    },
    [selectedProcess]
  )

  const processActiveCount = useMemo(() => {
    if (selectedProcess === null) return 0
    return activeConnections.filter(matchesSelectedProcess).length
  }, [activeConnections, selectedProcess, matchesSelectedProcess])

  const processClosedCount = useMemo(() => {
    if (selectedProcess === null) return 0
    return closedConnections.filter(matchesSelectedProcess).length
  }, [closedConnections, selectedProcess, matchesSelectedProcess])

  const iconEnabled = displayIcon && findProcessMode !== 'off'

  const renderConnectionItem = useCallback(
    (i: number, connection: ControllerConnectionDetail) => {
      return (
        <ConnectionItem
          setSelected={setSelected}
          setIsDetailModalOpen={setIsDetailModalOpen}
          displayIcon={iconEnabled}
          displayAppName={displayAppName}
          close={closeConnection}
          index={i}
          key={connection.id}
          info={connection}
        />
      )
    },
    [iconEnabled, displayAppName, closeConnection]
  )

  const renderProcessItem = useCallback(
    (_i: number, process: ProcessGroup) => {
      return (
        <ProcessItem
          key={process.processPath}
          process={process}
          displayIcon={iconEnabled}
          displayAppName={displayAppName}
          onClick={handleProcessClick}
        />
      )
    },
    [iconEnabled, displayAppName, handleProcessClick]
  )

  // Whether we are in the process list view (level 1) or connections view (level 2)
  // In classic mode, we never show the process list
  const isClassicMode = connectionListMode === 'classic'
  const isProcessListView = !isClassicMode && selectedProcess === null

  return (
    <BasePage
      title={
        isProcessListView
          ? t('pages.connections.title')
          : isClassicMode
            ? t('pages.connections.title')
            : selectedProcessName
      }
      header={
        <div className="flex items-center gap-1">
          <div className="flex h-8 items-center gap-1 whitespace-nowrap">
            <span className="px-1 text-gray-400">
              {'\u2191'} {calcTraffic(info.uploadTotal)}
            </span>
            <span className="px-1 text-gray-400">
              {'\u2193'} {calcTraffic(info.downloadTotal)}
            </span>
          </div>
          {!isProcessListView && (
            <Button
              className="app-nodrag shrink-0"
              title={
                viewMode === 'list'
                  ? t('pages.connections.switchToTable')
                  : t('pages.connections.switchToList')
              }
              size="icon-sm"
              variant="ghost"
              onClick={async () => {
                const newMode = viewMode === 'list' ? 'table' : 'list'
                setViewMode(newMode)
                await patchAppConfig({ connectionViewMode: newMode })
              }}
            >
              {viewMode === 'list' ? (
                <Table2 className="text-lg" />
              ) : (
                <TableOfContents className="text-lg" />
              )}
            </Button>
          )}
          <Button
            className="app-nodrag shrink-0"
            title={isPaused ? t('connections.resume') : t('connections.pause')}
            size="icon-sm"
            variant="ghost"
            onClick={togglePause}
          >
            {isPaused ? <Play className="text-lg" /> : <Pause className="text-lg" />}
          </Button>
          {!isProcessListView && (
            <div className="relative flex items-center">
              <Button
                className="app-nodrag shrink-0"
                title={
                  tab === 'active'
                    ? t('pages.connections.closeAll')
                    : t('pages.connections.clearClosed')
                }
                size="icon-sm"
                variant="ghost"
                onClick={() => {
                  if (filter === '') {
                    closeAllConnections()
                  } else {
                    filteredConnections.forEach((conn) => {
                      closeConnection(conn.id)
                    })
                  }
                }}
              >
                {tab === 'active' ? (
                  <X className="size-4" />
                ) : (
                  <Trash2 className="relative -top-px size-4" />
                )}
              </Button>
              <Badge className="absolute -top-0.5 -right-0.5 min-w-3 h-3 justify-center px-0.5 text-[8px] leading-none">
                {filteredConnections.length}
              </Badge>
            </div>
          )}
          <Button
            size="icon-sm"
            className="app-nodrag shrink-0"
            variant="ghost"
            title={t('pages.connections.connectionSettings')}
            onClick={() => setIsSettingModalOpen(true)}
          >
            <SlidersHorizontal className="text-lg" />
          </Button>
        </div>
      }
    >
      {isDetailModalOpen && selected && (
        <ConnectionDetailModal onClose={() => setIsDetailModalOpen(false)} connection={selected} />
      )}
      {isSettingModalOpen && (
        <ConnectionSettingModal onClose={() => setIsSettingModalOpen(false)} />
      )}
      <div className="overflow-x-auto sticky top-0 z-40">
        <div className="flex px-2 pb-2 gap-2">
          {isProcessListView ? (
            <>
              <div className="flex h-8 items-center">
                <span className="mr-2 text-sm text-muted-foreground whitespace-nowrap">
                  {t('pages.connections.processes')}
                </span>
                <Badge variant="default" className="min-w-5 justify-center px-1.5 leading-none">
                  {processGroups.length}
                </Badge>
              </div>
              <InputGroup className="h-8 w-45 min-w-30">
                <InputGroupInput
                  className="h-8 text-sm"
                  value={filter}
                  placeholder={t('common.filter')}
                  onChange={(event) => setFilter(event.target.value)}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    variant="ghost"
                    className={filter ? '' : 'opacity-0 pointer-events-none'}
                    disabled={!filter}
                    aria-label="Clear filter"
                    onClick={() => setFilter('')}
                  >
                    <X className="text-base" />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </>
          ) : (
            <>
              {!isClassicMode && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1 shrink-0"
                  onClick={handleBackToProcesses}
                >
                  <ArrowLeft className="size-4" />
                  {t('pages.connections.backToProcesses')}
                </Button>
              )}
              <Tabs value={tab} onValueChange={handleTabChange} className="w-fit">
                <TabsList>
                  <TabsTrigger value="active" className="gap-2">
                    <Badge variant="default" className="min-w-5 justify-center px-1 leading-none">
                      {isClassicMode ? activeConnections.length : processActiveCount}
                    </Badge>
                    <span>{t('pages.connections.active')}</span>
                  </TabsTrigger>
                  <TabsTrigger value="closed" className="gap-2">
                    <Badge
                      variant="destructive"
                      className="min-w-5 justify-center px-1 leading-none"
                    >
                      {isClassicMode ? closedConnections.length : processClosedCount}
                    </Badge>
                    <span>{t('pages.connections.closed')}</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <InputGroup className="h-8 w-45 min-w-30">
                <InputGroupInput
                  className="h-8 text-sm"
                  value={filter}
                  placeholder={t('common.filter')}
                  onChange={(event) => setFilter(event.target.value)}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    variant="ghost"
                    className={filter ? '' : 'opacity-0 pointer-events-none'}
                    disabled={!filter}
                    aria-label="Clear filter"
                    onClick={() => setFilter('')}
                  >
                    <X className="text-base" />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>

              {viewMode === 'table' && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="secondary" className="gap-1.5">
                      <SlidersHorizontal className="text-2xl" />
                      {t('pages.connections.tableColumns')}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-64" aria-label="Column visibility">
                    {columnOptions.map((option) => (
                      <DropdownMenuCheckboxItem
                        key={option.key}
                        checked={visibleColumns.has(option.key)}
                        onCheckedChange={(checked) =>
                          handleVisibleColumnToggle(option.key, checked)
                        }
                      >
                        {option.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {viewMode === 'list' && (
                <>
                  <Select value={connectionOrderBy} onValueChange={handleOrderByChange}>
                    <SelectTrigger size="sm" className="min-w-50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value="upload">{t('pages.connections.uploadAmount')}</SelectItem>
                      <SelectItem value="download">
                        {t('pages.connections.downloadAmount')}
                      </SelectItem>
                      <SelectItem value="uploadSpeed">
                        {t('pages.connections.uploadSpeed')}
                      </SelectItem>
                      <SelectItem value="downloadSpeed">
                        {t('pages.connections.downloadSpeed')}
                      </SelectItem>
                      <SelectItem value="time">{t('pages.connections.time')}</SelectItem>
                      <SelectItem value="process">{t('pages.connections.processName')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    className="border flex items-center justify-center p-0 bg-clip-border"
                    size="icon-sm"
                    variant="secondary"
                    onClick={handleDirectionToggle}
                  >
                    {connectionDirection === 'asc' ? (
                      <ArrowDownNarrowWide className="text-lg" />
                    ) : (
                      <ArrowDownWideNarrow className="text-lg" />
                    )}
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>
      <div className="h-[calc(100vh-106px)] mt-px mb-2">
        {isProcessListView ? (
          <Virtuoso
            data={filteredProcessGroups}
            itemContent={renderProcessItem}
            initialItemCount={Math.min(filteredProcessGroups.length, 15)}
          />
        ) : viewMode === 'list' ? (
          <Virtuoso
            data={filteredConnections}
            itemContent={renderConnectionItem}
            initialItemCount={Math.min(filteredConnections.length, 15)}
          />
        ) : (
          <ConnectionTable
            connections={filteredConnections}
            setSelected={setSelected}
            setIsDetailModalOpen={setIsDetailModalOpen}
            close={closeConnection}
            visibleColumns={visibleColumns}
            initialColumnWidths={connectionTableColumnWidths}
            initialSortColumn={connectionTableSortColumn}
            initialSortDirection={connectionTableSortDirection}
            onColumnWidthChange={handleColumnWidthChange}
            onSortChange={handleSortChange}
          />
        )}
      </div>
    </BasePage>
  )
}

export default Connections
