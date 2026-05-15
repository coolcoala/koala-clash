import { Button } from '@renderer/components/ui/button'
import { useProcessIcon, useProcessAppName } from '@renderer/store/icons-store'
import { calcTraffic } from '@renderer/utils/calc'
import dayjs from 'dayjs'
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Trash2, X } from 'lucide-react'

interface Props {
  index: number
  info: ControllerConnectionDetail
  displayIcon: boolean
  displayAppName: boolean
  setSelected: React.Dispatch<React.SetStateAction<ControllerConnectionDetail | undefined>>
  setIsDetailModalOpen: React.Dispatch<React.SetStateAction<boolean>>
  close: (id: string) => void
}

const ConnectionItemComponent: React.FC<Props> = ({
  info,
  displayIcon,
  displayAppName,
  close,
  setSelected,
  setIsDetailModalOpen
}) => {
  const path = info.metadata.processPath || ''
  const iconUrl = useProcessIcon(path, displayIcon)
  const displayName = useProcessAppName(path, displayAppName)
  const fallbackProcessName = useMemo(
    () => info.metadata.process || info.metadata.sourceIP,
    [info.metadata.process, info.metadata.sourceIP]
  )
  const processName = displayName || fallbackProcessName

  const destination = useMemo(
    () =>
      info.metadata.host ||
      info.metadata.sniffHost ||
      info.metadata.destinationIP ||
      info.metadata.remoteDestination,
    [
      info.metadata.host,
      info.metadata.sniffHost,
      info.metadata.destinationIP,
      info.metadata.remoteDestination
    ]
  )

  const [timeAgo, setTimeAgo] = useState(() => dayjs(info.start).fromNow())

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeAgo(dayjs(info.start).fromNow())
    }, 60000)

    return () => clearInterval(timer)
  }, [info.start])

  const uploadTraffic = useMemo(() => calcTraffic(info.upload), [info.upload])

  const downloadTraffic = useMemo(() => calcTraffic(info.download), [info.download])

  const uploadSpeed = useMemo(
    () => (info.uploadSpeed ? calcTraffic(info.uploadSpeed) : null),
    [info.uploadSpeed]
  )

  const downloadSpeed = useMemo(
    () => (info.downloadSpeed ? calcTraffic(info.downloadSpeed) : null),
    [info.downloadSpeed]
  )

  const hasSpeed = useMemo(
    () => Boolean(info.uploadSpeed || info.downloadSpeed),
    [info.uploadSpeed, info.downloadSpeed]
  )

  const handleCardPress = useCallback(() => {
    setSelected(info)
    setIsDetailModalOpen(true)
  }, [info, setSelected, setIsDetailModalOpen])

  const handleClose = useCallback(() => {
    close(info.id)
  }, [close, info.id])

  return (
    <div className="px-2 pb-2" style={{ height: 72 }}>
      <div
        className={`
          w-full h-full flex items-center cursor-pointer rounded-xl border
          transition-all duration-200 ease-out
          ${
            info.isActive
              ? 'border-stroke-power-on/30 bg-linear-to-r from-gradient-start-power-on/[0.06] to-card/40 hover:border-stroke-power-on/50 shadow-sm'
              : 'border-border bg-card/40 hover:bg-accent/50'
          }
        `}
        onClick={handleCardPress}
      >
        <div className="w-full flex items-center">
          {displayIcon && (
            <div className="pl-3">
              {iconUrl ? (
                <img src={iconUrl} className="size-12 shrink-0" />
              ) : (
                <div className="size-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {(processName || '').slice(0, 2).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          )}
          <div
            className={`flex-1 flex flex-col truncate ${displayIcon ? 'pl-3' : 'pl-4'} pr-1`}
          >
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 flex items-center gap-1.5">
                <span className="text-sm font-medium truncate">
                  {processName} → {destination}
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                {timeAgo}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                className={`size-7 shrink-0 ${info.isActive ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-500/10' : 'text-destructive hover:text-destructive hover:bg-destructive/10'}`}
                onClick={(e) => {
                  e.stopPropagation()
                  handleClose()
                }}
              >
                {info.isActive ? <X /> : <Trash2 />}
              </Button>
            </div>
            <div className="flex items-center gap-1.5 pb-1">
              <span className="text-xs text-muted-foreground">
                {info.metadata.type}({info.metadata.network.toUpperCase()})
              </span>
              <span className="text-xs text-muted-foreground/40">|</span>
              <span className="flag-emoji text-xs text-muted-foreground truncate">
                {info.chains[0]}
              </span>
              <span className="text-xs text-muted-foreground/40">|</span>
              <span className="text-xs text-muted-foreground">
                ↑ {uploadTraffic} ↓ {downloadTraffic}
              </span>
              {hasSpeed && (
                <>
                  <span className="text-xs text-muted-foreground/40">|</span>
                  <span
                    className={`text-xs ${info.isActive ? 'text-gradient-end-power-on' : 'text-muted-foreground'}`}
                  >
                    ↑ {uploadSpeed || '0 B'}/s ↓ {downloadSpeed || '0 B'}/s
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const ConnectionItem = memo(ConnectionItemComponent, (prevProps, nextProps) => {
  return (
    prevProps.info.id === nextProps.info.id &&
    prevProps.info.upload === nextProps.info.upload &&
    prevProps.info.download === nextProps.info.download &&
    prevProps.info.uploadSpeed === nextProps.info.uploadSpeed &&
    prevProps.info.downloadSpeed === nextProps.info.downloadSpeed &&
    prevProps.info.isActive === nextProps.info.isActive &&
    prevProps.displayIcon === nextProps.displayIcon &&
    prevProps.displayAppName === nextProps.displayAppName
  )
})

export default ConnectionItem
