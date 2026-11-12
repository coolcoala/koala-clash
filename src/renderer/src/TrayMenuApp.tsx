import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { useTranslation } from 'react-i18next'
import { useTheme } from 'next-themes'
import { Accordion as AccordionPrimitive } from 'radix-ui'
import {
  AppWindow,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Gauge,
  Globe,
  LogOut,
  Route,
  Zap
} from 'lucide-react'
import { useGroups } from './hooks/use-groups'
import { useAppConfig } from './hooks/use-app-config'
import { useControledMihomoConfig } from './hooks/use-controled-mihomo-config'
import { calcTraffic } from './utils/calc'
import {
  changeCurrentProfile,
  getCoreState,
  getProfileConfig,
  mihomoChangeProxy,
  mihomoCloseAllConnections,
  mihomoGroupDelay,
  mihomoProxyDelay,
  notDialogQuit,
  onIpc,
  patchMihomoConfig,
  showMainWindow
} from './utils/ipc'
import { delayColorClass, resolvePingDisplay } from './utils/ping-display'
import { isConnectionOn, isConnectionSwitchBlocked, setConnectionEnabled } from './utils/connection'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'
import { Spinner } from '@renderer/components/ui/spinner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import DelayDot from '@renderer/components/base/delay-dot'
import { groupTypeColor, groupTypeIcon } from '@renderer/components/proxies/group-type'
import mapDark from '@renderer/assets/map_darktheme.svg'
import mapLight from '@renderer/assets/map_lighttheme.svg'
import Power from '@renderer/assets/on_icon.svg'
import Pause from '@renderer/assets/pause_icon.svg'

interface TrafficData {
  up: number
  down: number
}

type ProxyEntry = ControllerProxiesDetail | ControllerGroupDetail

function withoutItem(set: ReadonlySet<string>, item: string): ReadonlySet<string> {
  const next = new Set(set)
  next.delete(item)
  return next
}

function lastDelay(proxy?: ProxyEntry): number | undefined {
  if (!proxy?.history?.length) return undefined
  return proxy.history[proxy.history.length - 1].delay
}

const closeMenu = (): void => window.electron.ipcRenderer.send('customTray:close')

