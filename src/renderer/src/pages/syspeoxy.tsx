import { toast } from 'sonner'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Switch } from '@renderer/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import BasePage from '@renderer/components/base/base-page'
import SettingCard from '@renderer/components/base/base-setting-card'
import SettingItem from '@renderer/components/base/base-setting-item'
import EditableList from '@renderer/components/base/base-list-editor'
import PacEditorModal from '@renderer/components/sysproxy/pac-editor-modal'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { platform } from '@renderer/utils/init'
import { openUWPTool, restartCore, triggerSysProxy } from '@renderer/utils/ipc'
import React, { useEffect, useState } from 'react'
import ByPassEditorModal from '@renderer/components/sysproxy/bypass-editor-modal'
import { useTranslation } from 'react-i18next'
import { MessageCircleQuestionMark } from 'lucide-react'

const defaultPacScript = `
function FindProxyForURL(url, host) {
  return "PROXY 127.0.0.1:%mixed-port%; SOCKS5 127.0.0.1:%mixed-port%; DIRECT;";
}
`

const Sysproxy: React.FC = () => {
  const { t } = useTranslation()
  const defaultBypass: string[] =
    platform === 'linux'
      ? [
          'localhost',
          '.local',
          '127.0.0.1/8',
          '192.168.0.0/16',
          '10.0.0.0/8',
          '172.16.0.0/12',
          '::1'
        ]
      : platform === 'darwin'
        ? [
            '127.0.0.1/8',
            '192.168.0.0/16',
            '10.0.0.0/8',
            '172.16.0.0/12',
            'localhost',
            '*.local',
            '*.crashlytics.com',
            '<local>'
          ]
        : [
            'localhost',
            '127.*',
            '192.168.*',
            '10.*',
            '172.16.*',
            '172.17.*',
            '172.18.*',
            '172.19.*',
            '172.20.*',
            '172.21.*',
            '172.22.*',
            '172.23.*',
            '172.24.*',
            '172.25.*',
            '172.26.*',
            '172.27.*',
            '172.28.*',
            '172.29.*',
            '172.30.*',
            '172.31.*',
            '<local>'
          ]

  const { appConfig, patchAppConfig } = useAppConfig()
  const { sysProxy, onlyActiveDevice = false } =
    appConfig || ({ sysProxy: { enable: false } } as AppConfig)
  const [changed, setChanged] = useState(false)
  const [values, originSetValues] = useState({
    enable: sysProxy.enable,
    host: sysProxy.host ?? '',
    bypass: sysProxy.bypass ?? defaultBypass,
    mode: sysProxy.mode ?? 'manual',
    pacScript: sysProxy.pacScript ?? defaultPacScript,
    settingMode: sysProxy.settingMode ?? 'exec'
  })
  useEffect(() => {
    originSetValues((prev) => ({
      ...prev,
      enable: sysProxy.enable
    }))
  }, [sysProxy.enable])
  const [openEditor, setOpenEditor] = useState(false)
  const [openPacEditor, setOpenPacEditor] = useState(false)

  const setValues = (v: typeof values): void => {
    originSetValues(v)
    setChanged(true)
  }
  const onSave = async (): Promise<void> => {
    // check valid TODO
    const prevEnable = sysProxy.enable ?? false
    await patchAppConfig({ sysProxy: values })
    setChanged(false)
    if (values.enable) {
      try {
        await restartCore()
        await triggerSysProxy(values.enable, onlyActiveDevice)
      } catch (e) {
        toast.error(`${e}`)
        await patchAppConfig({ sysProxy: { enable: false } })
        await restartCore()
      }
    } else if (prevEnable) {
      try {
        await triggerSysProxy(false, onlyActiveDevice)
      } catch (e) {
        toast.error(`${e}`)
      }
      await restartCore()
    }
  }

  return (
    <BasePage
      title={t('pages.sysproxy.title')}
      header={
        changed && (
          <Button className="app-nodrag" size="sm" onClick={onSave}>
            {t('common.save')}
          </Button>
        )
      }
    >
      {openPacEditor && (
        <PacEditorModal
          script={values.pacScript || defaultPacScript}
          onCancel={() => setOpenPacEditor(false)}
          onConfirm={(script: string) => {
            setValues({ ...values, pacScript: script })
            setOpenPacEditor(false)
          }}
        />
      )}
      {openEditor && (
        <ByPassEditorModal
          bypass={values.bypass}
          onCancel={() => setOpenEditor(false)}
          onConfirm={async (list: string[]) => {
            setOpenEditor(false)
            setValues({
              ...values,
              bypass: list
            })
          }}
        />
      )}
      <SettingCard className="sysproxy-settings">
        <SettingItem title={t('pages.sysproxy.proxyHost')} divider>
          <Input
            className="w-[50%]"
            value={values.host}
            placeholder={t('pages.sysproxy.proxyHostPlaceholder')}
            onChange={(event) => {
              setValues({ ...values, host: event.target.value })
            }}
          />
        </SettingItem>
        <SettingItem title={t('pages.sysproxy.proxyMode')} divider>
          <Tabs
            value={values.mode}
            onValueChange={(value) => setValues({ ...values, mode: value as SysProxyMode })}
          >
            <TabsList>
              <TabsTrigger value="manual">{t('pages.sysproxy.manual')}</TabsTrigger>
              <TabsTrigger value="auto">{t('pages.sysproxy.auto')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </SettingItem>
        {platform === 'win32' && (
          <SettingItem title={t('pages.sysproxy.uwpTool')} divider>
            <Button
              size="sm"
              onClick={async () => {
                await openUWPTool()
              }}
            >
              {t('pages.sysproxy.openUWPTool')}
            </Button>
          </SettingItem>
        )}
        {platform == 'darwin' && (
          <>
            <SettingItem title={t('pages.sysproxy.settingMethod')} divider>
              <Tabs
                value={values.settingMode}
                onValueChange={(value) => {
                  setValues({ ...values, settingMode: value as 'exec' | 'service' })
                }}
              >
                <TabsList>
                  <TabsTrigger value="exec">{t('pages.sysproxy.execCommand')}</TabsTrigger>
                  <TabsTrigger value="service">{t('pages.sysproxy.serviceMode')}</TabsTrigger>
                </TabsList>
              </Tabs>
            </SettingItem>
            <SettingItem
              title={t('pages.sysproxy.onlyActiveInterface')}
              actions={
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon-sm" variant="ghost">
                      <MessageCircleQuestionMark className="text-lg" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div>{t('pages.sysproxy.onlyActiveInterfaceHelp')}</div>
                  </TooltipContent>
                </Tooltip>
              }
              divider
            >
              <Switch
                checked={onlyActiveDevice}
                disabled={!values.settingMode || values.settingMode !== 'service'}
                onCheckedChange={(value) => {
                  patchAppConfig({ onlyActiveDevice: value })
                }}
              />
            </SettingItem>
          </>
        )}
        {values.mode === 'auto' && (
          <SettingItem title={t('pages.sysproxy.proxyMode')}>
            <Button size="sm" onClick={() => setOpenPacEditor(true)}>
              {t('pages.sysproxy.editPACScript')}
            </Button>
          </SettingItem>
        )}
        {values.mode === 'manual' && (
          <>
            <SettingItem title={t('pages.sysproxy.addDefaultBypass')} divider>
              <Button
                size="sm"
                onClick={() => {
                  setValues({
                    ...values,
                    bypass: Array.from(new Set([...defaultBypass, ...values.bypass]))
                  })
                }}
              >
                {t('pages.sysproxy.addDefaultBypass')}
              </Button>
            </SettingItem>
            <SettingItem title={t('pages.sysproxy.proxyBypassList')}>
              <Button
                size="sm"
                onClick={async () => {
                  setOpenEditor(true)
                }}
              >
                {t('common.edit')}
              </Button>
            </SettingItem>
            <EditableList
              items={values.bypass}
              onChange={(list) => setValues({ ...values, bypass: list as string[] })}
              placeholder={t('pages.sysproxy.exampleBypass')}
              divider={false}
            />
          </>
        )}
      </SettingCard>
    </BasePage>
  )
}

export default Sysproxy
