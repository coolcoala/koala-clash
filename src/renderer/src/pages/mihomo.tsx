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
  findSystemMihomo,
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
  restartService
} from '@renderer/utils/ipc'
import React, { useState, useEffect } from 'react'
import ControllerSetting from '@renderer/components/mihomo/controller-setting'
import EnvSetting from '@renderer/components/mihomo/env-setting'
import AdvancedSetting from '@renderer/components/mihomo/advanced-settings'
import { useTranslation } from 'react-i18next'
import { CloudDownload } from 'lucide-react'

let systemCorePathsCache: string[] | null = null
let cachePromise: Promise<string[]> | null = null

const getSystemCorePaths = async (): Promise<string[]> => {
  if (systemCorePathsCache !== null) return systemCorePathsCache
  if (cachePromise !== null) return cachePromise

  cachePromise = findSystemMihomo()
    .then((paths) => {
      systemCorePathsCache = paths
      cachePromise = null
      return paths
    })
    .catch(() => {
      cachePromise = null
      return []
    })

  return cachePromise
}

getSystemCorePaths().catch(() => {})

const Mihomo: React.FC = () => {
  const { t } = useTranslation()
  const { appConfig, patchAppConfig } = useAppConfig()
  const { core = 'mihomo', maxLogDays = 7, corePermissionMode = 'elevated' } = appConfig || {}
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const { ipv6, 'log-level': logLevel = 'info' } = controledMihomoConfig || {}

  const [upgrading, setUpgrading] = useState(false)
  const [showGrantConfirm, setShowGrantConfirm] = useState(false)
  const [showUnGrantConfirm, setShowUnGrantConfirm] = useState(false)
  const [showPermissionModal, setShowPermissionModal] = useState(false)
  const [showServiceModal, setShowServiceModal] = useState(false)
  const [pendingPermissionMode, setPendingPermissionMode] = useState<string>('')
  const [systemCorePaths, setSystemCorePaths] = useState<string[]>(systemCorePathsCache || [])
  const [loadingPaths, setLoadingPaths] = useState(systemCorePathsCache === null)

  useEffect(() => {
    if (systemCorePathsCache !== null) return

    getSystemCorePaths()
      .then(setSystemCorePaths)
      .catch(() => {})
      .finally(() => setLoadingPaths(false))
  }, [])

  const onChangeNeedRestart = async (patch: Partial<MihomoConfig>): Promise<void> => {
    await patchControledMihomoConfig(patch)
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

  const handleCoreChange = async (newCore: 'mihomo' | 'mihomo-alpha' | 'system'): Promise<void> => {
    if (newCore === 'system') {
      const paths = await getSystemCorePaths()

      if (paths.length === 0) {
        new Notification(t('pages.mihomo.systemCoreNotFound'), {
          body: t('pages.mihomo.systemCoreNotFoundBody')
        })
        return
      }

      if (!appConfig?.systemCorePath || !paths.includes(appConfig.systemCorePath)) {
        await patchAppConfig({ systemCorePath: paths[0] })
      }
    }
    handleConfigChangeWithRestart('core', newCore)
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

  return (
    <BasePage title={t('pages.mihomo.title')}>
      {showGrantConfirm && (
        <ConfirmModal
          onChange={setShowGrantConfirm}
          title={t('pages.mihomo.confirmUseTaskSchedule')}
          description={t('pages.mihomo.confirmUseTaskScheduleDesc')}
          onConfirm={async () => {
            await patchAppConfig({
              corePermissionMode: pendingPermissionMode as 'elevated' | 'service'
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
            core === 'mihomo' || core === 'mihomo-alpha' ? (
              <Button
                size="icon-sm"
                title={t('pages.mihomo.upgradeCore')}
                variant="ghost"
                disabled={upgrading}
                aria-busy={upgrading}
                onClick={handleCoreUpgrade}
              >
                {upgrading ? (
                  <Spinner className="size-4" />
                ) : (
                  <CloudDownload className="text-lg" />
                )}
              </Button>
            ) : null
          }
          divider
        >
          <Select
            value={core}
            onValueChange={(value) =>
              handleCoreChange(value as 'mihomo' | 'mihomo-alpha' | 'system')
            }
          >
            <SelectTrigger size="sm" className="w-[300px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mihomo">{t('pages.mihomo.builtinStable')}</SelectItem>
              <SelectItem value="mihomo-alpha">{t('pages.mihomo.builtinPreview')}</SelectItem>
              <SelectItem value="system">{t('pages.mihomo.useSystemCore')}</SelectItem>
            </SelectContent>
          </Select>
        </SettingItem>
        {core === 'system' && (
          <SettingItem title={t('pages.mihomo.systemCorePath')} divider>
            <Select
              value={appConfig?.systemCorePath}
              disabled={loadingPaths}
              onValueChange={(value) => {
                if (value) handleConfigChangeWithRestart('systemCorePath', value)
              }}
            >
              <SelectTrigger size="sm" className="w-[350px]">
                <SelectValue
                  placeholder={
                    loadingPaths
                      ? t('pages.mihomo.searchingCore')
                      : t('pages.mihomo.coreNotFound')
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {loadingPaths ? (
                  <SelectItem value="">{t('pages.mihomo.searchingCore')}</SelectItem>
                ) : systemCorePaths.length > 0 ? (
                  systemCorePaths.map((path) => (
                    <SelectItem key={path} value={path}>
                      {path}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="">{t('pages.mihomo.coreNotFound')}</SelectItem>
                )}
              </SelectContent>
            </Select>
            {!loadingPaths && systemCorePaths.length === 0 && (
              <div className="mt-2 text-sm text-warning">
                {t('pages.mihomo.coreNotFoundWarning')}
              </div>
            )}
          </SettingItem>
        )}
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
        <SettingItem title={t('pages.mihomo.logLevel')}>
          <Select
            value={logLevel}
            onValueChange={(value) => onChangeNeedRestart({ 'log-level': value as LogLevel })}
          >
            <SelectTrigger size="sm" className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="silent">{t('pages.mihomo.silent')}</SelectItem>
              <SelectItem value="error">{t('pages.mihomo.error')}</SelectItem>
              <SelectItem value="warning">{t('pages.mihomo.warning')}</SelectItem>
              <SelectItem value="info">{t('pages.mihomo.info')}</SelectItem>
              <SelectItem value="debug">{t('pages.mihomo.debug')}</SelectItem>
            </SelectContent>
          </Select>
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
