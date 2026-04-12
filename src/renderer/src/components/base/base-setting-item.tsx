import { Separator } from '@renderer/components/ui/separator'

import React from 'react'

interface Props {
  title: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
  divider?: boolean
}

const SettingItem: React.FC<Props> = (props) => {
  const { title, actions, children, divider = false } = props

  return (
    <>
      <div className="min-h-[32px] w-full flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center">
          <h4 className="text-md leading-[32px] whitespace-nowrap">{title}</h4>
          <div>{actions}</div>
        </div>
        {children}
      </div>
      {divider && <Separator className="my-2" />}
    </>
  )
}

export default SettingItem
