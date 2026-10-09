import { toast } from 'sonner'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Spinner } from '@renderer/components/ui/spinner'
import { Switch } from '@renderer/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import BasePage from '@renderer/components/base/base-page'
import SettingCard from '@renderer/components/base/base-setting-card'
import SettingItem from '@renderer/components/base/base-setting-item'
import ConfirmModal, { ConfirmButton } from '@renderer/components/base/base-confirm'
import PermissionModal from '@renderer/components/mihomo/permission-modal'
import ServiceModal from '@renderer/components/mihomo/service-modal'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import PortSetting from '@renderer/components/mihomo/port-setting'
import { platform } from '@renderer/utils/init'
import PubSub from 'pubsub-js'
import {
  manualGrantCorePermition,
  mihomoUpgrade,
  restartCore,
  revokeCorePermission,
  installedCores,
  downloadAlphaCore,
  deleteElevateTask,
  checkElevateTask,
  relaunchApp,
  restartAsAdmin,
  notDialogQuit,
  installService,
  uninstallService,
  startService,
  stopService,
  initService,
  restartService,
  getEffectiveLogLevel,
  mihomoApplyLogLevel
} from '@renderer/utils/ipc'
import React, { useState } from 'react'
import useSWR from 'swr'
import ControllerSetting from '@renderer/components/mihomo/controller-setting'
import EnvSetting from '@renderer/components/mihomo/env-setting'
import AdvancedSetting from '@renderer/components/mihomo/advanced-settings'
import { useTranslation } from 'react-i18next'
import { CloudDownload, Download, RotateCcw } from 'lucide-react'

