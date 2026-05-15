import { toast } from 'sonner'
import SettingCard from '@renderer/components/base/base-setting-card'
import SettingItem from '@renderer/components/base/base-setting-item'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Switch } from '@renderer/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { mihomoUpgradeGeo } from '@renderer/utils/ipc'
import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCcw } from 'lucide-react'

const defaultGeoxUrl = {
  geoip: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip-lite.dat',
  geosite: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat',
  mmdb: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.metadb',
  asn: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/GeoLite2-ASN.mmdb'
}

const GeoData: React.FC = () => {
  const { t } = useTranslation()
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const {
    'geox-url': geoxUrlRaw,
    'geodata-mode': geoMode = false,
    'geo-auto-update': geoAutoUpdate = false,
    'geo-update-interval': geoUpdateInterval = 24
  } = controledMihomoConfig || {}

  const geoxUrl = useMemo(() => ({ ...defaultGeoxUrl, ...geoxUrlRaw }), [geoxUrlRaw])

  const [geoipInput, setGeoIpInput] = useState(geoxUrl.geoip)
  const [geositeInput, setGeositeInput] = useState(geoxUrl.geosite)
  const [mmdbInput, setMmdbInput] = useState(geoxUrl.mmdb)
  const [asnInput, setAsnInput] = useState(geoxUrl.asn)
  const [intervalInput, setIntervalInput] = useState((geoUpdateInterval ?? 24).toString())
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    setGeoIpInput(geoxUrl.geoip)
    setGeositeInput(geoxUrl.geosite)
    setMmdbInput(geoxUrl.mmdb)
    setAsnInput(geoxUrl.asn)
  }, [geoxUrl])

  useEffect(() => {
    setIntervalInput((geoUpdateInterval ?? 24).toString())
  }, [geoUpdateInterval])

  return (
    <SettingCard>
      <SettingItem title={t('resources.geoipDatabase')} divider>
        <div className="flex w-[70%]">
          {geoipInput !== geoxUrl.geoip && (
            <Button
              size="sm"
              className="mr-2"
              onClick={() => {
                patchControledMihomoConfig({ 'geox-url': { ...geoxUrl, geoip: geoipInput } })
              }}
            >
              {t('common.confirm')}
            </Button>
          )}
          <Input
            className="h-8"
            value={geoipInput}
            onChange={(event) => setGeoIpInput(event.target.value)}
          />
        </div>
      </SettingItem>
      <SettingItem title={t('resources.geositeDatabase')} divider>
        <div className="flex w-[70%]">
          {geositeInput !== geoxUrl.geosite && (
            <Button
              size="sm"
              className="mr-2"
              onClick={() => {
                patchControledMihomoConfig({ 'geox-url': { ...geoxUrl, geosite: geositeInput } })
              }}
            >
              {t('common.confirm')}
            </Button>
          )}
          <Input
            className="h-8"
            value={geositeInput}
            onChange={(event) => setGeositeInput(event.target.value)}
          />
        </div>
      </SettingItem>
      <SettingItem title={t('resources.mmdbDatabase')} divider>
        <div className="flex w-[70%]">
          {mmdbInput !== geoxUrl.mmdb && (
            <Button
              size="sm"
              className="mr-2"
              onClick={() => {
                patchControledMihomoConfig({ 'geox-url': { ...geoxUrl, mmdb: mmdbInput } })
              }}
            >
              {t('common.confirm')}
            </Button>
          )}
          <Input
            className="h-8"
            value={mmdbInput}
            onChange={(event) => setMmdbInput(event.target.value)}
          />
        </div>
      </SettingItem>
      <SettingItem title={t('resources.asnDatabase')} divider>
        <div className="flex w-[70%]">
          {asnInput !== geoxUrl.asn && (
            <Button
              size="sm"
              className="mr-2"
              onClick={() => {
                patchControledMihomoConfig({ 'geox-url': { ...geoxUrl, asn: asnInput } })
              }}
            >
              {t('common.confirm')}
            </Button>
          )}
          <Input
            className="h-8"
            value={asnInput}
            onChange={(event) => setAsnInput(event.target.value)}
          />
        </div>
      </SettingItem>
      <SettingItem title={t('resources.geoipDataMode')} divider>
        <Tabs
          value={geoMode ? 'dat' : 'db'}
          onValueChange={(value) => {
            patchControledMihomoConfig({ 'geodata-mode': value === 'dat' })
          }}
        >
          <TabsList>
            <TabsTrigger value="db">db</TabsTrigger>
            <TabsTrigger value="dat">dat</TabsTrigger>
          </TabsList>
        </Tabs>
      </SettingItem>
      <SettingItem
        title={t('resources.autoUpdateGeoData')}
        actions={
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={async () => {
              setUpdating(true)
              try {
                await mihomoUpgradeGeo()
                new Notification(t('resources.geoUpdateSuccess'))
              } catch (e) {
                toast.error(`${e}`)
              } finally {
                setUpdating(false)
              }
            }}
          >
            <RefreshCcw className={`text-lg ${updating ? 'animate-spin' : ''}`} />
          </Button>
        }
        divider={geoAutoUpdate}
      >
        <Switch
          checked={geoAutoUpdate}
          onCheckedChange={(value) => {
            patchControledMihomoConfig({ 'geo-auto-update': value })
          }}
        />
      </SettingItem>
      {geoAutoUpdate && (
        <SettingItem title={t('resources.updateInterval')}>
          <Input
            type="number"
            className="w-25 h-8"
            value={intervalInput}
            onChange={(event) => setIntervalInput(event.target.value)}
            onBlur={() => {
              const val = parseInt(intervalInput)
              if (!isNaN(val) && val > 0) {
                patchControledMihomoConfig({ 'geo-update-interval': val })
              } else {
                setIntervalInput((geoUpdateInterval ?? 24).toString())
              }
            }}
          />
        </SettingItem>
      )}
    </SettingCard>
  )
}

export default GeoData
