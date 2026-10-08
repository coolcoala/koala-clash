import React, { useState } from 'react'
import useSWR from 'swr'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import EditableList from '../base/base-list-editor'

import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { getEffectivePorts, mihomoHotReloadConfig } from '@renderer/utils/ipc'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { platform } from '@renderer/utils/init'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Switch } from '@renderer/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import InterfaceModal from '@renderer/components/mihomo/interface-modal'
import { useTranslation } from 'react-i18next'
import { Network, RotateCcw } from 'lucide-react'

const PORT_KEYS: MihomoPortKey[] = ['mixed-port', 'socks-port', 'port', 'redir-port', 'tproxy-port']

const PortSetting: React.FC = () => {
  const { t } = useTranslation()
  const { appConfig, patchAppConfig } = useAppConfig()
  const { customPorts = [] } = appConfig || {}
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const { data: ports, mutate: mutatePorts } = useSWR('getEffectivePorts', getEffectivePorts)
  const {
    authentication = [],
    'skip-auth-prefixes': skipAuthPrefixes = ['127.0.0.1/32'],
    'allow-lan': allowLan,
    'lan-allowed-ips': lanAllowedIps = [],
    'lan-disallowed-ips': lanDisallowedIps = []
  } = controledMihomoConfig || {}

  // unconfirmed edits; a port without one shows the value mihomo actually uses
  const [portInputs, setPortInputs] = useState<Partial<Record<MihomoPortKey, number>>>({})
  const [lanAllowedIpsInput, setLanAllowedIpsInput] = useState(lanAllowedIps)
  const [lanDisallowedIpsInput, setLanDisallowedIpsInput] = useState(lanDisallowedIps)
  const [authenticationInput, setAuthenticationInput] = useState(authentication)
  const [skipAuthPrefixesInput, setSkipAuthPrefixesInput] = useState(skipAuthPrefixes)
  const [lanOpen, setLanOpen] = useState(false)

  const parseAuth = (item: string): { part1: string; part2: string } => {
    const [user = '', pass = ''] = item.split(':')
    return { part1: user, part2: pass }
  }
  const formatAuth = (user: string, pass?: string): string => `${user}:${pass || ''}`
  const portInput = (key: MihomoPortKey): number =>
    portInputs[key] ?? ports?.[key].value ?? controledMihomoConfig?.[key] ?? 0
  const clearPortInput = (key: MihomoPortKey): void => {
    setPortInputs((inputs) => {
      const next = { ...inputs }
      delete next[key]
      return next
    })
  }
  const hasPortConflict = (): boolean => {
    const values = PORT_KEYS.map(portInput).filter((p) => p !== 0)
    return new Set(values).size !== values.length
  }

  const onChangeNeedRestart = async (patch: Partial<MihomoConfig>): Promise<void> => {
    await patchControledMihomoConfig(patch)
    await mihomoHotReloadConfig()
  }

  // A confirmed port becomes the user's choice and stops following the profile
  const onPortConfirm = async (key: MihomoPortKey): Promise<void> => {
    if (!customPorts.includes(key)) {
      await patchAppConfig({ customPorts: [...customPorts, key] })
    }
    await onChangeNeedRestart({ [key]: portInput(key) })
    await mutatePorts()
    clearPortInput(key)
  }

  const onPortReset = async (key: MihomoPortKey): Promise<void> => {
    await patchAppConfig({ customPorts: customPorts.filter((k) => k !== key) })
    await mihomoHotReloadConfig()
    await mutatePorts()
    clearPortInput(key)
  }

  const renderPortItem = (key: MihomoPortKey, title: string): React.ReactNode => {
    const info = ports?.[key]
    const value = portInput(key)
    return (
      <SettingItem
        title={
          <>
            {title}
            {info?.fromProfile && (
              <span className="ml-2 text-xs text-muted-foreground">
                {t('mihomo.portSettings.fromProfile')}
              </span>
            )}
          </>
        }
        actions={
          info &&
          !info.fromProfile &&
          info.profileValue !== undefined && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon-sm" variant="ghost" onClick={() => onPortReset(key)}>
                  <RotateCcw className="text-lg" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {t('mihomo.portSettings.useProfilePort', { port: info.profileValue })}
              </TooltipContent>
            </Tooltip>
          )
        }
        divider
      >
        <div className="flex">
          {info && value !== info.value && (
            <Button
              size="sm"
              className="mr-2"
              disabled={hasPortConflict()}
              onClick={() => onPortConfirm(key)}
            >
              {t('common.confirm')}
            </Button>
          )}
          <Input
            type="number"
            className="w-25 h-8 text-sm"
            value={value.toString()}
            max={65535}
            min={0}
            onChange={(e) => {
              setPortInputs((inputs) => ({ ...inputs, [key]: parseInt(e.target.value) || 0 }))
            }}
          />
        </div>
      </SettingItem>
    )
  }

  return (
    <>
      {lanOpen && <InterfaceModal onClose={() => setLanOpen(false)} />}
      <SettingCard title={t('mihomo.portSettings.title')}>
        {renderPortItem('mixed-port', t('mihomo.portSettings.mixedPort'))}
        {renderPortItem('socks-port', t('mihomo.portSettings.socksPort'))}
        {renderPortItem('port', t('mihomo.portSettings.httpPort'))}
        {platform !== 'win32' && renderPortItem('redir-port', t('mihomo.portSettings.redirPort'))}
        {platform === 'linux' && renderPortItem('tproxy-port', t('mihomo.portSettings.tproxyPort'))}
        <SettingItem
          title={t('mihomo.portSettings.allowLan')}
          actions={
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => {
                setLanOpen(true)
              }}
            >
              <Network className="text-lg" />
            </Button>
          }
          divider
        >
          <Switch
            checked={allowLan}
            onCheckedChange={(v) => {
              onChangeNeedRestart({ 'allow-lan': v })
            }}
          />
        </SettingItem>
        {allowLan && (
          <>
            <SettingItem title={t('mihomo.portSettings.allowedIpRanges')}>
              {lanAllowedIpsInput.join('') !== lanAllowedIps.join('') && (
                <Button
                  size="sm"
                  onClick={() => {
                    onChangeNeedRestart({ 'lan-allowed-ips': lanAllowedIpsInput })
                  }}
                >
                  {t('common.confirm')}
                </Button>
              )}
            </SettingItem>
            <EditableList
              items={lanAllowedIpsInput}
              onChange={(items) => setLanAllowedIpsInput(items as string[])}
              placeholder={t('mihomo.portSettings.ipRangePlaceholder')}
            />
            <SettingItem title={t('mihomo.portSettings.deniedIpRanges')}>
              {lanDisallowedIpsInput.join('') !== lanDisallowedIps.join('') && (
                <Button
                  size="sm"
                  onClick={() => {
                    onChangeNeedRestart({ 'lan-disallowed-ips': lanDisallowedIpsInput })
                  }}
                >
                  {t('common.confirm')}
                </Button>
              )}
            </SettingItem>
            <EditableList
              items={lanDisallowedIpsInput}
              onChange={(items) => setLanDisallowedIpsInput(items as string[])}
              placeholder={t('mihomo.portSettings.ipRangePlaceholder')}
            />
          </>
        )}
        <SettingItem title={t('mihomo.portSettings.authentication')}>
          {authenticationInput.join() !== authentication.join() && (
            <Button
              size="sm"
              onClick={() => onChangeNeedRestart({ authentication: authenticationInput })}
            >
              {t('common.confirm')}
            </Button>
          )}
        </SettingItem>
        <EditableList
          items={authenticationInput}
          onChange={(items) => setAuthenticationInput(items as string[])}
          placeholder={t('mihomo.portSettings.usernamePlaceholder')}
          part2Placeholder={t('mihomo.portSettings.passwordPlaceholder')}
          parse={parseAuth}
          format={formatAuth}
        />
        <SettingItem title={t('mihomo.portSettings.skipAuthIpRanges')}>
          {skipAuthPrefixesInput.join('') !== skipAuthPrefixes.join('') && (
            <Button
              size="sm"
              onClick={() => {
                onChangeNeedRestart({ 'skip-auth-prefixes': skipAuthPrefixesInput })
              }}
            >
              {t('common.confirm')}
            </Button>
          )}
        </SettingItem>
        <EditableList
          items={skipAuthPrefixesInput}
          onChange={(items) => setSkipAuthPrefixesInput(items as string[])}
          placeholder={t('mihomo.portSettings.ipRangePlaceholder')}
          disableFirst
          divider={false}
        />
      </SettingCard>
    </>
  )
}

export default PortSetting
