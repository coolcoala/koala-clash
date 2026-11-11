import { MousePointerClick, Route, Scale, Shield, Zap } from 'lucide-react'
import React from 'react'

// Shared by the proxies page and the tray menu so a group looks the same in both
export const groupTypeColor: Record<string, string> = {
  Selector:
    'border-blue-500/40 bg-blue-500/8 text-blue-600 dark:text-blue-400 dark:border-blue-400/40',
  URLTest:
    'border-emerald-500/40 bg-emerald-500/8 text-emerald-600 dark:text-emerald-400 dark:border-emerald-400/40',
  Fallback:
    'border-amber-500/40 bg-amber-500/8 text-amber-600 dark:text-amber-400 dark:border-amber-400/40',
  LoadBalance:
    'border-violet-500/40 bg-violet-500/8 text-violet-600 dark:text-violet-400 dark:border-violet-400/40',
  Relay: 'border-rose-500/40 bg-rose-500/8 text-rose-600 dark:text-rose-400 dark:border-rose-400/40'
}

export const groupTypeIcon: Record<string, React.ReactNode> = {
  Selector: <MousePointerClick className="size-4" />,
  URLTest: <Zap className="size-4" />,
  Fallback: <Shield className="size-4" />,
  LoadBalance: <Scale className="size-4" />,
  Relay: <Route className="size-4" />
}
