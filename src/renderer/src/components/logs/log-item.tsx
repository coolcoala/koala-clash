import { cn } from '@renderer/lib/utils'
import React from 'react'

const badgeMap: Record<LogLevel, string> = {
  error: 'bg-destructive/15 text-destructive',
  warning: 'bg-warning/20 text-amber-700 dark:text-warning',
  info: 'bg-primary/10 text-primary',
  debug: 'bg-muted text-muted-foreground',
  silent: 'bg-muted text-muted-foreground'
}

interface Props {
  seq: number
  type: LogLevel
  payload: string
  time: string
  clock: string
}

const LogItem: React.FC<Props> = ({ seq, type, payload, time, clock }) => {
  return (
    <div
      className={cn(
        // --log-seq-width is set by the list so numbers of different length stay aligned
        'select-text grid grid-cols-[var(--log-seq-width,3ch)_auto_3.75rem_1fr] items-baseline gap-x-1 mx-2 px-3 py-1.5 border-b',
        type === 'error' && 'bg-destructive/5'
      )}
    >
      <span className="justify-self-end mr-1 text-xs tabular-nums text-muted-foreground">
        {seq}
      </span>
      <time className="text-xs tabular-nums text-muted-foreground" title={time}>
        {clock}
      </time>
      <span
        className={cn(
          'justify-self-start rounded px-1.5 text-[10px] leading-4 font-semibold uppercase tracking-wide',
          badgeMap[type]
        )}
      >
        {type === 'warning' ? 'warn' : type}
      </span>
      <span className="flag-emoji min-w-0 break-words text-[13px] leading-5">{payload}</span>
    </div>
  )
}

export default React.memo(LogItem)
