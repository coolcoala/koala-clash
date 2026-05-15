import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/switch'
import React, { useEffect, useState, useCallback } from 'react'
import { BaseEditor } from '../base/base-editor-lazy'
import {
  getProfileConfig,
  getRawProfileStr,
  getRuntimeConfigStr,
  getCurrentProfileStr
} from '@renderer/utils/ipc'
import useSWR from 'swr'
import { t } from 'i18next'

interface Props {
  onClose: () => void
}
const ConfigViewer: React.FC<Props> = ({ onClose }) => {
  const [runtimeConfig, setRuntimeConfig] = useState('')
  const [rawProfile, setRawProfile] = useState('')
  const [profileConfig, setProfileConfig] = useState('')
  const [isDiff, setIsDiff] = useState(false)
  const [isRaw, setIsRaw] = useState(false)
  const [sideBySide, setSideBySide] = useState(false)

  const { data: config } = useSWR('getProfileConfig', getProfileConfig)

  const fetchConfigs = useCallback(async () => {
    setRuntimeConfig(await getRuntimeConfigStr())
    setRawProfile(await getRawProfileStr())
    setProfileConfig(await getCurrentProfileStr())
  }, [config])

  useEffect(() => {
    fetchConfigs()
  }, [fetchConfigs])

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className="h-[calc(100%-111px)] w-[calc(100%-100px)] max-w-none sm:max-w-none flex flex-col"
        showCloseButton={false}
      >
        <DialogHeader className="app-drag">
          <DialogTitle>{t('sider.runtimeConfigTitle')}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0">
          <BaseEditor
            language="yaml"
            value={runtimeConfig}
            originalValue={isDiff ? (isRaw ? rawProfile : profileConfig) : undefined}
            readOnly
            diffRenderSideBySide={sideBySide}
          />
        </div>
        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2 text-sm">
              <Switch
                checked={isDiff}
                onCheckedChange={(checked) => {
                  setIsDiff(checked)
                  if (!checked) {
                    setSideBySide(false)
                    setIsRaw(false)
                  }
                }}
              />
              <span>{t('sider.compareCurrentConfig')}</span>
            </label>
            {isDiff && (
              <>
                <label className="flex items-center space-x-2 text-sm">
                  <Switch checked={sideBySide} onCheckedChange={setSideBySide} />
                  <span>{t('sider.sideBySide')}</span>
                </label>
                <label className="flex items-center space-x-2 text-sm">
                  <Switch checked={isRaw} onCheckedChange={setIsRaw} />
                  <span>{t('sider.showRawText')}</span>
                </label>
              </>
            )}
          </div>
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

export default ConfigViewer
