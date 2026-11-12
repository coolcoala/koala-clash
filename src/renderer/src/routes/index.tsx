import { lazy } from 'react'
import { Navigate } from 'react-router-dom'
import Home from '@renderer/pages/home'

// Home is the start page and stays in the main bundle. The other pages are parsed only when
// needed, so they no longer delay the first window; preloadPages fetches them once the window
// is idle, so even a first visit does not wait.
const pageLoaders = {
  mihomo: () => import('@renderer/pages/mihomo'),
  sysproxy: () => import('@renderer/pages/syspeoxy'),
  tun: () => import('@renderer/pages/tun'),
  proxies: () => import('@renderer/pages/proxies'),
  rules: () => import('@renderer/pages/rules'),
  resources: () => import('@renderer/pages/resources'),
  dns: () => import('@renderer/pages/dns'),
  sniffer: () => import('@renderer/pages/sniffer'),
  logs: () => import('@renderer/pages/logs'),
  connections: () => import('@renderer/pages/connections'),
  profiles: () => import('@renderer/pages/profiles'),
  settings: () => import('@renderer/pages/settings')
}

const Mihomo = lazy(pageLoaders.mihomo)
const Sysproxy = lazy(pageLoaders.sysproxy)
const Tun = lazy(pageLoaders.tun)
const Proxies = lazy(pageLoaders.proxies)
const Rules = lazy(pageLoaders.rules)
const Resources = lazy(pageLoaders.resources)
const DNS = lazy(pageLoaders.dns)
const Sniffer = lazy(pageLoaders.sniffer)
const Logs = lazy(pageLoaders.logs)
const Connections = lazy(pageLoaders.connections)
const Profiles = lazy(pageLoaders.profiles)
const Settings = lazy(pageLoaders.settings)

// One page per idle period, most visited first, so preloading never blocks input for long.
// Returns a function that stops it.
export const preloadPages = (): (() => void) => {
  const queue = [
    pageLoaders.proxies,
    pageLoaders.profiles,
    pageLoaders.connections,
    pageLoaders.settings,
    pageLoaders.logs,
    pageLoaders.rules,
    pageLoaders.mihomo,
    pageLoaders.sysproxy,
    pageLoaders.tun,
    pageLoaders.dns,
    pageLoaders.sniffer,
    pageLoaders.resources
  ]
  let stopped = false
  let idleId = 0
  const next = (): void => {
    const load = queue.shift()
    if (stopped || !load) return
    load()
      .catch(() => {
        // the page loads again, and reports the error, when it is opened
      })
      .finally(() => {
        if (!stopped) idleId = requestIdleCallback(next)
      })
  }
  idleId = requestIdleCallback(next)
  return (): void => {
    stopped = true
    cancelIdleCallback(idleId)
  }
}

const routes = [
  {
    path: '/mihomo',
    element: <Mihomo />
  },
  {
    path: '/sysproxy',
    element: <Sysproxy />
  },
  {
    path: '/tun',
    element: <Tun />
  },
  {
    path: '/proxies',
    element: <Proxies />
  },
  {
    path: '/rules',
    element: <Rules />
  },
  {
    path: '/resources',
    element: <Resources />
  },
  {
    path: '/dns',
    element: <DNS />
  },
  {
    path: '/sniffer',
    element: <Sniffer />
  },
  {
    path: '/logs',
    element: <Logs />
  },
  {
    path: '/connections',
    element: <Connections />
  },
  {
    path: '/profiles',
    element: <Profiles />
  },
  {
    path: '/settings',
    element: <Settings />
  },
  {
    path: '/',
    element: <Navigate to="/home" />
  },
  {
    path: '/home',
    element: <Home />
  }
]

export default routes
