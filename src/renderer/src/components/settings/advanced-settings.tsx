import React, { useState, useEffect } from 'react'
import { toast } from 'sonner'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText
} from '@renderer/components/ui/input-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import {
  copyEnv,
  patchControledMihomoConfig,
  restartCore,
  startNetworkDetection,
  stopNetworkDetection,
  mihomoHotReloadConfig
} from '@renderer/utils/ipc'
import { platform } from '@renderer/utils/init'
import { ChevronDownIcon, Copy, MessageCircleQuestionMark, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import EditableList from '../base/base-list-editor'
import { useTranslation } from 'react-i18next'

const emptyArray: string[] = []
type EnvType = 'bash' | 'cmd' | 'powershell' | 'nushell'

const envOptions: Array<{ value: EnvType; label: string }> = [
  { value: 'bash', label: 'Bash' },
  { value: 'cmd', label: 'CMD' },
  { value: 'powershell', label: 'PowerShell' },
  { value: 'nushell', label: 'NuShell' }
]

interface AdvancedSettingsProps {
  showHiddenSettings: boolean
}

const AdvancedSettings: React.FC<AdvancedSettingsProps> = (props) => {
  const { showHiddenSettings } = props
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { appConfig, patchAppConfig } = useAppConfig()
  const {
    diffWorkDir = false,
    useHotReloadProfile = true,
    controlDns = true,
    controlSniff = true,
    pauseSSID,
    mihomoCpuPriority = 'PRIORITY_NORMAL',
    autoLightweight = false,
    autoLightweightDelay = 60,
    autoLightweightMode = 'core',
    envType = [platform === 'win32' ? 'powershell' : 'bash'],
    networkDetection = false,
    networkDetectionBypass = ['VMware', 'vEthernet'],
    networkDetectionInterval = 10
  } = appConfig || {}

  const pauseSSIDArray = pauseSSID ?? emptyArray

  const [pauseSSIDInput, setPauseSSIDInput] = useState(pauseSSIDArray)

  const [bypass, setBypass] = useState(networkDetectionBypass)
  const [interval, setInterval] = useState(networkDetectionInterval)
  const envTypeValue = envType as EnvType[]
  const envTypeLabels = envOptions
    .filter((option) => envTypeValue.includes(option.value))
    .map((option) => option.label)
  const envTypeLabel = envTypeLabels.length ? envTypeLabels.join(', ') : '-'

  useEffect(() => {
    setPauseSSIDInput(pauseSSIDArray)
  }, [pauseSSIDArray])

  const handleEnvTypeChange = async (value: EnvType, checked: boolean): Promise<void> => {
    const next = checked
      ? Array.from(new Set([...envTypeValue, value]))
      : envTypeValue.filter((item) => item !== value)
    if (next.length === 0) return
    try {
      await patchAppConfig({
        envType: next
      })
    } catch (e) {
      toast.error(`${e}`)
    }
  }

  return (
    <SettingCard title={t('settings.advanced.moreSettings')}>
      <SettingItem
        title={t('settings.advanced.autoEnterLightMode')}
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-sm" variant="ghost">
                <MessageCircleQuestionMark className="text-lg" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('settings.advanced.autoEnterLightModeHelp')}</TooltipContent>
          </Tooltip>
        }
        divider
      >
        <Switch
          checked={autoLightweight}
          onCheckedChange={(value) => {
            patchAppConfig({ autoLightweight: value })
          }}
        />
      </SettingItem>
      {autoLightweight && (
        <>
          <SettingItem title={t('settings.advanced.lightModeBehavior')} divider>
            <Tabs
              value={autoLightweightMode}
              onValueChange={(value) => {
                patchAppConfig({ autoLightweightMode: value as 'core' | 'tray' })
                if (value === 'core') {
                  patchAppConfig({ autoLightweightDelay: Math.max(autoLightweightDelay, 5) })
                }
              }}
            >
              <TabsList>
                <TabsTrigger value="core">{t('settings.advanced.keepCoreOnly')}</TabsTrigger>
                <TabsTrigger value="tray">{t('settings.advanced.closeRendererOnly')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </SettingItem>
          <SettingItem title={t('settings.advanced.autoEnterLightModeDelay')} divider>
            <InputGroup className="w-37.5 h-8">
              <InputGroupInput
                type="number"
                value={autoLightweightDelay.toString()}
                onChange={async (event) => {
                  let num = parseInt(event.target.value)
                  if (isNaN(num)) num = 0
                  const minDelay = autoLightweightMode === 'core' ? 5 : 0
                  if (num < minDelay) num = minDelay
                  await patchAppConfig({ autoLightweightDelay: num })
                }}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>{t('settings.advanced.seconds')}</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
          </SettingItem>
        </>
      )}
      {showHiddenSettings && (
        <SettingItem
          title={t('settings.advanced.copyEnvType')}
          actions={envType.map((type) => (
            <Button
              key={type}
              title={type}
              size="icon-sm"
              variant="ghost"
              onClick={() => copyEnv(type)}
            >
              <Copy className="text-lg" />
            </Button>
          ))}
          divider
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="w-37.5 justify-between">
                <span className="truncate">{envTypeLabel}</span>
                <ChevronDownIcon className="size-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-37.5">
              {envOptions.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.value}
                  checked={envTypeValue.includes(option.value)}
                  onCheckedChange={(checked) => handleEnvTypeChange(option.value, checked)}
                >
                  {option.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </SettingItem>
      )}
      {platform === 'win32' && (
        <SettingItem title={t('settings.advanced.corePriority')} divider>
          <Select
            value={mihomoCpuPriority}
            onValueChange={async (value) => {
              try {
                await patchAppConfig({
                  mihomoCpuPriority: value as Priority
                })
                await restartCore()
              } catch (e) {
                toast.error(`${e}`)
              }
            }}
          >
            <SelectTrigger size="sm" className="w-37.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PRIORITY_HIGHEST">{t('settings.advanced.realtime')}</SelectItem>
              <SelectItem value="PRIORITY_HIGH">{t('settings.advanced.high')}</SelectItem>
              <SelectItem value="PRIORITY_ABOVE_NORMAL">
                {t('settings.advanced.aboveNormal')}
              </SelectItem>
              <SelectItem value="PRIORITY_NORMAL">{t('settings.advanced.normal')}</SelectItem>
              <SelectItem value="PRIORITY_BELOW_NORMAL">
                {t('settings.advanced.belowNormal')}
              </SelectItem>
              <SelectItem value="PRIORITY_LOW">{t('settings.advanced.low')}</SelectItem>
            </SelectContent>
          </Select>
        </SettingItem>
      )}
      <SettingItem
        title={t('settings.advanced.takeOverDNS')}
        actions={
          <Button size="icon-sm" variant="ghost" onClick={() => navigate('/dns')}>
            <Settings className="text-lg" />
          </Button>
        }
        divider
      >
        <Switch
          checked={controlDns}
          onCheckedChange={async (value) => {
            try {
              await patchAppConfig({ controlDns: value })
              await patchControledMihomoConfig({})
              await mihomoHotReloadConfig()
            } catch (e) {
              toast.error(`${e}`)
            }
          }}
        />
      </SettingItem>
      <SettingItem
        title={t('settings.advanced.takeOverSniffer')}
        actions={
          <Button size="icon-sm" variant="ghost" onClick={() => navigate('/sniffer')}>
            <Settings className="text-lg" />
          </Button>
        }
        divider
      >
        <Switch
          checked={controlSniff}
          onCheckedChange={async (value) => {
            try {
              await patchAppConfig({ controlSniff: value })
              await patchControledMihomoConfig({})
              await mihomoHotReloadConfig()
            } catch (e) {
              toast.error(`${e}`)
            }
          }}
        />
      </SettingItem>
      <SettingItem
        title={t('profile.separateWorkDir')}
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-sm" variant="ghost">
                <MessageCircleQuestionMark className="text-lg" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('profile.separateWorkDirHelp')}</TooltipContent>
          </Tooltip>
        }
        divider
      >
        <Switch
          checked={diffWorkDir}
          onCheckedChange={(v) => {
            patchAppConfig({ diffWorkDir: v })
          }}
        />
      </SettingItem>
      <SettingItem
        title={t('settings.advanced.useHotReloadProfile')}
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-sm" variant="ghost">
                <MessageCircleQuestionMark className="text-lg" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('settings.advanced.useHotReloadProfileHelp')}</TooltipContent>
          </Tooltip>
        }
        divider
      >
        <Switch
          checked={useHotReloadProfile}
          onCheckedChange={(v) => {
            patchAppConfig({ useHotReloadProfile: v })
          }}
        />
      </SettingItem>
      <SettingItem
        title={t('settings.advanced.stopCoreOnDisconnect')}
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-sm" variant="ghost">
                <MessageCircleQuestionMark className="text-lg" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('settings.advanced.stopCoreOnDisconnectHelp')}</TooltipContent>
          </Tooltip>
        }
        divider
      >
        <Switch
          checked={networkDetection}
          onCheckedChange={(value) => {
            patchAppConfig({ networkDetection: value })
            if (value) {
              startNetworkDetection()
            } else {
              stopNetworkDetection()
            }
          }}
        />
      </SettingItem>
      {networkDetection && (
        <>
          <SettingItem title={t('settings.advanced.disconnectDetectInterval')} divider>
            <div className="flex items-center">
              {interval !== networkDetectionInterval && (
                <Button
                  size="sm"
                  className="mr-2"
                  onClick={async () => {
                    await patchAppConfig({ networkDetectionInterval: interval })
                    await startNetworkDetection()
                  }}
                >
                  {t('common.confirm')}
                </Button>
              )}
              <InputGroup className="w-37.5 h-8">
                <InputGroupInput
                  type="number"
                  value={interval.toString()}
                  min={1}
                  onChange={(event) => {
                    setInterval(parseInt(event.target.value))
                  }}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>{t('settings.advanced.seconds')}</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </div>
          </SettingItem>
          <SettingItem title={t('settings.advanced.bypassDetectInterfaces')}>
            {bypass.length != networkDetectionBypass.length && (
              <Button
                size="sm"
                onClick={async () => {
                  await patchAppConfig({ networkDetectionBypass: bypass })
                  await startNetworkDetection()
                }}
              >
                {t('common.confirm')}
              </Button>
            )}
          </SettingItem>
          <EditableList items={bypass} onChange={(list) => setBypass(list as string[])} />
        </>
      )}
      <SettingItem title={t('settings.advanced.directOnSpecificWifi')}>
        {pauseSSIDInput.join('') !== pauseSSIDArray.join('') && (
          <Button
            size="sm"
            onClick={() => {
              patchAppConfig({ pauseSSID: pauseSSIDInput })
            }}
          >
            {t('common.confirm')}
          </Button>
        )}
      </SettingItem>
      <EditableList
        items={pauseSSIDInput}
        onChange={(list) => setPauseSSIDInput(list as string[])}
        divider={false}
      />
    </SettingCard>
  )
}

export default AdvancedSettings