const Mihomo: React.FC = () => {
  const { t } = useTranslation()
  const { appConfig, patchAppConfig } = useAppConfig()
  const {
    core = 'mihomo',
    maxLogDays = 7,
    corePermissionMode = 'elevated',
    customLogLevel = false
  } = appConfig || {}
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const { ipv6, 'log-level': controledLogLevel = 'info' } = controledMihomoConfig || {}
  const { data: logLevelInfo, mutate: mutateLogLevel } = useSWR(
    'getEffectiveLogLevel',
    getEffectiveLogLevel
  )
  // the level mihomo actually uses, which may come from the profile
  const logLevel = logLevelInfo?.value ?? controledLogLevel

  const [upgrading, setUpgrading] = useState(false)
  const [showGrantConfirm, setShowGrantConfirm] = useState(false)
  const [showUnGrantConfirm, setShowUnGrantConfirm] = useState(false)
  const [showPermissionModal, setShowPermissionModal] = useState(false)
  const [showServiceModal, setShowServiceModal] = useState(false)
  const [pendingPermissionMode, setPendingPermissionMode] = useState<string>('')
  const [downloadingAlpha, setDownloadingAlpha] = useState(false)
  // Picking the alpha core before it is downloaded only offers the download, the running core stays
  const [pendingAlpha, setPendingAlpha] = useState(false)
  const { data: cores, mutate: mutateCores } = useSWR('installedCores', installedCores)
  const alphaInstalled = !cores || cores.includes('mihomo-alpha')

  const onChangeNeedRestart = async (patch: Partial<MihomoConfig>): Promise<void> => {
    await patchControledMihomoConfig(patch)
  }

  // A picked level becomes the user's choice and stops following the profile
  const onLogLevelChange = async (value: LogLevel): Promise<void> => {
    if (!customLogLevel) await patchAppConfig({ customLogLevel: true })
    await patchControledMihomoConfig({ 'log-level': value })
    await mutateLogLevel()
  }

  const onLogLevelReset = async (): Promise<void> => {
    await patchAppConfig({ customLogLevel: false })
    try {
      await mihomoApplyLogLevel()
    } catch (e) {
      toast.error(`${e}`)
    }
    await mutateLogLevel()
  }

  const handleConfigChangeWithRestart = async (key: string, value: unknown): Promise<void> => {
    try {
      await patchAppConfig({ [key]: value })
      await restartCore()
      PubSub.publish('mihomo-core-changed')
    } catch (e) {
      toast.error(`${e}`)
    }
  }

  const handleCoreUpgrade = async (): Promise<void> => {
    try {
      setUpgrading(true)
      await mihomoUpgrade()
      setTimeout(() => PubSub.publish('mihomo-core-changed'), 2000)
    } catch (e) {
      if (typeof e === 'string' && e.includes('already using latest version')) {
        new Notification(t('pages.mihomo.alreadyLatest'))
      } else {
        toast.error(`${e}`)
      }
    } finally {
      setUpgrading(false)
    }
  }

  const handleCoreChange = (value: string): void => {
    const pending = value === 'mihomo-alpha' && !alphaInstalled
    setPendingAlpha(pending)
    if (!pending && value !== core) handleConfigChangeWithRestart('core', value)
  }

  const handleAlphaDownload = async (): Promise<void> => {
    setDownloadingAlpha(true)
    try {
      await downloadAlphaCore()
      // Installers authorize the bundled cores, a downloaded one has to ask on its own
      if (platform !== 'win32') {
        // Declining only leaves the core unauthorized, which the permission modal can fix later
        await manualGrantCorePermition(['mihomo-alpha']).catch(() => {})
      }
      await mutateCores()
      setPendingAlpha(false)
      await handleConfigChangeWithRestart('core', 'mihomo-alpha')
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setDownloadingAlpha(false)
    }
  }

  const handlePermissionModeChange = async (key: string): Promise<void> => {
    if (platform === 'win32') {
      if (key !== 'elevated') {
        if (await checkElevateTask()) {
          setPendingPermissionMode(key)
          setShowUnGrantConfirm(true)
        } else {
          patchAppConfig({ corePermissionMode: key as 'elevated' | 'service' })
        }
      } else if (key === 'elevated') {
        setPendingPermissionMode(key)
        setShowGrantConfirm(true)
      }
    } else {
      patchAppConfig({ corePermissionMode: key as 'elevated' | 'service' })
    }
  }

  const extraUnGrantButtons: ConfirmButton[] =
    platform === 'win32'
      ? [
          {
            key: 'cancel-and-restart',
            text: t('pages.mihomo.cancelAndRestart'),
            variant: 'destructive',
            onPress: async () => {
              try {
                await deleteElevateTask()
                new Notification(t('pages.mihomo.taskScheduleCanceled'))
                await patchAppConfig({
                  corePermissionMode: pendingPermissionMode as 'elevated' | 'service'
                })
                await relaunchApp()
              } catch (e) {
                toast.error(`${e}`)
              }
            }
          }
        ]
      : []

  const unGrantButtons: ConfirmButton[] = [
    {
      key: 'cancel',
      text: t('common.cancel'),
      variant: 'ghost',
      onPress: () => {}
    },
    {
      key: 'confirm',
      text:
        platform === 'win32'
          ? t('pages.mihomo.noRestartCancel')
          : t('pages.mihomo.confirmRevoke'),
      variant: 'destructive',
      onPress: async () => {
        try {
          if (platform === 'win32') {
            await deleteElevateTask()
            new Notification(t('pages.mihomo.taskScheduleCanceled'))
          } else {
            await revokeCorePermission()
            new Notification(t('pages.mihomo.corePermissionRevoked'))
          }
          await patchAppConfig({
            corePermissionMode: pendingPermissionMode as 'elevated' | 'service'
          })

          await restartCore()
        } catch (e) {
          toast.error(`${e}`)
        }
      }
    },
    ...extraUnGrantButtons
  ]

  const logLevelOptions: { value: LogLevel; label: string }[] = [
    { value: 'silent', label: t('pages.mihomo.silent') },
    { value: 'error', label: t('pages.mihomo.error') },
    { value: 'warning', label: t('pages.mihomo.warning') },
    { value: 'info', label: t('pages.mihomo.info') },
    { value: 'debug', label: t('pages.mihomo.debug') }
  ]

  return (
    <BasePage title={t('pages.mihomo.title')}>
      {showGrantConfirm && (
        <ConfirmModal
          onChange={setShowGrantConfirm}
          title={t('pages.mihomo.confirmUseTaskSchedule')}
          description={t('pages.mihomo.confirmUseTaskScheduleDesc')}
          onConfirm={async () => {
            await patchAppConfig({
              corePermissionMode: pendingPermissionMode as 'elevated' | 'service',
              // Asking for the task schedule again overrides an earlier refusal to elevate
              elevationDeclined: false
            })
            await notDialogQuit()
          }}
        />
      )}
      {showUnGrantConfirm && (
        <ConfirmModal
          onChange={setShowUnGrantConfirm}
          title={t('pages.mihomo.confirmCancelTaskSchedule')}
          description={t('pages.mihomo.confirmCancelTaskScheduleDesc')}
          buttons={unGrantButtons}
        />
      )}
      {showPermissionModal && (
        <PermissionModal
          onChange={setShowPermissionModal}
          onRevoke={async () => {
            if (platform === 'win32') {
              await deleteElevateTask()
              new Notification(t('pages.mihomo.taskScheduleCanceled'))
            } else {
              await revokeCorePermission()
              new Notification(t('pages.mihomo.corePermissionRevoked'))
            }
            await restartCore()
          }}
          onGrant={async () => {
            if (platform === 'win32') {
              await restartAsAdmin()
              return
            }
            await manualGrantCorePermition()
            new Notification(t('pages.mihomo.coreAuthSuccess'))
            await restartCore()
          }}
        />
      )}
      {showServiceModal && (
        <ServiceModal
          onChange={setShowServiceModal}
          onInit={async () => {
            await initService()
            new Notification(t('pages.mihomo.serviceInitSuccess'))
          }}
          onInstall={async () => {
            await installService()
            new Notification(t('pages.mihomo.serviceInstallSuccess'))
          }}
          onUninstall={async () => {
            await uninstallService()
            new Notification(t('pages.mihomo.serviceUninstallSuccess'))
          }}
          onStart={async () => {
            await startService()
            new Notification(t('pages.mihomo.serviceStartSuccess'))
          }}
          onRestart={async () => {
            await restartService()
            new Notification(t('pages.mihomo.serviceRestartSuccess'))
          }}
          onStop={async () => {
            await stopService()
            new Notification(t('pages.mihomo.serviceStopSuccess'))
          }}
        />
      )}
      <SettingCard>
        <SettingItem
          title={t('pages.mihomo.coreVersion')}
          actions={
            // The upgrade would target the running core, not the alpha one awaiting download
            pendingAlpha ? null : (
              <Button
                size="icon-sm"
                title={t('pages.mihomo.upgradeCore')}
                variant="ghost"
                disabled={upgrading}
                aria-busy={upgrading}
                onClick={handleCoreUpgrade}
              >
                {upgrading ? <Spinner className="size-4" /> : <CloudDownload className="text-lg" />}
              </Button>
            )
          }
          divider
        >
          <div className="flex items-center gap-2">
            {pendingAlpha && (
              <Button
                size="sm"
                variant="outline"
                title={t('pages.mihomo.downloadAlphaCoreHint')}
                disabled={downloadingAlpha}
                aria-busy={downloadingAlpha}
                onClick={handleAlphaDownload}
              >
                {downloadingAlpha ? (
                  <Spinner className="size-4" />
                ) : (
                  <Download className="size-4" />
                )}
                {t('pages.mihomo.downloadAlphaCore')}
              </Button>
            )}
            <Select value={pendingAlpha ? 'mihomo-alpha' : core} onValueChange={handleCoreChange}>
              <SelectTrigger size="sm" className="w-[300px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mihomo">{t('pages.mihomo.builtinStable')}</SelectItem>
                <SelectItem value="mihomo-alpha">
                  {t('pages.mihomo.builtinPreview')}
                  {!alphaInstalled && (
                    <span className="ml-1 text-muted-foreground">
                      {t('pages.mihomo.alphaCoreNotDownloaded')}
                    </span>
                  )}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </SettingItem>
        <SettingItem title={t('pages.mihomo.runningMode')} divider>
          <Tabs value={corePermissionMode} onValueChange={handlePermissionModeChange}>
            <TabsList>
              <TabsTrigger value="elevated">
                {platform === 'win32'
                  ? t('pages.mihomo.taskSchedule')
                  : t('pages.mihomo.authorizedRun')}
              </TabsTrigger>
              <TabsTrigger value="service" disabled>
                {t('pages.mihomo.systemService')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </SettingItem>
        <SettingItem
          title={platform === 'win32' ? t('pages.mihomo.taskStatus') : t('pages.mihomo.authStatus')}
          divider
        >
          <Button size="sm" onClick={() => setShowPermissionModal(true)}>
            {t('pages.mihomo.manage')}
          </Button>
        </SettingItem>
        <SettingItem title={t('pages.mihomo.serviceStatus')} divider>
          <Button size="sm" onClick={() => setShowServiceModal(true)}>
            {t('pages.mihomo.manage')}
          </Button>
        </SettingItem>
        <SettingItem title="IPv6" divider>
          <Switch
            checked={ipv6}
            onCheckedChange={(v) => onChangeNeedRestart({ ipv6: v })}
          />
        </SettingItem>
        <SettingItem title={t('pages.mihomo.logRetentionDays')} divider>
          <Input
            type="number"
            className="h-8 w-[100px]"
            value={maxLogDays.toString()}
            onChange={(event) =>
              patchAppConfig({ maxLogDays: parseInt(event.target.value) })
            }
          />
        </SettingItem>
        <SettingItem
          title={
            <>
              {t('pages.mihomo.logLevel')}
              {logLevelInfo?.fromProfile && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {t('pages.mihomo.fromProfile')}
                </span>
              )}
            </>
          }
          actions={
            logLevelInfo &&
            !logLevelInfo.fromProfile &&
            logLevelInfo.profileValue !== undefined && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon-sm" variant="ghost" onClick={onLogLevelReset}>
                    <RotateCcw className="text-lg" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t('pages.mihomo.useProfileLogLevel', {
                    level: logLevelOptions.find((o) => o.value === logLevelInfo.profileValue)?.label
                  })}
                </TooltipContent>
              </Tooltip>
            )
          }
        >
          {/* Скрытые копии всех вариантов задают ширину по самому длинному из них */}
          <div className="grid">
            {logLevelOptions.map((option) => (
              <span
                key={option.value}
                aria-hidden
                className="col-start-1 row-start-1 h-0 overflow-hidden border border-transparent pl-3 pr-9 text-sm whitespace-nowrap invisible"
              >
                {option.label}
              </span>
            ))}
            <Select value={logLevel} onValueChange={(value) => onLogLevelChange(value as LogLevel)}>
              <SelectTrigger size="sm" className="col-start-1 row-start-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {logLevelOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </SettingItem>
      </SettingCard>
      <PortSetting />
      <ControllerSetting />
      <EnvSetting />
      <AdvancedSetting />
    </BasePage>
  )
}

export default Mihomo
