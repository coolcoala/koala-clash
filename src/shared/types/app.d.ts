interface AppVersion {
  version: string
  changelog: string
}

interface ISysProxyConfig {
  enable: boolean
  host?: string
  mode?: SysProxyMode
  bypass?: string[]
  pacScript?: string
  settingMode?: 'exec' | 'service'
}

interface IHost {
  domain: string
  value: string | string[]
}

interface AppConfig {
  core: 'mihomo' | 'mihomo-alpha' | 'system'
  systemCorePath?: string
  corePermissionMode?: 'elevated' | 'service'
  serviceAuthKey?: string
  disableLoopbackDetector: boolean
  disableEmbedCA: boolean
  disableSystemCA: boolean
  disableNftables: boolean
  safePaths: string[]
  proxyDisplayOrder: 'default' | 'delay' | 'name'
  proxyDisplayLayout: 'hidden' | 'single' | 'double'
  groupDisplayLayout: 'hidden' | 'single' | 'double'
  profileDisplayDate?: 'expire' | 'update'
  envType?: ('bash' | 'cmd' | 'powershell' | 'nushell')[]
  proxyCols: 'auto' | '1' | '2' | '3' | '4'
  connectionDirection: 'asc' | 'desc'
  connectionOrderBy: 'time' | 'upload' | 'download' | 'uploadSpeed' | 'downloadSpeed' | 'process'
  connectionListMode?: 'classic' | 'process'
  connectionViewMode?: 'list' | 'table'
  connectionTableColumns?: string[]
  connectionTableColumnWidths?: Record<string, number>
  connectionTableSortColumn?: string
  connectionTableSortDirection?: 'asc' | 'desc'
  connectionInterval?: number
  spinFloatingIcon?: boolean
  disableTray?: boolean
  showFloatingWindow?: boolean
  connectionCardStatus?: CardStatus
  dnsCardStatus?: CardStatus
  logCardStatus?: CardStatus
  pauseSSID?: string[]
  mihomoCoreCardStatus?: CardStatus
  profileCardStatus?: CardStatus
  proxyCardStatus?: CardStatus
  resourceCardStatus?: CardStatus
  ruleCardStatus?: CardStatus
  sniffCardStatus?: CardStatus
  sysproxyCardStatus?: CardStatus
  tunCardStatus?: CardStatus
  homeCardStatus?: CardStatus
  autoLightweight?: boolean
  autoLightweightDelay?: number
  autoLightweightMode?: 'core' | 'tray'
  mihomoCpuPriority?: Priority
  diffWorkDir?: boolean
  autoSetDNSMode?: 'none' | 'exec' | 'service'
  originDNS?: string
  useWindowFrame: boolean
  proxyInTray: boolean
  appTheme: AppTheme
  customTheme?: string
  autoCheckUpdate: boolean
  silentStart: boolean
  autoCloseConnection: boolean
  expandProxyGroups?: boolean
  sysProxy: ISysProxyConfig
  proxyMode: boolean
  maxLogDays: number
  userAgent?: string
  delayTestConcurrency?: number
  delayTestUrl?: string
  delayTestTimeout?: number
  encryptedPassword?: number[]
  controlDns?: boolean
  controlSniff?: boolean
  controlTun?: boolean
  useDockIcon?: boolean
  useCustomTrayMenu?: boolean
  hosts: IHost[]
  showWindowShortcut?: string
  showFloatingWindowShortcut?: string
  triggerSysProxyShortcut?: string
  triggerTunShortcut?: string
  ruleModeShortcut?: string
  globalModeShortcut?: string
  directModeShortcut?: string
  restartAppShortcut?: string
  quitWithoutCoreShortcut?: string
  onlyActiveDevice?: boolean
  networkDetection?: boolean
  networkDetectionBypass?: string[]
  networkDetectionInterval?: number
  displayIcon?: boolean
  displayAppName?: boolean
  disableGPU: boolean
  mainSwitchMode?: 'tun' | 'sysproxy'
  useHotReloadProfile?: boolean
}

interface ProfileConfig {
  current?: string
  items: ProfileItem[]
}

interface ProfileItem {
  id: string
  type: 'remote' | 'local'
  name: string
  url?: string // remote
  ua?: string // remote
  file?: string // local
  verify?: boolean // remote
  interval?: number
  home?: string
  updated?: number
  useProxy?: boolean
  extra?: SubscriptionUserInfo
  locked?: boolean
  autoUpdate?: boolean
  announce?: string
  logo?: string
  supportUrl?: string
  globalMode?: boolean
  customCss?: string
}

interface SubscriptionUserInfo {
  upload: number
  download: number
  total: number
  expire: number
}
