import BasePage from '@renderer/components/base/base-page'
import LogItem from '@renderer/components/logs/log-item'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Separator } from '@renderer/components/ui/separator'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'

import { includesIgnoreCase } from '@renderer/utils/includes'
import { MapPin, Trash2 } from 'lucide-react'

const cachedLogs: {
  log: ControllerLog[]
  trigger: ((i: ControllerLog[]) => void) | null
  clean: () => void
} = {
  log: [],
  trigger: null,
  clean(): void {
    this.log = []
    if (this.trigger !== null) {
      this.trigger(this.log)
    }
  }
}

window.electron.ipcRenderer.on('mihomoLogs', (_e, log: ControllerLog) => {
  log.time = dayjs().format('L LTS')
  cachedLogs.log.push(log)
  if (cachedLogs.log.length >= 500) {
    cachedLogs.log.shift()
  }
  if (cachedLogs.trigger !== null) {
    cachedLogs.trigger(cachedLogs.log)
  }
})

const Logs: React.FC = () => {
  const { t } = useTranslation()
  const [logs, setLogs] = useState<ControllerLog[]>([...cachedLogs.log])
  const [filter, setFilter] = useState('')
  const [trace, setTrace] = useState(true)
  const traceRef = useRef(trace)

  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const filteredLogs = useMemo(() => {
    if (filter === '') return logs
    return logs.filter((log) => {
      return includesIgnoreCase(log.payload, filter) || includesIgnoreCase(log.type, filter)
    })
  }, [logs, filter])

  const toggleTrace = useCallback(() => {
    setTrace((prev) => {
      const next = !prev
      traceRef.current = next
      if (next) {
        setLogs([...cachedLogs.log])
      }
      return next
    })
  }, [])

  useEffect(() => {
    if (!trace) return
    virtuosoRef.current?.scrollToIndex({
      index: filteredLogs.length - 1,
      behavior: 'smooth',
      align: 'end',
      offset: 0
    })
  }, [filteredLogs, trace])

  useEffect(() => {
    const old = cachedLogs.trigger
    cachedLogs.trigger = (a): void => {
      if (traceRef.current) {
        setLogs([...a])
      }
    }
    return (): void => {
      cachedLogs.trigger = old
    }
  }, [])

  return (
    <BasePage title={t('pages.logs.title')}>
      <div className="sticky top-0 z-40">
        <div className="w-full flex px-2 pb-2">
          <Input
            className="h-8 text-sm"
            value={filter}
            placeholder={t('common.filter')}
            onChange={(e) => setFilter(e.target.value)}
          />
          <Button
            size="icon-sm"
            className={cn('ml-2 p-0 bg-clip-border', trace && 'bg-primary text-primary-foreground')}
            variant={trace ? 'default' : 'outline'}
            title={t('logs.autoScroll')}
            onClick={toggleTrace}
          >
            <MapPin className="text-lg" />
          </Button>
          <Button
            size="icon-sm"
            title={t('pages.logs.clearLogs')}
            className="ml-2 p-0 bg-clip-border"
            variant="ghost"
            onClick={() => {
              cachedLogs.clean()
            }}
          >
            <Trash2 className="text-lg text-destructive" />
          </Button>
        </div>
        <Separator className="mx-2" />
      </div>
      <div className="h-[calc(100vh-108px)] mt-px">
        <Virtuoso
          ref={virtuosoRef}
          data={filteredLogs}
          initialTopMostItemIndex={filteredLogs.length - 1}
          followOutput={trace}
          itemContent={(i, log) => {
            return (
              <LogItem
                index={i}
                key={log.payload + i}
                time={log.time}
                type={log.type}
                payload={log.payload}
              />
            )
          }}
        />
      </div>
    </BasePage>
  )
}

export default Logs
