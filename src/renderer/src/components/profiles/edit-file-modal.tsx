import React, { useEffect, useRef, useState } from 'react'
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
import { BaseEditor } from '../base/base-editor-lazy'
import { getProfileStr, setProfileStr } from '@renderer/utils/ipc'
import ConfirmModal from '../base/base-confirm'
import { useTranslation } from 'react-i18next'

interface Props {
  id: string
  onClose: () => void
}

const EditFileModal: React.FC<Props> = (props) => {
  const { t } = useTranslation()
  const { id, onClose } = props
  const [currData, setCurrData] = useState('')
  const [originalData, setOriginalData] = useState('')
  const [isDiff, setIsDiff] = useState(false)
  const [sideBySide, setSideBySide] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const dialogCloseRef = useRef<HTMLButtonElement>(null)
  const forceCloseRef = useRef(false)

  const isModified = currData !== originalData

  const closeWithAnimation = (): void => {
    dialogCloseRef.current?.click()
  }

  const discardAndClose = (): void => {
    forceCloseRef.current = true
    setIsConfirmOpen(false)
    closeWithAnimation()
  }

  const getContent = async (): Promise<void> => {
    const data = await getProfileStr(id)
    setCurrData(data)
    setOriginalData(data)
  }

  useEffect(() => {
    getContent()
  }, [])

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) {
          if (forceCloseRef.current) {
            forceCloseRef.current = false
            onClose()
            return
          }

          if (isModified) {
            setIsConfirmOpen(true)
            return
          }

          onClose()
        }
      }}
    >
      {isConfirmOpen && (
        <ConfirmModal
          title={t('profile.confirmDiscardTitle')}
          description={t('profile.unsavedChanges')}
          confirmText={t('profile.discardChanges')}
          cancelText={t('profile.keepEditing')}
          onChange={setIsConfirmOpen}
          onConfirm={discardAndClose}
        />
      )}
      <DialogClose asChild>
        <button ref={dialogCloseRef} type="button" className="hidden" tabIndex={-1} />
      </DialogClose>
      <DialogContent
        className="h-[calc(100%-111px)] w-[calc(100%-100px)] max-w-none sm:max-w-none flex flex-col"
        showCloseButton={false}
      >
        <DialogHeader className="app-drag pb-0">
          <DialogTitle>{t('profile.editSubscription')}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0">
          <BaseEditor
            language="yaml"
            value={currData}
            originalValue={isDiff ? originalData : undefined}
            onChange={(value) => setCurrData(value)}
            diffRenderSideBySide={sideBySide}
          />
        </div>
        <DialogFooter className="pt-0 flex justify-between sm:justify-between">
          <div className="flex items-center space-x-4">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={isDiff}
                onCheckedChange={(checked) => {
                  setIsDiff(checked)
                  if (!checked) setSideBySide(false)
                }}
              />
              {t('profile.showChanges')}
            </label>
            {isDiff && (
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={sideBySide} onCheckedChange={setSideBySide} />
                {t('sider.sideBySide')}
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (isModified) {
                  setIsConfirmOpen(true)
                  return
                }
                forceCloseRef.current = true
                closeWithAnimation()
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                await setProfileStr(id, currData)
                setOriginalData(currData)
                forceCloseRef.current = true
                closeWithAnimation()
              }}
            >
              {t('common.save')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default EditFileModal
