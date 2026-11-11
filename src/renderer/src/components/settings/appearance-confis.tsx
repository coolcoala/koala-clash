import React, { useEffect, useState, useRef } from 'react'
import { toast } from 'sonner'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { Button } from '@renderer/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Spinner } from '@renderer/components/ui/spinner'
import { Switch } from '@renderer/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import {
  applyTheme,
  closeFloatingWindow,
  closeTrayIcon,
  fetchThemes,
  getFilePath,
  importThemes,
  isAlwaysOnTop,
  relaunchApp,
  resolveThemes,
  setAlwaysOnTop,
  setDockVisible,
  showFloatingWindow,
  showTrayIcon,
  writeTheme
} from '@renderer/utils/ipc'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { platform } from '@renderer/utils/init'
import { useTheme } from 'next-themes'
import CSSEditorModal from './css-editor-modal'
import { useTranslation } from 'react-i18next'
import { CloudDownload, FilePenLine, Import, MessageCircleQuestionMark } from 'lucide-react'

interface AppearanceConfigProps {
  showHiddenSettings: boolean
}

const AppearanceConfig: React.FC<AppearanceConfigProps> = (props) => {
  const { showHiddenSettings } = props
  const { t } = useTranslation()
  const { appConfig, patchAppConfig } = useAppConfig()
  const [customThemes, setCustomThemes] = useState<{ key: string; label: string }[]>()
  const [openCSSEditor, setOpenCSSEditor] = useState(false)
  const [fetching, setFetching] = useState(false)
  const { setTheme } = useTheme()
  const {
    useDockIcon = true,
    proxyInTray = true,
    useCustomTrayMenu = false,
    disableTray = false,
    showFloatingWindow: showFloating = false,
    spinFloatingIcon = true,
    useWindowFrame = false,
    customTheme = 'default.css',
    appTheme = 'system'
  } = appConfig || {}
  const [localShowFloating, setLocalShowFloating] = useState(showFloating)
  const [onTop, setOnTop] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    setLocalShowFloating(showFloating)
  }, [showFloating])

  useEffect(() => {
    resolveThemes().then((themes) => {
      setCustomThemes(themes)
    })
    isAlwaysOnTop().then(setOnTop)
  }, [])

  useEffect(() => {
    return (): void => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return (
    <>
      {openCSSEditor && (
        <CSSEditorModal
          theme={customTheme}
          onCancel={() => setOpenCSSEditor(false)}
          onConfirm={async (css: string) => {
            await writeTheme(customTheme, css)
            await applyTheme(customTheme)
            setOpenCSSEditor(false)
          }}
        />
      )}
      <SettingCard title={t('settings.appearance.title')}>
        <SettingItem
          title={t('settings.appearance.showFloatingWindow')}
          actions={
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon-sm" variant="ghost">
                  <MessageCircleQuestionMark className="text-lg" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('settings.appearance.showFloatingWindowHelp')}</TooltipContent>
            </Tooltip>
          }
          divider
        >
          <Switch
            checked={localShowFloating}
            onCheckedChange={async (value) => {
              if (timeoutRef.current) {
                clearTimeout(timeoutRef.current)
                timeoutRef.current = null
              }

              setLocalShowFloating(value)
              if (value) {
                await showFloatingWindow()
                timeoutRef.current = setTimeout(async () => {
                  await patchAppConfig({ showFloatingWindow: value })
                  timeoutRef.current = null
                }, 1000)
              } else {
                patchAppConfig({ showFloatingWindow: value })
                await closeFloatingWindow()
              }
            }}
          />
        </SettingItem>
        {localShowFloating && (
          <SettingItem title={t('settings.appearance.rotateFloatingIcon')} divider>
            <Switch
              checked={spinFloatingIcon}
              onCheckedChange={async (value) => {
                await patchAppConfig({ spinFloatingIcon: value })
                window.electron.ipcRenderer.send('updateFloatingWindow')
              }}
            />
          </SettingItem>
        )}
        <SettingItem title={t('settings.appearance.disableTrayIcon')} divider>
          <Switch
            checked={disableTray}
            onCheckedChange={async (value) => {
              await patchAppConfig({ disableTray: value })
              if (value) {
                closeTrayIcon()
              } else {
                showTrayIcon()
              }
            }}
          />
        </SettingItem>
        {/* On Linux the tray icon only has the system menu */}
        {platform !== 'linux' && (
          <>
            <SettingItem title={t('settings.appearance.customTrayMenu')} divider>
              <Switch
                checked={useCustomTrayMenu}
                onCheckedChange={async (value) => {
                  await patchAppConfig({ useCustomTrayMenu: value })
                }}
              />
            </SettingItem>
            {/* The extended menu always lists the groups, this one is for the system menu */}
            {!useCustomTrayMenu && (
              <SettingItem title={t('settings.appearance.trayShowNodeInfo')} divider>
                <Switch
                  checked={proxyInTray}
                  onCheckedChange={async (value) => {
                    await patchAppConfig({ proxyInTray: value })
                  }}
                />
              </SettingItem>
            )}
          </>
        )}
        {platform === 'darwin' && (
          <>
            <SettingItem title={t('settings.appearance.showDockIcon')} divider>
              <Switch
                checked={useDockIcon}
                onCheckedChange={async (value) => {
                  await patchAppConfig({ useDockIcon: value })
                  setDockVisible(value)
                }}
              />
            </SettingItem>
          </>
        )}
        <SettingItem title={t('settings.appearance.alwaysOnTop')} divider>
          <Switch
            checked={onTop}
            onCheckedChange={async (value) => {
              await setAlwaysOnTop(value)
              setOnTop(await isAlwaysOnTop())
            }}
          />
        </SettingItem>
        <SettingItem title={t('settings.appearance.useSystemTitleBar')} divider>
          <Switch
            checked={useWindowFrame}
            onCheckedChange={async (value) => {
              await patchAppConfig({ useWindowFrame: value })
              await relaunchApp()
            }}
          />
        </SettingItem>
        <SettingItem title={t('settings.appearance.backgroundColor')} divider={showHiddenSettings}>
          <Tabs
            value={appTheme}
            onValueChange={(value) => {
              setTheme(value)
              patchAppConfig({ appTheme: value as AppTheme })
            }}
          >
            <TabsList>
              <TabsTrigger value="system">{t('settings.appearance.auto')}</TabsTrigger>
              <TabsTrigger value="dark">{t('settings.appearance.dark')}</TabsTrigger>
              <TabsTrigger value="light">{t('settings.appearance.light')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </SettingItem>
        {showHiddenSettings && (
          <SettingItem
            title={t('settings.appearance.theme')}
            actions={
              <>
                <Button
                  size="icon-sm"
                  title={t('settings.appearance.pullTheme')}
                  variant="ghost"
                  disabled={fetching}
                  onClick={async () => {
                    setFetching(true)
                    try {
                      await fetchThemes()
                      setCustomThemes(await resolveThemes())
                    } catch (e) {
                      toast.error(`${e}`)
                    } finally {
                      setFetching(false)
                    }
                  }}
                >
                  {fetching ? (
                    <Spinner className="text-lg" />
                  ) : (
                    <CloudDownload className="text-lg" />
                  )}
                </Button>
                <Button
                  size="icon-sm"
                  title={t('settings.appearance.importTheme')}
                  variant="ghost"
                  onClick={async () => {
                    const files = await getFilePath(['css'])
                    if (!files) return
                    try {
                      await importThemes(files)
                      setCustomThemes(await resolveThemes())
                    } catch (e) {
                      toast.error(`${e}`)
                    }
                  }}
                >
                  <Import className="text-lg" />
                </Button>
                <Button
                  size="icon-sm"
                  title={t('settings.appearance.editTheme')}
                  variant="ghost"
                  onClick={async () => {
                    setOpenCSSEditor(true)
                  }}
                >
                  <FilePenLine className="text-lg" />
                </Button>
              </>
            }
          >
            {customThemes && (
              <Select
                value={customTheme}
                onValueChange={async (value) => {
                  try {
                    await patchAppConfig({ customTheme: value })
                  } catch (e) {
                    toast.error(`${e}`)
                  }
                }}
              >
                <SelectTrigger size="sm" className="w-[60%]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {customThemes.map((theme) => (
                    <SelectItem key={theme.key} value={theme.key}>
                      {theme.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </SettingItem>
        )}
      </SettingCard>
    </>
  )
}

export default AppearanceConfig
