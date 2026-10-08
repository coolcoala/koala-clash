import React from 'react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/switch'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText
} from '@renderer/components/ui/input-group'
import SettingItem from '../base/base-setting-item'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { restartMihomoConnections } from '@renderer/utils/ipc'
import { t } from 'i18next'
import { platform } from '@renderer/utils/init'

interface Props {
  onClose: () => void
}

const ConnectionSettingModal: React.FC<Props> = (props) => {
  const { onClose } = props
  const { appConfig, patchAppConfig } = useAppConfig()

  const {
    displayIcon = true,
    displayAppName = true,
    connectionInterval = 500,
    connectionListMode = 'process'
  } = appConfig || {}

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="flag-emoji max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('pages.connections.connectionSettings')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1 py-2">
          <SettingItem title={t('pages.connections.connectionListMode')} divider>
            <Select
              value={connectionListMode}
              onValueChange={(v) => {
                patchAppConfig({ connectionListMode: v as 'classic' | 'process' })
              }}
            >
              <SelectTrigger className="w-45">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="classic">{t('pages.connections.classicView')}</SelectItem>
                <SelectItem value="process">{t('pages.connections.processView')}</SelectItem>
              </SelectContent>
            </Select>
          </SettingItem>
          <SettingItem title={t('connection.showAppIcon')} divider>
            <Switch
              checked={displayIcon}
              onCheckedChange={(v) => {
                patchAppConfig({ displayIcon: v })
              }}
            />
          </SettingItem>
          {platform === 'darwin' && (
            <SettingItem title={t('connection.showAppName')} divider>
              <Switch
                checked={displayAppName}
                onCheckedChange={(v) => {
                  patchAppConfig({ displayAppName: v })
                }}
              />
            </SettingItem>
          )}
          <SettingItem title={t('connection.refreshInterval')}>
            <InputGroup className="w-37.5">
              <InputGroupInput
                type="number"
                value={connectionInterval?.toString()}
                placeholder={t('connection.refreshIntervalPlaceholder')}
                onChange={async (e) => {
                  let num = parseInt(e.target.value)
                  if (isNaN(num)) num = 500
                  if (num < 100) num = 100
                  await patchAppConfig({ connectionInterval: num })
                  await restartMihomoConnections()
                }}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>{t('connection.refreshIntervalUnit')}</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
          </SettingItem>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button size="sm" variant="ghost">
              {t('common.close')}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ConnectionSettingModal