const TrayMenuApp: React.FC = () => {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const { groups = [], mutate: mutateGroups } = useGroups()
  const { appConfig, patchAppConfig } = useAppConfig()
  const { controledMihomoConfig, patchControledMihomoConfig, mutateControledMihomoConfig } =
    useControledMihomoConfig()
  const { autoCloseConnection = true } = appConfig || {}
  const { mode } = controledMihomoConfig || {}

  // This window has neither the profile provider nor the core lifecycle store of the main one;
  // SWR fetches both again every time the menu is shown and gets focus
  const { data: profileConfig, mutate: mutateProfileConfig } = useSWR('getProfileConfig', () =>
    getProfileConfig()
  )
  const { data: coreState } = useSWR('getCoreState', () => getCoreState())

  const profiles = profileConfig?.items ?? []
  const currentProfile = profiles.find((i) => i.id === profileConfig?.current)
  const globalModeAllowed = currentProfile?.globalMode !== false
  const pingDisplay = resolvePingDisplay(appConfig, profileConfig)

  const coreProblem = coreState?.status === 'error'
  const connected = !coreProblem && isConnectionOn(appConfig, controledMihomoConfig)
  const switchBlocked = !coreProblem && isConnectionSwitchBlocked(appConfig, controledMihomoConfig)
  const [switching, setSwitching] = useState<'connecting' | 'disconnecting' | null>(null)
  const [pendingProfile, setPendingProfile] = useState<string | null>(null)
  const [testingGroups, setTestingGroups] = useState<ReadonlySet<string>>(new Set())
  const [testingProxies, setTestingProxies] = useState<ReadonlySet<string>>(new Set())
  const [traffic, setTraffic] = useState<TrafficData>({ up: 0, down: 0 })

  useEffect(() => onIpc<[TrafficData]>('mihomoTraffic', setTraffic), [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      // An open dropdown takes Escape for itself
      if (e.key !== 'Escape' || document.querySelector('[data-slot="select-content"]')) return
      closeMenu()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // The menu opens with only the panel itself focused, which draws nothing and makes Tab start from
  // the first control. Left alone, the power button got a focus ring on opening, as if Tab had been
  // pressed: when the window becomes key, Chromium on macOS moves focus to the first control by
  // itself, a moment after the window's focus event. Hidden between uses, the window would also
  // give focus back to the last control used.
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return undefined
    // How long after the window becomes active a focus change nobody asked for is still that
    const ACTIVATION_FOCUS_MS = 250
    let activatedAt = -Infinity
    let userActed = false
    const focusPanel = (): void => panel.focus({ preventScroll: true })
    const onWindowFocus = (): void => {
      activatedAt = performance.now()
      userActed = false
      focusPanel()
    }
    const onUserInput = (): void => {
      userActed = true
    }
    const onFocusIn = (e: FocusEvent): void => {
      if (e.target === panel || userActed) return
      if (performance.now() - activatedAt < ACTIVATION_FOCUS_MS) focusPanel()
    }
    window.addEventListener('focus', onWindowFocus)
    window.addEventListener('blur', focusPanel)
    window.addEventListener('keydown', onUserInput, true)
    window.addEventListener('pointerdown', onUserInput, true)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      window.removeEventListener('focus', onWindowFocus)
      window.removeEventListener('blur', focusPanel)
      window.removeEventListener('keydown', onUserInput, true)
      window.removeEventListener('pointerdown', onUserInput, true)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [])

  const openMainWindow = async (): Promise<void> => {
    await showMainWindow()
    closeMenu()
  }

  const onToggleConnection = async (): Promise<void> => {
    // The main window explains what is wrong with the core and how to fix it
    if (coreProblem) {
      await openMainWindow()
      return
    }
    const enable = !connected
    setSwitching(enable ? 'connecting' : 'disconnecting')
    try {
      await setConnectionEnabled(enable, {
        appConfig,
        controledMihomoConfig,
        patchAppConfig,
        patchControledMihomoConfig
      })
    } catch {
      // the state below is re-read either way
    } finally {
      mutateControledMihomoConfig()
      setSwitching(null)
    }
  }

  const onChangeMode = async (next: OutboundMode): Promise<void> => {
    if (next === mode) return
    await patchControledMihomoConfig({ mode: next })
    await patchMihomoConfig({ mode: next })
    if (autoCloseConnection) {
      await mihomoCloseAllConnections()
    }
    mutateGroups()
  }

  const onChangeProfile = async (id: string): Promise<void> => {
    if (id === profileConfig?.current) return
    // The picked name shows right away, and stays until the new config arrives
    setPendingProfile(id)
    try {
      await changeCurrentProfile(id)
    } catch {
      // the main window reports profile errors
    } finally {
      await mutateProfileConfig()
      mutateControledMihomoConfig()
      mutateGroups()
      setPendingProfile(null)
    }
  }

  const onSelectProxy = async (group: ControllerMixedGroup, proxyName: string): Promise<void> => {
    if (proxyName === group.now) return
    try {
      await mihomoChangeProxy(group.name, proxyName)
      if (autoCloseConnection) {
        await mihomoCloseAllConnections(group.name)
      }
    } catch {
      // ignore
    } finally {
      mutateGroups()
    }
  }

  const onGroupDelay = async (group: ControllerMixedGroup): Promise<void> => {
    setTestingGroups((prev) => new Set(prev).add(group.name))
    try {
      await mihomoGroupDelay(group.name, group.testUrl)
    } catch {
      // ignore
    } finally {
      // The spinners go away only once the new numbers are in, not a moment before
      await mutateGroups()
      setTestingGroups((prev) => withoutItem(prev, group.name))
    }
  }

  const onProxyDelay = async (group: ControllerMixedGroup, proxy: ProxyEntry): Promise<void> => {
    setTestingProxies((prev) => new Set(prev).add(proxy.name))
    try {
      const provider = 'provider-name' in proxy ? proxy['provider-name'] : undefined
      await mihomoProxyDelay(proxy.name, group.testUrl, provider)
    } catch {
      // ignore
    } finally {
      await mutateGroups()
      setTestingProxies((prev) => withoutItem(prev, proxy.name))
    }
  }

  const delayLabel = (delay: number | undefined): string | undefined => {
    if (delay === undefined || delay < 0) return undefined
    return delay === 0 ? t('proxies.timeout') : `${delay} ms`
  }

  // Drawn like the proxies page: a coloured number with a dash for a timeout, or the dot, and the
  // test icon for a node nobody has measured yet
  const delayContent = (delay: number | undefined): React.ReactNode => {
    if (delay === undefined || delay < 0) {
      return <Gauge className="size-3.5 text-muted-foreground/70" aria-hidden />
    }
    if (pingDisplay === 'indicator') {
      return <DelayDot delay={delay} className={delayColorClass(delay)} />
    }
    return (
      <span className={cn('text-xs font-medium tabular-nums', delayColorClass(delay))}>
        {delay === 0 ? '–' : delay}
      </span>
    )
  }

  const status = switching
    ? switching === 'connecting'
      ? t('pages.home.connecting')
      : t('pages.home.disconnecting')
    : coreProblem
      ? t('pages.home.coreProblem')
      : connected
        ? t('pages.home.connected')
        : t('pages.home.disconnected')

  const modes = [
    { value: 'rule' as const, icon: Route, label: t('sider.rules') },
    { value: 'global' as const, icon: Globe, label: t('common.global') }
  ]

  const emptyText =
    profiles.length === 0
      ? t('pages.profiles.emptyTitle')
      : mode === 'direct'
        ? t('sider.directMode')
        : t('common.noData')

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      className="relative isolate flex h-screen w-screen flex-col overflow-hidden rounded-xl border border-stroke bg-app-bg text-foreground outline-none"
    >
      <img
        src={resolvedTheme === 'light' ? mapLight : mapDark}
        alt=""
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover opacity-65 blur-3xl"
      />

      <div className="flex flex-col gap-2 p-2">
        <div className="flex items-center gap-3 rounded-xl border border-stroke bg-card/50 p-2.5 backdrop-blur-xl">
          <button
            type="button"
            onClick={onToggleConnection}
            disabled={switching !== null || switchBlocked}
            aria-pressed={connected}
            aria-label={status}
            className={cn(
              'flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 bg-radial-[at_30%_45%] transition-[transform,background-color,border-color] duration-300 active:scale-95 disabled:cursor-default disabled:opacity-60 disabled:active:scale-100 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              connected
                ? 'from-gradient-start-power-on/60 to-gradient-end-power-on/60 border-stroke-power-on'
                : 'from-gradient-start-power-off/50 to-gradient-end-power-off/50 border-stroke-power-off'
            )}
          >
            {switching ? (
              <Spinner className="size-5 text-[#FAFAFA]" />
            ) : (
              <img src={connected ? Pause : Power} alt="" className="size-5" />
            )}
          </button>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-sm leading-none font-semibold uppercase">{status}</span>
            <div className="flex items-center gap-3 text-xs leading-none tabular-nums text-muted-foreground">
              <span className="flex items-center gap-1">
                <ArrowUp className="size-3 text-gradient-end-power-on" aria-hidden />
                {calcTraffic(traffic.up)}/s
              </span>
              <span className="flex items-center gap-1">
                <ArrowDown className="size-3 text-gradient-end-power-on" aria-hidden />
                {calcTraffic(traffic.down)}/s
              </span>
            </div>
          </div>
        </div>

        {globalModeAllowed && mode && mode !== 'direct' && profiles.length > 0 && (
          <div
            role="radiogroup"
            className="flex items-center gap-1 rounded-lg border border-stroke bg-card/50 p-0.75 backdrop-blur-xl"
          >
            {modes.map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => onChangeMode(value)}
                className={cn(
                  'flex h-7 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  mode === value
                    ? 'border border-stroke-power-on/50 bg-gradient-to-br from-gradient-start-power-on/15 to-gradient-end-power-on/15 text-foreground shadow-sm'
                    : 'border border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden />
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {groups.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          <AccordionPrimitive.Root
            type="multiple"
            defaultValue={[groups[0].name]}
            className="flex flex-col gap-2"
          >
            {groups.map((group) => {
              const testing = testingGroups.has(group.name)
              const typeColor =
                groupTypeColor[group.type] || 'border-muted bg-muted text-muted-foreground'
              const currentDelay = lastDelay(group.all.find((p) => p.name === group.now))
              const currentLabel = delayLabel(currentDelay)
              return (
                <AccordionPrimitive.Item
                  key={group.name}
                  value={group.name}
                  className="overflow-hidden rounded-xl border border-stroke bg-card/50 backdrop-blur-xl"
                >
                  <AccordionPrimitive.Header className="relative flex">
                    {/* No radius of its own: the card clips the corners, so they always match the
                        border and the bottom stays square above the open list */}
                    <AccordionPrimitive.Trigger className="group/trigger flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 pr-2.5 pl-2 text-left transition-colors outline-none hover:bg-card/30 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset">
                      <span
                        className={cn(
                          'flex size-7 shrink-0 items-center justify-center rounded-md border [&_svg]:size-3.5',
                          typeColor
                        )}
                      >
                        {groupTypeIcon[group.type] || <Zap />}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flag-emoji truncate text-sm leading-tight font-semibold">
                          {group.name}
                        </span>
                        {/* The delay follows the current host it belongs to. Only a measured one:
                            the group test button is right there, a gauge icon would only confuse */}
                        <span className="flex min-w-0 items-center gap-1.5 text-xs leading-tight">
                          <span className="flag-emoji truncate text-muted-foreground">
                            {group.now}
                          </span>
                          {currentLabel && currentDelay !== undefined && (
                            <>
                              {/* Same hairline as between the traffic numbers on the home screen */}
                              <span
                                aria-hidden
                                className="h-3 w-px shrink-0 bg-muted-foreground/40"
                              />
                              <span
                                role="img"
                                aria-label={currentLabel}
                                title={currentLabel}
                                className="inline-flex shrink-0 items-center tabular-nums"
                              >
                                {/* A lone dash after the hairline says little, so a timeout is
                                    spelled out here */}
                                {pingDisplay === 'indicator' ? (
                                  delayContent(currentDelay)
                                ) : currentDelay === 0 ? (
                                  <span className="font-medium text-destructive">
                                    {currentLabel}
                                  </span>
                                ) : (
                                  <span
                                    className={cn('font-medium', delayColorClass(currentDelay))}
                                  >
                                    {currentDelay}
                                  </span>
                                )}
                              </span>
                            </>
                          )}
                        </span>
                      </span>
                      {/* room for the test button that sits over the trigger, see below */}
                      <span className="w-6 shrink-0" aria-hidden />
                      <ChevronDown
                        className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/trigger:rotate-180"
                        aria-hidden
                      />
                    </AccordionPrimitive.Trigger>
                    {/* A button may not sit inside the trigger button, so it is laid over it instead */}
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      disabled={testing}
                      aria-busy={testing}
                      aria-label={t('sider.delayTest')}
                      title={t('sider.delayTest')}
                      onClick={() => onGroupDelay(group)}
                      className="absolute top-1/2 right-9 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {testing ? <Spinner className="size-3.5" /> : <Gauge className="size-3.5" />}
                    </Button>
                  </AccordionPrimitive.Header>
                  <AccordionPrimitive.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                    <div className="flex flex-col gap-0.5 border-t border-stroke/60 p-1.5">
                      {group.all.map((proxy) => {
                        const active = proxy.name === group.now
                        const delay = lastDelay(proxy)
                        const label = delayLabel(delay)
                        const delayTitle = label
                          ? `${label} · ${t('sider.delayTest')}`
                          : t('sider.delayTest')
                        // A group test covers every node in it
                        const proxyTesting = testing || testingProxies.has(proxy.name)
                        // Two sibling buttons, since one may not contain the other; the row clips
                        // their corners
                        return (
                          <div
                            key={proxy.name}
                            className={cn(
                              'flex overflow-hidden rounded-lg border text-xs transition-colors',
                              active
                                ? 'border-stroke-power-on/50 bg-gradient-to-br from-gradient-start-power-on/15 to-gradient-end-power-on/15 font-medium'
                                : 'border-transparent hover:bg-accent/50'
                            )}
                          >
                            <button
                              type="button"
                              aria-current={active || undefined}
                              onClick={() => onSelectProxy(group, proxy.name)}
                              className="flex min-w-0 flex-1 cursor-pointer items-center py-1.5 pr-1 pl-2.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
                            >
                              <span className="flag-emoji truncate" title={proxy.name}>
                                {proxy.name}
                              </span>
                            </button>
                            <button
                              type="button"
                              disabled={proxyTesting}
                              aria-busy={proxyTesting}
                              aria-label={delayTitle}
                              title={delayTitle}
                              onClick={() => onProxyDelay(group, proxy)}
                              className="flex w-10 shrink-0 cursor-pointer items-center justify-center transition-colors outline-none hover:bg-foreground/5 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset disabled:cursor-default disabled:hover:bg-transparent"
                            >
                              {proxyTesting ? (
                                <Spinner className="size-3.5 text-muted-foreground" />
                              ) : (
                                delayContent(delay)
                              )}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </AccordionPrimitive.Content>
                </AccordionPrimitive.Item>
              )
            })}
          </AccordionPrimitive.Root>
        )}
      </div>

      <div className="flex items-center gap-1 border-t border-stroke/60 bg-card/30 p-2 backdrop-blur-xl">
        {profiles.length > 0 && (
          <Select
            value={pendingProfile ?? profileConfig?.current}
            onValueChange={onChangeProfile}
            disabled={pendingProfile !== null}
          >
            <SelectTrigger size="sm" className="flag-emoji min-w-0 flex-1 bg-card/50">
              {/* One left-aligned group, so the spinner cannot push the name around */}
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="min-w-0 truncate">
                  <SelectValue />
                </span>
                {pendingProfile !== null && <Spinner className="size-3.5 shrink-0" />}
              </span>
            </SelectTrigger>
            <SelectContent className="flag-emoji">
              {profiles.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t('trayMenu.openWindow')}
          title={t('trayMenu.openWindow')}
          onClick={openMainWindow}
          className={cn(profiles.length === 0 && 'ml-auto')}
        >
          <AppWindow className="size-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => notDialogQuit()}
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="size-4" />
          {t('common.quit')}
        </Button>
      </div>
    </div>
  )
}

export default TrayMenuApp
