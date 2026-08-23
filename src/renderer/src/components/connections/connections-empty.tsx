import { Button } from '@renderer/components/ui/button'
import React from 'react'
import type { LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

const ConnectionsEmpty: React.FC<Props> = ({ icon: Icon, title, description, action }) => {
  return (
    <div className="h-full min-h-50 w-full flex items-center justify-center px-6 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="size-16 rounded-2xl border border-border bg-card/40 flex items-center justify-center">
          <Icon className="size-7 text-muted-foreground/70" strokeWidth={1.5} aria-hidden="true" />
        </div>
        <h2 className="text-base font-medium text-muted-foreground">{title}</h2>
        {description && (
          <p className="max-w-70 text-sm text-balance text-muted-foreground/70">{description}</p>
        )}
        {action && (
          <Button size="sm" variant="secondary" className="mt-1" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
    </div>
  )
}

export default ConnectionsEmpty
