import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import UpdaterModal from './updater-modal'
import { cancelUpdate } from '@renderer/utils/ipc'
import { useUpdaterStore } from '@renderer/store/updater-store'
import { useShallow } from 'zustand/react/shallow'

interface Props {
  latest: {
    version: string
    changelog: string
  }
}

const noDragStyle = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

const UpdateBanner: React.FC<Props> = ({ latest }) => {
  const { t } = useTranslation()
  const [openModal, setOpenModal] = useState(false)
  const updateStatus = useUpdaterStore(
    useShallow((s) => ({ downloading: s.downloading, progress: s.progress, error: s.error }))
  )
  const resetUpdateStatus = useUpdaterStore((s) => s.reset)

  const handleCancelUpdate = async (): Promise<void> => {
    try {
      await cancelUpdate()
      resetUpdateStatus()
    } catch {
      // ignore
    }
  }

  return createPortal(
    <>
      {openModal && (
        <UpdaterModal
          version={latest.version}
          changelog={latest.changelog}
          updateStatus={updateStatus}
          onCancel={handleCancelUpdate}
          onClose={() => setOpenModal(false)}
        />
      )}
      <div className="pointer-events-none fixed top-2.5 left-12 right-0 z-50 flex justify-center">
        <div
          className="pointer-events-auto flex items-center gap-3 bg-card/50 backdrop-blur-xl rounded-2xl pl-5 pr-2 py-1.5 shadow-lg border border-stroke animate-update-banner-enter"
          style={noDragStyle}
        >
          <span className="text-sm font-medium text-foreground whitespace-nowrap">
            {t('updater.versionReady', { version: latest.version })}
          </span>
          <Button
            size="sm"
            className="cursor-pointer rounded-full px-4 h-7 text-xs font-semibold"
            style={noDragStyle}
            onClick={() => setOpenModal(true)}
          >
            {t('common.updateAvailable')}
          </Button>
        </div>
      </div>
    </>,
    document.body
  )
}

export default UpdateBanner
