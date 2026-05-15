import { Button } from '@renderer/components/ui/button'
import { Card, CardContent } from '@renderer/components/ui/card'
import { cn } from '@renderer/lib/utils'
import { mihomoUnfixedProxy } from '@renderer/utils/ipc'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Spinner } from '@renderer/components/ui/spinner'
import { Gauge, MapPin } from 'lucide-react'

interface Props {
  mutateProxies: () => void
  onProxyDelay: (proxy: string, url?: string) => Promise<ControllerProxiesDelay>
  proxyDisplayLayout: 'hidden' | 'single' | 'double'
  proxy: ControllerProxiesDetail | ControllerGroupDetail
  group: ControllerMixedGroup
  onSelect: (group: string, proxy: string) => void
  selected: boolean
  isGroupDelaying?: boolean
}

function delayColorClass(delay: number): string {
  if (delay === -1) return 'text-primary'
  if (delay === 0) return 'text-destructive'
  if (delay < 500) return 'text-success'
  return 'text-warning'
}

const ProxyItem: React.FC<Props> = React.memo((props) => {
  const { t } = useTranslation()
  const { mutateProxies, proxyDisplayLayout, group, proxy, selected, onSelect, onProxyDelay, isGroupDelaying } =
    props

  const delay = useMemo(() => {
    if (proxy.history.length > 0) {
      return proxy.history[proxy.history.length - 1].delay
    }
    return -1
  }, [proxy])

  const [loading, setLoading] = useState(false)
  const [waitingForNewDelay, setWaitingForNewDelay] = useState(false)
  const delaySnapshot = useRef(delay)

  useEffect(() => {
    if (isGroupDelaying) {
      delaySnapshot.current = delay
      setWaitingForNewDelay(true)
    }
  }, [isGroupDelaying])

  useEffect(() => {
    if (waitingForNewDelay && delay !== delaySnapshot.current) {
      setWaitingForNewDelay(false)
    }
  }, [delay, waitingForNewDelay])

  useEffect(() => {
    if (waitingForNewDelay && !isGroupDelaying) {
      const timer = setTimeout(() => setWaitingForNewDelay(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [waitingForNewDelay, isGroupDelaying])

  const showLoading = loading || isGroupDelaying || waitingForNewDelay

  function delayContent(d: number): React.ReactNode {
    if (d === -1) return <Gauge className="size-3.5" />
    if (d === 0) return '–'
    return d.toString()
  }

  const onDelay = (): void => {
    setLoading(true)
    onProxyDelay(proxy.name, group.testUrl).finally(() => {
      mutateProxies()
      setLoading(false)
    })
  }

  const displayType =
    !('all' in proxy) && proxy.serverDescription ? proxy.serverDescription : proxy.type
  const fixed = group.fixed && group.fixed === proxy.name

  return (
    <Card
      onClick={() => onSelect(group.name, proxy.name)}
      className={cn(
        'w-full gap-0 py-0 rounded-lg cursor-pointer transition-all duration-150 relative overflow-hidden',
        fixed
          ? 'bg-amber-500/8 hover:bg-amber-500/12 border-amber-500/40 shadow-sm shadow-amber-500/10'
          : selected
            ? 'bg-primary/10 hover:bg-primary/15 border-primary/30 shadow-sm shadow-primary/10'
            : 'hover:bg-accent/50'
      )}
    >
      <CardContent className="pl-4 pr-4 py-2">
        <div
          className={`flex ${proxyDisplayLayout === 'double' ? 'gap-1' : 'justify-between items-center'}`}
        >
          {proxyDisplayLayout === 'double' ? (
            <>
              <div className="flex flex-col gap-0 flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="flag-emoji text-sm truncate" title={proxy.name}>
                    {proxy.name}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground leading-none mt-0.5">
                  <span>{displayType}</span>
                </div>
              </div>
              <div className="flex items-center justify-center gap-0.5 shrink-0">
                {fixed && (
                  <Button
                    variant="ghost"
                    title={t('proxies.unpin')}
                    onClick={async (e) => {
                      e.stopPropagation()
                      await mihomoUnfixedProxy(group.name)
                      mutateProxies()
                    }}
                    className="h-6 w-6 min-w-6 p-0 text-amber-500 hover:text-amber-600 opacity-60 hover:opacity-100"
                  >
                    <MapPin className="text-xs" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  title={proxy.type}
                  disabled={showLoading}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelay()
                  }}
                  className={cn(
                    'h-7 w-8 min-w-8 px-0 text-xs font-medium cursor-pointer',
                    delayColorClass(delay)
                  )}
                >
                  <span className="relative inline-flex items-center justify-center w-full">
                    {showLoading && <Spinner className="size-3 absolute" />}
                    <span className={cn(showLoading && 'invisible')}>{delayContent(delay)}</span>
                  </span>
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5 text-ellipsis overflow-hidden whitespace-nowrap">
                <span className="flag-emoji text-sm truncate" title={proxy.name}>
                  {proxy.name}
                </span>
                {proxyDisplayLayout === 'single' && (
                  <span className="text-muted-foreground text-xs shrink-0" title={displayType}>
                    {displayType}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                {fixed && (
                  <Button
                    variant="ghost"
                    title={t('proxies.unpin')}
                    onClick={async (e) => {
                      e.stopPropagation()
                      await mihomoUnfixedProxy(group.name)
                      mutateProxies()
                    }}
                    className="h-6 w-6 min-w-6 p-0 text-amber-500 hover:text-amber-600 opacity-60 hover:opacity-100"
                  >
                    <MapPin className="text-xs" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  title={proxy.type}
                  disabled={showLoading}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelay()
                  }}
                  className={cn(
                    'h-7 w-8 min-w-8 px-0 text-xs font-medium cursor-pointer',
                    delayColorClass(delay)
                  )}
                >
                  <span className="relative inline-flex items-center justify-center w-full">
                    {showLoading && <Spinner className="size-3 absolute" />}
                    <span className={cn(showLoading && 'invisible')}>{delayContent(delay)}</span>
                  </span>
                </Button>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
})

ProxyItem.displayName = 'ProxyItem'

export default ProxyItem
