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
import AdvancedDnsSetting from '@renderer/components/dns/advanced-dns-setting'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import React, { useState } from 'react'
import {
  isValidIPv4Cidr,
  isValidIPv6Cidr,
  isValidDomainWildcard,
  isValidDnsServer
} from '@renderer/utils/validate'
import { useTranslation } from 'react-i18next'

const DNS: React.FC = () => {
  const { t } = useTranslation()
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const { appConfig, patchAppConfig } = useAppConfig()
  const { hosts } = appConfig || {}
  const { dns } = controledMihomoConfig || {}
  const {
    ipv6 = false,
    'fake-ip-range': fakeIPRange = '198.18.0.1/16',
    'fake-ip-range6': fakeIPRange6 = '',
    'fake-ip-filter': fakeIPFilter = [
      '*',
      '+.lan',
      '+.local',
      'time.*.com',
      'ntp.*.com',
      '+.market.xiaomi.com'
    ],
    'enhanced-mode': enhancedMode = 'fake-ip',
    'use-hosts': useHosts = false,
    'use-system-hosts': useSystemHosts = false,
    'respect-rules': respectRules = false,
    'default-nameserver': defaultNameserver = ['tls://223.5.5.5'],
    nameserver = ['https://doh.pub/dns-query', 'https://dns.alidns.com/dns-query'],
    'proxy-server-nameserver': proxyServerNameserver = [],
    'direct-nameserver': directNameserver = [],
    'nameserver-policy': nameserverPolicy = {}
  } = dns || {}
  const [changed, setChanged] = useState(false)
  const [values, originSetValues] = useState({
    ipv6,
    useHosts,
    enhancedMode,
    fakeIPRange,
    fakeIPRange6,
    fakeIPFilter,
    useSystemHosts,
    respectRules,
    defaultNameserver,
    nameserver,
    proxyServerNameserver,
    directNameserver,
    nameserverPolicy,
    hosts: useHosts ? hosts : undefined
  })
  const [fakeIPRangeError, setFakeIPRangeError] = useState<string | null>(() => {
    const r = isValidIPv4Cidr(fakeIPRange)
    return r.ok ? null : (r.error ?? t('common.formatError'))
  })
  const [fakeIPRange6Error, setFakeIPRange6Error] = useState<string | null>(() => {
    const r = isValidIPv6Cidr(fakeIPRange6)
    return r.ok ? null : (r.error ?? t('common.formatError'))
  })
  const [fakeIPFilterError, setFakeIPFilterError] = useState<string | null>(() => {
    if (!Array.isArray(fakeIPFilter)) return null
    const firstInvalid = fakeIPFilter.find((f) => !isValidDomainWildcard(f).ok)
    return firstInvalid ? (isValidDomainWildcard(firstInvalid).error ?? t('common.formatError')) : null
  })
  const [defaultNameserverError, setDefaultNameserverError] = useState<string | null>(() => {
    if (!Array.isArray(defaultNameserver)) return null
    const firstInvalid = defaultNameserver.find((f) => !isValidDnsServer(f, true).ok)
    return firstInvalid ? (isValidDnsServer(firstInvalid, true).error ?? t('common.formatError')) : null
  })
  const [nameserverError, setNameserverError] = useState<string | null>(() => {
    if (!Array.isArray(nameserver)) return null
    const firstInvalid = nameserver.find((f) => !isValidDnsServer(f).ok)
    return firstInvalid ? (isValidDnsServer(firstInvalid).error ?? t('common.formatError')) : null
  })
  const [advancedDnsError, setAdvancedDnsError] = useState(false)
  const hasDnsErrors = Boolean(defaultNameserverError || nameserverError || advancedDnsError)

  const setValues = (v: typeof values): void => {
    originSetValues(v)
    setChanged(true)
  }

  const onSave = async (patch: Partial<MihomoConfig>): Promise<void> => {
    await patchAppConfig({
      hosts: values.hosts
    })
    try {
      setChanged(false)
      await patchControledMihomoConfig(patch)
    } catch (e) {
      toast.error(`${e}`)
    }
  }

  return (
    <BasePage
      title={t('pages.dns.title')}
      header={
        changed && (
          <Button
            size="sm"
            className="app-nodrag"
            disabled={
              values && values.enhancedMode === 'fake-ip'
                ? Boolean(fakeIPRangeError) ||
                  (values.ipv6 && Boolean(fakeIPRange6Error)) ||
                  Boolean(fakeIPFilterError) ||
                  hasDnsErrors
                : hasDnsErrors
            }
            onClick={() => {
              const hostsObject =
                values.useHosts && values.hosts && values.hosts.length > 0
                  ? Object.fromEntries(values.hosts.map(({ domain, value }) => [domain, value]))
                  : undefined
              const dnsConfig = {
                ipv6: values.ipv6,
                'fake-ip-range': values.fakeIPRange,
                'fake-ip-range6': values.fakeIPRange6,
                'fake-ip-filter': values.fakeIPFilter,
                'enhanced-mode': values.enhancedMode,
                'use-hosts': values.useHosts,
                'use-system-hosts': values.useSystemHosts,
                'respect-rules': values.respectRules,
                'default-nameserver': values.defaultNameserver,
                nameserver: values.nameserver,
                'proxy-server-nameserver': values.proxyServerNameserver,
                'direct-nameserver': values.directNameserver,
                'nameserver-policy': values.nameserverPolicy
              }
              onSave({
                dns: dnsConfig,
                hosts: hostsObject
              })
            }}
          >
            {t('common.save')}
          </Button>
        )
      }
    >
      <SettingCard>
        <SettingItem title={t('pages.dns.ipv6')} divider>
          <Switch
            checked={values.ipv6}
            onCheckedChange={(v) => {
              setValues({ ...values, ipv6: v })
            }}
          />
        </SettingItem>
        <SettingItem title={t('pages.dns.domainMappingMode')} divider>
          <Tabs
            value={values.enhancedMode}
            onValueChange={(value) => setValues({ ...values, enhancedMode: value as DnsMode })}
          >
            <TabsList>
              <TabsTrigger value="fake-ip">{t('pages.dns.fakeIP')}</TabsTrigger>
              <TabsTrigger value="redir-host">{t('pages.dns.realIP')}</TabsTrigger>
              <TabsTrigger value="normal">{t('pages.dns.cancelMapping')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </SettingItem>
        {values.enhancedMode === 'fake-ip' && (
          <>
            <SettingItem title={t('pages.dns.fakeIPRangeIPv4')} divider>
              <Tooltip open={!!fakeIPRangeError}>
                <TooltipTrigger asChild>
                  <Input
                    className={
                      `h-8 w-[40%] ` +
                      (fakeIPRangeError ? 'border-red-500 ring-1 ring-red-500 rounded-lg' : '')
                    }
                    placeholder={t('pages.dns.placeholderExample') + ': 198.18.0.1/16'}
                    value={values.fakeIPRange}
                    onChange={(event) => {
                      const v = event.target.value
                      setValues({ ...values, fakeIPRange: v })
                      const r = isValidIPv4Cidr(v)
                      setFakeIPRangeError(r.ok ? null : (r.error ?? t('common.formatError')))
                    }}
                  />
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  sideOffset={15}
                  className="bg-destructive text-destructive-foreground"
                >
                  {fakeIPRangeError ?? t('common.formatError')}
                </TooltipContent>
              </Tooltip>
            </SettingItem>
            {values.ipv6 && (
              <SettingItem title={t('pages.dns.fakeIPRangeIPv6')} divider>
                <Tooltip open={!!fakeIPRange6Error}>
                  <TooltipTrigger asChild>
                    <Input
                      className={
                        `h-8 w-[40%] ` +
                        (fakeIPRange6Error ? 'border-red-500 ring-1 ring-red-500 rounded-lg' : '')
                      }
                      placeholder={t('pages.dns.placeholderExample') + ': fc00::/18'}
                      value={values.fakeIPRange6}
                      onChange={(event) => {
                        const v = event.target.value
                        setValues({ ...values, fakeIPRange6: v })
                        const r = isValidIPv6Cidr(v)
                        setFakeIPRange6Error(r.ok ? null : (r.error ?? t('common.formatError')))
                      }}
                    />
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    sideOffset={10}
                    className="bg-destructive text-destructive-foreground"
                  >
                    {fakeIPRange6Error ?? t('common.formatError')}
                  </TooltipContent>
                </Tooltip>
              </SettingItem>
            )}
            <EditableList
              title={t('pages.dns.fakeIPFilter')}
              items={values.fakeIPFilter}
              validate={(part) => isValidDomainWildcard(part as string)}
              onChange={(list) => {
                const arr = list as string[]
                setValues({ ...values, fakeIPFilter: arr })
                const firstInvalid = arr.find((f) => !isValidDomainWildcard(f).ok)
                setFakeIPFilterError(
                  firstInvalid ? (isValidDomainWildcard(firstInvalid).error ?? t('common.formatError')) : null
                )
              }}
              placeholder={t('pages.dns.placeholderLan')}
            />
          </>
        )}
        <EditableList
          title={t('pages.dns.baseServer')}
          items={values.defaultNameserver}
          validate={(part) => isValidDnsServer(part as string, true)}
          onChange={(list) => {
            const arr = list as string[]
            setValues({ ...values, defaultNameserver: arr })
            const firstInvalid = arr.find((f) => !isValidDnsServer(f, true).ok)
            setDefaultNameserverError(
              firstInvalid ? (isValidDnsServer(firstInvalid, true).error ?? t('common.formatError')) : null
            )
          }}
          placeholder={t('pages.dns.placeholderDNS')}
        />
        <EditableList
          title={t('pages.dns.defaultResolver')}
          items={values.nameserver}
          validate={(part) => isValidDnsServer(part as string)}
          onChange={(list) => {
            const arr = list as string[]
            setValues({ ...values, nameserver: arr })
            const firstInvalid = arr.find((f) => !isValidDnsServer(f).ok)
            setNameserverError(
              firstInvalid ? (isValidDnsServer(firstInvalid).error ?? t('common.formatError')) : null
            )
          }}
          placeholder={t('pages.dns.placeholderTLS')}
          divider={false}
        />
      </SettingCard>
      <AdvancedDnsSetting
        respectRules={values.respectRules}
        directNameserver={values.directNameserver}
        proxyServerNameserver={values.proxyServerNameserver}
        nameserverPolicy={values.nameserverPolicy}
        hosts={values.hosts}
        useHosts={values.useHosts}
        useSystemHosts={values.useSystemHosts}
        onRespectRulesChange={(v) => {
          setValues({
            ...values,
            respectRules: values.proxyServerNameserver.length === 0 ? false : v
          })
        }}
        onDirectNameserverChange={(arr) => {
          setValues({ ...values, directNameserver: arr })
        }}
        onProxyNameserverChange={(arr) => {
          setValues({
            ...values,
            proxyServerNameserver: arr,
            respectRules: arr.length === 0 ? false : values.respectRules
          })
        }}
        onNameserverPolicyChange={(newValue) => {
          setValues({ ...values, nameserverPolicy: newValue })
        }}
        onUseSystemHostsChange={(v) => setValues({ ...values, useSystemHosts: v })}
        onUseHostsChange={(v) => setValues({ ...values, useHosts: v })}
        onHostsChange={(hostArr) => setValues({ ...values, hosts: hostArr })}
        onErrorChange={setAdvancedDnsError}
      />
    </BasePage>
  )
}

export default DNS
