/* eslint-disable react/prop-types */
import { toast } from 'sonner'
import { Button } from '@renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import {
  checkUpdate,
  createHeapSnapshot,
  mihomoVersion,
  quitApp,
  quitWithoutCore,
  resetAppConfig,
  cancelUpdate
} from '@renderer/utils/ipc'
import { useState, useRef } from 'react'
import useSWR from 'swr'
import { useUpdaterStore } from '@renderer/store/updater-store'
import { useShallow } from 'zustand/react/shallow'
import UpdaterModal from '../updater/updater-modal'
import { version } from '@renderer/utils/init'
import { startTour } from '@renderer/utils/driver'
import { useNavigate } from 'react-router-dom'
import ConfirmModal from '../base/base-confirm'
import { useTranslation } from 'react-i18next'
import { MessageCircleQuestionMark, Settings } from 'lucide-react'

const EASTER_EGG_TAP_COUNT = 7

interface ActionsProps {
  showHiddenSettings: boolean
  onUnlockHiddenSettings: () => void
}

const Actions: React.FC<ActionsProps> = (props) => {
  const { showHiddenSettings, onUnlockHiddenSettings } = props
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: coreVersion } = useSWR('mihomoVersion', mihomoVersion)
  const [newVersion, setNewVersion] = useState('')
  const [changelog, setChangelog] = useState('')
  const [openUpdate, setOpenUpdate] = useState(false)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const versionTapCountRef = useRef(0)
  const updateStatus = useUpdaterStore(
    useShallow((s) => ({ downloading: s.downloading, progress: s.progress, error: s.error }))
  )
  const resetUpdateStatus = useUpdaterStore((s) => s.reset)

  const handleCancelUpdate = async (): Promise<void> => {
    try {
      await cancelUpdate()
      resetUpdateStatus()
    } catch (e) {
      // ignore
    }
  }

  const handleVersionClick = (): void => {
    if (showHiddenSettings) return
    versionTapCountRef.current = Math.min(versionTapCountRef.current + 1, EASTER_EGG_TAP_COUNT)
    if (versionTapCountRef.current >= EASTER_EGG_TAP_COUNT) {
      onUnlockHiddenSettings()
    }
  }

  return (
    <>
      {openUpdate && (
        <UpdaterModal
          onClose={() => setOpenUpdate(false)}
          version={newVersion}
          changelog={changelog}
          updateStatus={updateStatus}
          onCancel={handleCancelUpdate}
        />
      )}
      {confirmOpen && (
        <ConfirmModal
          onChange={setConfirmOpen}
          title={t('settings.actions.confirmReset')}
          description={
            <>
              {t('settings.actions.resetWarning')}
              <span className="text-red-500">{t('settings.actions.cannotUndo')}</span>
            </>
          }
          confirmText={t('settings.actions.confirmDelete')}
          cancelText={t('common.cancel')}
          onConfirm={resetAppConfig}
        />
      )}
      <SettingCard>
        <SettingItem title={t('settings.actions.openGuidePage')} divider>
          <Button
            size="sm"
            onClick={() => {
              window.localStorage.setItem('tourShown', 'true')
              startTour(navigate)
            }}
          >
            {t('settings.actions.openGuide')}
          </Button>
        </SettingItem>
        <SettingItem title={t('settings.actions.checkUpdate')} divider>
          <Button
            size="sm"
            disabled={checkingUpdate}
            onClick={async () => {
              try {
                setCheckingUpdate(true)
                const version = await checkUpdate()
                if (version) {
                  setNewVersion(version.version)
                  setChangelog(version.changelog)
                  setOpenUpdate(true)
                } else {
                  toast.success(t('settings.actions.noNeedUpdate'))
                }
              } catch (e) {
                toast.error(`${e}`)
              } finally {
                setCheckingUpdate(false)
              }
            }}
          >
            {t('settings.actions.checkUpdate')}
          </Button>
        </SettingItem>
        <SettingItem
          title={t('settings.actions.resetApp')}
          actions={
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon-sm" variant="ghost">
                  <MessageCircleQuestionMark className="text-lg" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('settings.actions.resetAppHelp')}</TooltipContent>
            </Tooltip>
          }
          divider
        >
          <Button size="sm" onClick={() => setConfirmOpen(true)}>
            {t('settings.actions.resetApp')}
          </Button>
        </SettingItem>
        {showHiddenSettings && (
          <SettingItem
            title={t('settings.actions.clearCache')}
            actions={
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon-sm" variant="ghost">
                    <MessageCircleQuestionMark className="text-lg" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('settings.actions.clearCacheHelp')}</TooltipContent>
              </Tooltip>
            }
            divider
          >
            <Button size="sm" onClick={() => localStorage.clear()}>
              {t('settings.actions.clearCache')}
            </Button>
          </SettingItem>
        )}
        {showHiddenSettings && (
          <SettingItem
            title={t('settings.actions.createHeapSnapshot')}
            actions={
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon-sm" variant="ghost">
                    <MessageCircleQuestionMark className="text-lg" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('settings.actions.createHeapSnapshotHelp')}</TooltipContent>
              </Tooltip>
            }
            divider
          >
            <Button size="sm" onClick={createHeapSnapshot}>
              {t('settings.actions.createHeapSnapshot')}
            </Button>
          </SettingItem>
        )}
        <SettingItem
          title={t('settings.actions.quitKeepCore')}
          actions={
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon-sm" variant="ghost">
                  <MessageCircleQuestionMark className="text-lg" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('settings.actions.quitKeepCoreHelp')}</TooltipContent>
            </Tooltip>
          }
          divider
        >
          <Button size="sm" onClick={quitWithoutCore}>
            {t('common.quit')}
          </Button>
        </SettingItem>
        <SettingItem title={t('settings.actions.quitApp')} divider>
          <Button size="sm" onClick={quitApp}>
            {t('settings.actions.quitApp')}
          </Button>
        </SettingItem>
        <SettingItem
          title={t('settings.actions.mihomoVersion')}
          actions={
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon-sm" variant="ghost" onClick={() => navigate('/mihomo')}>
                  <Settings className="text-lg" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('settings.actions.mihomoSettings')}</TooltipContent>
            </Tooltip>
          }
          divider
        >
          <div>{coreVersion?.version ? coreVersion.version : '...'}</div>
        </SettingItem>
        <SettingItem title={t('settings.actions.appVersion')}>
          <button type="button" className="select-none" onClick={handleVersionClick}>
            v{version}
          </button>
        </SettingItem>
      </SettingCard>
    </>
  )
}

export default Actions
