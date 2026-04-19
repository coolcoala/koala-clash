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
      <div className="h-[32px] w-full flex items-center justify-between gap-4">
        <div className="h-full flex items-center">
          <h4 className="h-full text-md leading-[32px] whitespace-nowrap">{title}</h4>
          <div>{actions}</div>
        </div>
        {children}
      </div>
      {divider && <Separator className="my-2" />}
    </>
  )
}

export default SettingItem
