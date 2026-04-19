import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  HomeIcon,
  ProfileIcon,
  ProxiesIcon,
  ConnectionsIcon,
  RulesIcon,
  LogsIcon,
  SettingsIcon,
  CollapsedIcon,
  ExpandedIcon
} from '@renderer/components/icons/sidebar-icons'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from '@renderer/components/ui/sidebar'
import OutboundModeSwitcher from '@renderer/components/sider/outbound-mode-switcher'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import UpdaterButton from '@renderer/components/updater/updater-button'
import ConfigViewer from '@renderer/components/sider/config-viewer'

interface AppSidebarProps {
  latest?: {
    version: string
    changelog: string
  }
}

const navItems = [
  { key: 'main', path: '/home', icon: HomeIcon, i18nKey: 'sider.home' },
  { key: 'profile', path: '/profiles', icon: ProfileIcon, i18nKey: 'sider.profileManagement' },
  { key: 'proxy', path: '/proxies', icon: ProxiesIcon, i18nKey: 'sider.proxyGroup' },
  { key: 'connection', path: '/connections', icon: ConnectionsIcon, i18nKey: 'sider.connection' },
  { key: 'rule', path: '/rules', icon: RulesIcon, i18nKey: 'sider.rules' },
  { key: 'log', path: '/logs', icon: LogsIcon, i18nKey: 'sider.logs' },
  { key: 'settings', path: '/settings', icon: SettingsIcon, i18nKey: 'common.settings' }
]

const allowedWithoutProfiles = new Set(['main', 'profile', 'settings'])

const AppSidebar: React.FC<AppSidebarProps> = ({ latest }) => {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { toggleSidebar, state } = useSidebar()
  const collapsed = state === 'collapsed'
  const [showRuntimeConfig, setShowRuntimeConfig] = useState(false)
  const { profileConfig } = useProfileConfig()
  const hasProfiles = (profileConfig?.items?.length ?? 0) > 0
  const filteredNavItems = hasProfiles
    ? navItems
    : navItems.filter((item) => allowedWithoutProfiles.has(item.key))

  return (
    <Sidebar
      data-guide="app-sidebar"
      collapsible="icon"
      side="left"
      variant="floating"
      className="pt-14.25"
    >
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredNavItems.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname.includes(item.path)
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      className="cursor-pointer"
                      tooltip={t(item.i18nKey)}
                      isActive={isActive}
                      data-guide={item.key === 'main' ? 'sidebar-home-button' : undefined}
                      onClick={() => navigate(item.path)}
                      onDoubleClick={
                        item.key === 'profile' ? () => setShowRuntimeConfig(true) : undefined
                      }
                    >
                      <Icon className="size-4" />
                      <span>{t(item.i18nKey)}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex flex-col items-center gap-2">
          {hasProfiles && <OutboundModeSwitcher />}
          {latest && latest.version && <UpdaterButton iconOnly={collapsed} latest={latest} />}
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip={t('common.toggleSidebar')} onClick={toggleSidebar} className="cursor-pointer">
                {collapsed ? (
                  <ExpandedIcon className="size-4 shrink-0" />
                ) : (
                  <CollapsedIcon className="size-4 shrink-0" />
                )}
                <span>{t('common.hideSidebar')}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarFooter>
      {showRuntimeConfig && <ConfigViewer onClose={() => setShowRuntimeConfig(false)} />}
    </Sidebar>
  )
}

export default AppSidebar
