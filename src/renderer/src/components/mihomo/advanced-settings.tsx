import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import InterfaceSelect from '../base/interface-select'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
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
import { useState } from 'react'
import { t } from 'i18next'
import { MessageCircleQuestionMark } from 'lucide-react'

const AdvancedSetting: React.FC = () => {
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const {
    'unified-delay': unifiedDelay,
    'tcp-concurrent': tcpConcurrent,
    'disable-keep-alive': disableKeepAlive = false,
    'find-process-mode': findProcessMode = 'always',
    'interface-name': interfaceName = '',
    'global-client-fingerprint': globalClientFingerprint = '',
    'keep-alive-idle': idle = 15,
    'keep-alive-interval': interval = 15,
    profile = {},
    tun = {}
  } = controledMihomoConfig || {}
  const { 'store-selected': storeSelected, 'store-fake-ip': storeFakeIp } = profile
  const { device = 'mihomo' } = tun

  const [idleInput, setIdleInput] = useState(idle)
  const [intervalInput, setIntervalInput] = useState(interval)
  const NONE = '__none__'
  const fingerprintValue = globalClientFingerprint || NONE

  const onChangeNeedRestart = async (patch: Partial<MihomoConfig>): Promise<void> => {
    await patchControledMihomoConfig(patch)
  }

  return (
    <SettingCard title={t('mihomo.advancedSettings.title')}>
      <SettingItem title={t('mihomo.advancedSettings.findProcess')} divider>
        <Tabs
          value={findProcessMode}
          onValueChange={(value) => {
            onChangeNeedRestart({ 'find-process-mode': value as FindProcessMode })
          }}
        >
          <TabsList>
            <TabsTrigger value="strict">{t('mihomo.advancedSettings.auto')}</TabsTrigger>
            <TabsTrigger value="off">{t('common.close')}</TabsTrigger>
            <TabsTrigger value="always">{t('mihomo.advancedSettings.enable')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </SettingItem>
      <SettingItem title={t('mihomo.advancedSettings.storeSelected')} divider>
        <Switch
          checked={storeSelected}
          onCheckedChange={(value) => {
            onChangeNeedRestart({ profile: { 'store-selected': value } })
          }}
        />
      </SettingItem>
      <SettingItem title={t('mihomo.advancedSettings.storeFakeIP')} divider>
        <Switch
          checked={storeFakeIp}
          onCheckedChange={(value) => {
            onChangeNeedRestart({ profile: { 'store-fake-ip': value } })
          }}
        />
      </SettingItem>
      <SettingItem
        title={t('mihomo.advancedSettings.unifiedDelay')}
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-sm" variant="ghost">
                <MessageCircleQuestionMark className="text-lg" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('mihomo.advancedSettings.unifiedDelayTip')}</TooltipContent>
          </Tooltip>
        }
        divider
      >
        <Switch
          checked={unifiedDelay}
          onCheckedChange={(value) => {
            onChangeNeedRestart({ 'unified-delay': value })
          }}
        />
      </SettingItem>
      <SettingItem
        title={t('mihomo.advancedSettings.tcpConcurrent')}
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-sm" variant="ghost">
                <MessageCircleQuestionMark className="text-lg" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('mihomo.advancedSettings.tcpConcurrentTip')}</TooltipContent>
          </Tooltip>
        }
        divider
      >
        <Switch
          checked={tcpConcurrent}
          onCheckedChange={(value) => {
            onChangeNeedRestart({ 'tcp-concurrent': value })
          }}
        />
      </SettingItem>
      <SettingItem title={t('mihomo.advancedSettings.disableTCPKeepAlive')} divider>
        <Switch
          checked={disableKeepAlive}
          onCheckedChange={(value) => {
            onChangeNeedRestart({ 'disable-keep-alive': value })
          }}
        />
      </SettingItem>
      <SettingItem title={t('mihomo.advancedSettings.tcpKeepAliveInterval')} divider>
        <div className="flex">
          {intervalInput !== interval && (
            <Button
              size="sm"
              className="mr-2"
              onClick={async () => {
                await onChangeNeedRestart({ 'keep-alive-interval': intervalInput })
              }}
            >
              {t('common.confirm')}
            </Button>
          )}
          <Input
            type="number"
            className="w-[100px] h-8"
            value={intervalInput.toString()}
            min={0}
            onChange={(event) => {
              setIntervalInput(parseInt(event.target.value) || 0)
            }}
          />
        </div>
      </SettingItem>
      <SettingItem title={t('mihomo.advancedSettings.tcpKeepAliveIdle')} divider>
        <div className="flex">
          {idleInput !== idle && (
            <Button
              size="sm"
              className="mr-2"
              onClick={async () => {
                await onChangeNeedRestart({ 'keep-alive-idle': idleInput })
              }}
            >
              {t('common.confirm')}
            </Button>
          )}
          <Input
            type="number"
            className="w-[100px] h-8"
            value={idleInput.toString()}
            min={0}
            onChange={(event) => {
              setIdleInput(parseInt(event.target.value) || 0)
            }}
          />
        </div>
      </SettingItem>
      <SettingItem title={t('mihomo.advancedSettings.utlsFingerprint')} divider>
        <Select
          value={fingerprintValue}
          onValueChange={(value) => {
            onChangeNeedRestart({
              'global-client-fingerprint': (value === NONE ? '' : value) as Fingerprints
            })
          }}
        >
          <SelectTrigger size="sm" className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t('mihomo.advancedSettings.disabled')}</SelectItem>
            <SelectItem value="random">{t('mihomo.advancedSettings.random')}</SelectItem>
            <SelectItem value="chrome">Chrome</SelectItem>
            <SelectItem value="firefox">Firefox</SelectItem>
            <SelectItem value="safari">Safari</SelectItem>
            <SelectItem value="ios">iOS</SelectItem>
            <SelectItem value="android">Android</SelectItem>
            <SelectItem value="edge">Edge</SelectItem>
            <SelectItem value="360">360</SelectItem>
            <SelectItem value="qq">QQ</SelectItem>
          </SelectContent>
        </Select>
      </SettingItem>
      <SettingItem title={t('mihomo.advancedSettings.outboundInterface')}>
        <InterfaceSelect
          value={interfaceName}
          exclude={[device, 'lo']}
          onChange={(iface) => onChangeNeedRestart({ 'interface-name': iface })}
        />
      </SettingItem>
    </SettingCard>
  )
}

export default AdvancedSetting
