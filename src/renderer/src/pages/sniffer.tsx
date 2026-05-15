import { toast } from 'sonner'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Switch } from '@renderer/components/ui/switch'
import BasePage from '@renderer/components/base/base-page'
import SettingCard from '@renderer/components/base/base-setting-card'
import SettingItem from '@renderer/components/base/base-setting-item'
import EditableList from '@renderer/components/base/base-list-editor'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

const Sniffer: React.FC = () => {
  const { t } = useTranslation()
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const { sniffer } = controledMihomoConfig || {}
  const {
    'parse-pure-ip': parsePureIP = true,
    'force-dns-mapping': forceDNSMapping = true,
    'override-destination': overrideDestination = false,
    sniff = {
      HTTP: { ports: [80, 443], 'override-destination': false },
      TLS: { ports: [443] },
      QUIC: { ports: [] }
    },
    'skip-domain': skipDomain = ['+.push.apple.com'],
    'force-domain': forceDomain = [],
    'skip-dst-address': skipDstAddress = [
      '91.105.192.0/23',
      '91.108.4.0/22',
      '91.108.8.0/21',
      '91.108.16.0/21',
      '91.108.56.0/22',
      '95.161.64.0/20',
      '149.154.160.0/20',
      '185.76.151.0/24',
      '2001:67c:4e8::/48',
      '2001:b28:f23c::/47',
      '2001:b28:f23f::/48',
      '2a0a:f280:203::/48'
    ],
    'skip-src-address': skipSrcAddress = []
  } = sniffer || {}
  const [changed, setChanged] = useState(false)
  const [values, originSetValues] = useState({
    parsePureIP,
    forceDNSMapping,
    overrideDestination,
    sniff,
    skipDomain,
    forceDomain,
    skipDstAddress,
    skipSrcAddress
  })
  const setValues = (v: typeof values): void => {
    originSetValues(v)
    setChanged(true)
  }

  const onSave = async (patch: Partial<MihomoConfig>): Promise<void> => {
    try {
      setChanged(false)
      await patchControledMihomoConfig(patch)
    } catch (e) {
      toast.error(`${e}`)
    }
  }

  const handleSniffPortChange = (protocol: keyof typeof sniff, value: string): void => {
    setValues({
      ...values,
      sniff: {
        ...values.sniff,
        [protocol]: {
          ...values.sniff[protocol],
          ports: value.split(',').map((port) => port.trim())
        }
      }
    })
  }

  return (
    <BasePage
      title={t('pages.sniffer.title')}
      header={
        changed && (
          <Button
            size="sm"
            className="app-nodrag"
            onClick={() =>
              onSave({
                sniffer: {
                  'parse-pure-ip': values.parsePureIP,
                  'force-dns-mapping': values.forceDNSMapping,
                  'override-destination': values.overrideDestination,
                  sniff: values.sniff,
                  'skip-domain': values.skipDomain,
                  'force-domain': values.forceDomain
                }
              })
            }
          >
            {t('common.save')}
          </Button>
        )
      }
    >
      <SettingCard>
        <SettingItem title={t('pages.sniffer.overrideConnectionAddress')} divider>
          <Switch
            checked={values.overrideDestination}
            onCheckedChange={(value) => {
              setValues({
                ...values,
                overrideDestination: value,
                sniff: {
                  ...values.sniff,
                  HTTP: {
                    ...values.sniff.HTTP,
                    'override-destination': value,
                    ports: values.sniff.HTTP?.ports || [80, 443]
                  }
                }
              })
            }}
          />
        </SettingItem>
        <SettingItem title={t('pages.sniffer.sniffRealIPMapping')} divider>
          <Switch
            checked={values.forceDNSMapping}
            onCheckedChange={(value) => {
              setValues({ ...values, forceDNSMapping: value })
            }}
          />
        </SettingItem>
        <SettingItem title={t('pages.sniffer.sniffUnmappedIP')} divider>
          <Switch
            checked={values.parsePureIP}
            onCheckedChange={(value) => {
              setValues({ ...values, parsePureIP: value })
            }}
          />
        </SettingItem>
        <SettingItem title={t('pages.sniffer.httpPortSniffer')} divider>
          <Input
            className="w-[50%]"
            placeholder={t('pages.sniffer.portPlaceholder')}
            value={values.sniff.HTTP?.ports.join(',')}
            onChange={(event) => handleSniffPortChange('HTTP', event.target.value)}
          />
        </SettingItem>
        <SettingItem title={t('pages.sniffer.tlsPortSniffer')} divider>
          <Input
            className="w-[50%]"
            placeholder={t('pages.sniffer.portPlaceholder')}
            value={values.sniff.TLS?.ports.join(',')}
            onChange={(event) => handleSniffPortChange('TLS', event.target.value)}
          />
        </SettingItem>
        <SettingItem title={t('pages.sniffer.quicPortSniffer')} divider>
          <Input
            className="w-[50%]"
            placeholder={t('pages.sniffer.portPlaceholder')}
            value={values.sniff.QUIC?.ports.join(',')}
            onChange={(event) => handleSniffPortChange('QUIC', event.target.value)}
          />
        </SettingItem>
        <EditableList
          title={t('pages.sniffer.skipDomainSniffing')}
          items={values.skipDomain}
          onChange={(list) => setValues({ ...values, skipDomain: list as string[] })}
          placeholder={t('pages.sniffer.examplePush')}
        />
        <EditableList
          title={t('pages.sniffer.forceDomainSniffing')}
          items={values.forceDomain}
          onChange={(list) => setValues({ ...values, forceDomain: list as string[] })}
          placeholder={t('pages.sniffer.exampleDomain')}
        />
        <EditableList
          title={t('pages.sniffer.skipDestAddressSniffing')}
          items={values.skipDstAddress}
          onChange={(list) => setValues({ ...values, skipDstAddress: list as string[] })}
          placeholder={t('pages.sniffer.exampleCIDR')}
        />
        <EditableList
          title={t('pages.sniffer.skipSourceAddressSniffing')}
          items={values.skipSrcAddress}
          onChange={(list) => setValues({ ...values, skipSrcAddress: list as string[] })}
          placeholder={t('pages.sniffer.exampleCIDR')}
          divider={false}
        />
      </SettingCard>
    </BasePage>
  )
}

export default Sniffer
