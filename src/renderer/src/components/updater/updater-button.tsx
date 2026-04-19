import { Button } from '@renderer/components/ui/button'
import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import UpdaterModal from './updater-modal'
import { cancelUpdate } from '@renderer/utils/ipc'
import { CircleFadingArrowUp } from 'lucide-react'

interface Props {
  iconOnly?: boolean
  latest?: {
    version: string
    changelog: string
  }
}

const UpdaterButton: React.FC<Props> = (props) => {
  const { t } = useTranslation()
  const { iconOnly, latest } = props
  const [openModal, setOpenModal] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<{
    downloading: boolean
    progress: number
    error?: string
  }>({
    downloading: false,
    progress: 0
  })

  useEffect(() => {
    const handleUpdateStatus = (
      _: Electron.IpcRendererEvent,
      status: typeof updateStatus
    ): void => {
      setUpdateStatus(status)
    }

    window.electron.ipcRenderer.on('update-status', handleUpdateStatus)

    return (): void => {
      window.electron.ipcRenderer.removeAllListeners('update-status')
    }
  }, [])

  const handleCancelUpdate = async (): Promise<void> => {
    try {
      await cancelUpdate()
      setUpdateStatus({ downloading: false, progress: 0 })
    } catch (e) {
      // ignore
    }
  }

  if (!latest) return null

  return (
    <>
      {openModal && (
        <UpdaterModal
          version={latest.version}
          changelog={latest.changelog}
          updateStatus={updateStatus}
          onCancel={handleCancelUpdate}
          onClose={() => {
            setOpenModal(false)
          }}
        />
      )}
      {iconOnly ? (
        <Button
          size="icon-lg"
          className="app-nodrag cursor-pointer rounded-md font-medium hover:bg-accent transition-colors bg-gradient-to-br from-gradient-start-power-on/15 to-gradient-end-power-on/15 border border-stroke-power-on/50 text-foreground shadow-sm"
          onClick={() => {
            setOpenModal(true)
          }}
        >
          <CircleFadingArrowUp className="size-5" />
        </Button>
      ) : (
        <Button
          className="app-nodrag w-full rounded-md h-10 font-medium hover:bg-accent transition-colors bg-gradient-to-br from-gradient-start-power-on/15 to-gradient-end-power-on/15 border border-stroke-power-on/50 text-foreground shadow-sm"
          onClick={() => {
            setOpenModal(true)
          }}
        >
          <CircleFadingArrowUp />
          <span className="truncate">{t('common.updateAvailable')}</span>
        </Button>
      )}
    </>
  )
}

export default UpdaterButton
