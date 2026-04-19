import { toast } from 'sonner'
import BasePage from '@renderer/components/base/base-page'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { useGroups } from '@renderer/hooks/use-groups'
import { restartCore, triggerSysProxy, updateTrayIcon } from '@renderer/utils/ipc'
import NumberFlow from '@number-flow/react'
import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import Power from '@renderer/assets/on_icon.svg'
import Pause from '@renderer/assets/pause_icon.svg'
import { InfinityIcon, WifiOff, PlusCircle, ChevronRight, Globe, ArrowUp, ArrowDown, RefreshCcw } from 'lucide-react'
import { SiTelegram } from 'react-icons/si'
import EditInfoModal from '@renderer/components/profiles/edit-info-modal'
import { Spinner } from '@renderer/components/ui/spinner'
import { CharacterMorph } from '@renderer/components/ui/character-morph'
import { calcTraffic } from '@renderer/utils/calc'

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`
}

// Module-level variable: persists across component mounts/unmounts
let connectionStartTime: number | null = null

const Home: React.FC = () => {
  const { t } = useTranslation()
  const { appConfig, patchAppConfig } = useAppConfig()
  const {
    mainSwitchMode = 'tun',
    sysProxy,
    onlyActiveDevice = false,
  } = appConfig || {}
  const { enable: sysProxyEnable, mode } = sysProxy || {}
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const { tun } = controledMihomoConfig || {}
  const { 'mixed-port': mixedPort } = controledMihomoConfig || {}
  const sysProxyDisabled = mixedPort == 0

  const { profileConfig, addProfileItem } = useProfileConfig()
  const { groups } = useGroups()
  const navigate = useNavigate()
  const hasProfiles = (profileConfig?.items?.length ?? 0) > 0
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingItem, setEditingItem] = useState<ProfileItem | null>(null)
  const [updating, setUpdating] = useState(false)

  const handleAddProfile = (): void => {
    const newProfile: ProfileItem = {
      id: '',
      name: '',
      type: 'remote',
      url: '',
      useProxy: false,
      autoUpdate: true
    }
    setEditingItem(newProfile)
    setShowEditModal(true)
  }

  const [connectionsInfo, setConnectionsInfo] = useState<ControllerConnections>()

  useEffect(() => {
    const handleConnections = (_e: unknown, info: ControllerConnections): void => {
      setConnectionsInfo((prev) => {
        if (
          prev &&
          prev.uploadTotal === info.uploadTotal &&
          prev.downloadTotal === info.downloadTotal
        ) {
          return prev
        }
        return {
          uploadTotal: info.uploadTotal,
          downloadTotal: info.downloadTotal,
          memory: info.memory
        }
      })
    }
    window.electron.ipcRenderer.on('mihomoConnections', handleConnections)
    return (): void => {
      window.electron.ipcRenderer.removeListener('mihomoConnections', handleConnections)
    }
  }, [])

  const [loading, setLoading] = useState(false)
  const [loadingDirection, setLoadingDirection] = useState<'connecting' | 'disconnecting'>(
    'connecting'
  )

  const [elapsed, setElapsed] = useState(() => {
    if (connectionStartTime !== null) {
      return Math.floor((Date.now() - connectionStartTime) / 1000)
    }
    return 0
  })

  const isSelected = (tun?.enable ?? false) || (sysProxyEnable ?? false)

  useEffect(() => {
    if (isSelected) {
      if (connectionStartTime === null) {
        connectionStartTime = Date.now()
      }
      setElapsed(Math.floor((Date.now() - connectionStartTime) / 1000))
      const interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - connectionStartTime!) / 1000))
      }, 1000)
      return () => clearInterval(interval)
    } else {
      connectionStartTime = null
      setElapsed(0)
      return undefined
    }
  }, [isSelected])

  const isDisabled =
    loading || (mainSwitchMode === 'sysproxy' && mode == 'manual' && sysProxyDisabled)

  const status = loading
    ? loadingDirection === 'connecting'
      ? t('pages.home.connecting')
      : t('pages.home.disconnecting')
    : isSelected
      ? t('pages.home.connected')
      : t('pages.home.disconnected')
  const statusWidthTexts = [
    t('pages.home.connecting'),
    t('pages.home.disconnecting'),
    t('pages.home.connected'),
    t('pages.home.disconnected')
  ]
  const showConnectedTimer = !loading && isSelected
  const elapsedHours = Math.floor(elapsed / 3600)
  const elapsedMinutes = Math.floor((elapsed % 3600) / 60)
  const elapsedSeconds = elapsed % 60

  // Current profile & subscription
  const currentProfile = useMemo(() => {
    if (!profileConfig?.current || !profileConfig?.items) return null
    return profileConfig.items.find((item) => item.id === profileConfig.current) ?? null
  }, [profileConfig])

  const handleUpdateProfile = async (): Promise<void> => {
    if (!currentProfile || updating) return
    setUpdating(true)
    try {
      await addProfileItem(currentProfile)
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setUpdating(false)
    }
  }

  const subscription = currentProfile?.extra
  const trafficUsed = (subscription?.upload ?? 0) + (subscription?.download ?? 0)
  const trafficTotal = subscription?.total ?? 0
  const trafficRemaining = trafficTotal > 0 ? trafficTotal - trafficUsed : 0
  const expireTimestamp = subscription?.expire ?? 0
  const expireDate = expireTimestamp > 0 ? dayjs.unix(expireTimestamp).format('L') : t('pages.home.never')
  const daysRemaining =
    expireTimestamp > 0 ? Math.max(0, dayjs.unix(expireTimestamp).diff(dayjs(), 'day')) : 0

  const firstGroup = groups?.[0]
  const supportUrl = currentProfile?.supportUrl
  const supportLinkInfo = useMemo(() => {
    if (!supportUrl) return null
    try {
      const parsed = new URL(supportUrl)
      const normalized = `${parsed.hostname}${parsed.pathname}`.toLowerCase()
      return {
        href: parsed.toString(),
        isTelegram:
          parsed.protocol === 'tg:' || normalized.includes('t.me') || normalized.includes('telegram')
      }
    } catch {
      return null
    }
  }, [supportUrl])

  const onValueChange = async (enable: boolean): Promise<void> => {
    setLoading(true)
    setLoadingDirection(enable ? 'connecting' : 'disconnecting')
    try {
      if (enable) {
        if (mainSwitchMode === 'tun') {
          await patchControledMihomoConfig({ tun: { enable: true }, dns: { enable: true } })
          await restartCore()
        } else {
          if (mode == 'manual' && sysProxyDisabled) return
          await patchAppConfig({ sysProxy: { enable: true } })
          await restartCore()
          await triggerSysProxy(true, onlyActiveDevice)
        }
      } else {
        const tunWasEnabled = tun?.enable ?? false
        const sysProxyWasEnabled = sysProxyEnable ?? false
        if (tunWasEnabled) {
          await patchControledMihomoConfig({ tun: { enable: false } })
        }
        if (sysProxyWasEnabled) {
          await triggerSysProxy(false, onlyActiveDevice)
          await patchAppConfig({ sysProxy: { enable: false } })
        }
        if (tunWasEnabled || sysProxyWasEnabled) {
          await restartCore()
        }
      }
      window.electron.ipcRenderer.send('updateFloatingWindow')
      window.electron.ipcRenderer.send('updateTrayMenu')
      await updateTrayIcon()
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <BasePage>
      {!hasProfiles ? (
        <div className="h-full w-full flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 max-w-75 rounded-2xl border border-stroke bg-card/50 backdrop-blur-xl p-8">
            <WifiOff className="size-16 text-muted-foreground" />
            <h2 className="text-xl font-bold text-foreground">{t('pages.profiles.emptyTitle')}</h2>
            <p className="text-sm font-medium text-muted-foreground text-center">
              {t('pages.profiles.emptyDescription')}
            </p>
            <button
              onClick={handleAddProfile}
              data-guide="home-add-profile-btn"
              className="flex items-center gap-2 rounded-xl border border-stroke bg-gradient-start-power-on/50 backdrop-blur-xl px-6 py-3 text-foreground hover:bg-gradient-start-power-on/40 transition-colors"
            >
              <PlusCircle className="size-5" />
              <span className="text-sm font-medium">{t('pages.profiles.addProfile')}</span>
            </button>
          </div>
          {showEditModal && editingItem && (
            <EditInfoModal
              item={editingItem}
              isCurrent={false}
              updateProfileItem={async (item: ProfileItem) => {
                await addProfileItem(item)
                setShowEditModal(false)
                setEditingItem(null)
              }}
              onClose={() => {
                setShowEditModal(false)
                setEditingItem(null)
              }}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-col h-full px-2 pb-2 gap-3">
          {/* Profile card */}
          {currentProfile && (
            <div className="rounded-2xl border border-stroke bg-card/50 backdrop-blur-xl p-4">
              <div
                data-guide="home-profile-header"
                className="flex items-center justify-center gap-3"
              >
                {currentProfile.logo && (
                  <img
                    src={currentProfile.logo}
                    alt=""
                    className="w-10 h-10 rounded-full"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                )}
                <span className="font-medium text-base">{currentProfile.name}</span>
                {currentProfile.type === 'remote' && (
                  <button
                    onClick={handleUpdateProfile}
                    disabled={updating}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCcw className={`size-4 ${updating ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>
              {currentProfile.announce && (
                <div
                  data-guide="home-profile-announce"
                  className="text-sm font-medium text-center mt-2"
                >
                  {currentProfile.announce}
                </div>
              )}
            </div>
          )}
          {/* Subscription info */}
          {subscription && (
            <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center rounded-2xl border border-stroke bg-card/50 backdrop-blur-xl p-1">
              <div className="flex flex-col items-center py-2 px-1">
                <span className="text-sm text-foreground">{t('pages.home.trafficRemaining')}</span>
                <span className="font-bold text-base mt-0.5">
                  {trafficTotal > 0 ? formatBytes(trafficRemaining) : <InfinityIcon />}
                </span>
              </div>
              <div className="h-8 w-px bg-stroke" />
              <div className="flex flex-col items-center py-2 px-1">
                <span className="text-sm text-foreground">{t('pages.home.daysRemaining')}</span>
                <span className="text-base font-bold mt-0.5">
                  {expireTimestamp > 0 ? daysRemaining : <InfinityIcon />}
                </span>
              </div>
              <div className="h-8 w-px bg-stroke" />
              <div className="flex flex-col items-center py-2 px-1">
                <span className="text-sm text-foreground">{t('pages.home.expires')}</span>
                <span className="text-base font-bold mt-0.5">{expireDate}</span>
              </div>
            </div>
          )}

          {/* Connection button */}
          <div className="flex flex-col grow-3 items-center justify-center min-h-0">
            <div className="mb-3 flex h-6 items-center justify-center">
              <CharacterMorph
                texts={[status]}
                reserveTexts={statusWidthTexts}
                interval={3000}
                className="h-6 leading-none text-foreground font-semibold uppercase"
              />
            </div>
            <button
              disabled={isDisabled}
              onClick={() => onValueChange(!isSelected)}
              data-guide="home-power-toggle"
              className="relative group transition-transform active:scale-95 cursor-pointer"
            >
              <div
                className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 bg-radial-[at_30%_45%] backdrop-blur-xl border-2 ${
                  isSelected
                    ? 'from-gradient-start-power-on/60 to-gradient-end-power-on/60 border-stroke-power-on'
                    : 'from-gradient-start-power-off/50 to-gradient-end-power-off/50 border-stroke-power-off'
                } ${loading ? 'animate-none' : ''}`}
              >
                <div className="relative size-16">
                  <Spinner
                    className={`absolute inset-0 m-auto size-16 text-[#FAFAFA] transition-all duration-300 ease-out ${
                      loading ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
                    }`}
                  />
                  <img
                    src={Pause}
                    alt=""
                    className={`absolute inset-0 size-16 fill-foreground transition-all duration-300 ease-out ${
                      !loading && isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
                    }`}
                  />
                  <img
                    src={Power}
                    alt=""
                    className={`absolute inset-0 size-16 fill-foreground transition-all duration-300 ease-out ${
                      !loading && !isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
                    }`}
                  />
                </div>
              </div>
            </button>
            <div className="mt-3 h-8 flex items-center justify-center">
              <div
                aria-hidden={!showConnectedTimer}
                className={`inline-flex items-center gap-0.5 text-base font-bold text-foreground tabular-nums transition-all duration-300 ease-out ${
                  showConnectedTimer ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
                }`}
              >
                <NumberFlow
                  value={elapsedHours}
                  format={{ minimumIntegerDigits: 2, useGrouping: false }}
                />
                <span>:</span>
                <NumberFlow
                  value={elapsedMinutes}
                  format={{ minimumIntegerDigits: 2, useGrouping: false }}
                />
                <span>:</span>
                <NumberFlow
                  value={elapsedSeconds}
                  format={{ minimumIntegerDigits: 2, useGrouping: false }}
                />
              </div>
            </div>
            <div
              aria-hidden={!showConnectedTimer}
              className={`mt-2 flex items-center gap-4 tabular-nums transition-all duration-300 ease-out ${
                showConnectedTimer ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'
              }`}
            >
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <ArrowUp className="size-3.5 text-stroke-power-on" />
                <span>{calcTraffic(connectionsInfo?.uploadTotal ?? 0)}</span>
              </div>
              <div className="h-3 w-px bg-stroke" />
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <ArrowDown className="size-3.5 text-stroke-power-on" />
                <span>{calcTraffic(connectionsInfo?.downloadTotal ?? 0)}</span>
              </div>
            </div>
          </div>

          {/* Group & Proxy selectors */}
          {firstGroup && (
            <div className="flag-emoji flex flex-col items-center mx-auto w-full max-w-3xs max-h-16">
              <div
                data-guide="home-group-selector"
                className="w-full cursor-pointer"
                onClick={() => navigate('/proxies', { state: { fromHome: true } })}
              >
                <div className="flex items-center justify-between h-9 rounded-2xl border border-stroke pl-3 pr-1 py-3 backdrop-blur-xl bg-card/50 transition-colors hover:bg-card/70">
                  <div className="flag-emoji text-sm truncate max-w-52">
                    {firstGroup.now || firstGroup.name}
                  </div>
                  <ChevronRight />
                </div>
              </div>
            </div>
          )}
          {supportLinkInfo && (
            <div className="flex justify-center text-sm text-muted-foreground">
              <button
                data-guide="home-support-link"
                type="button"
                onClick={() => open(supportLinkInfo.href)}
                className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer"
              >
                {supportLinkInfo.isTelegram ? (
                  <SiTelegram className="size-4" />
                ) : (
                  <Globe className="size-4" />
                )}
                <span>{t('pages.profiles.support')}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </BasePage>
  )
}

export default Home
