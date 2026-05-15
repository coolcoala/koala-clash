import React, { useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Switch } from '@renderer/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { cn } from '@renderer/lib/utils'
import SettingItem from '../base/base-setting-item'
import { Spinner } from '@renderer/components/ui/spinner'
import { getFilePath, readTextFile, mihomoHotReloadConfig } from '@renderer/utils/ipc'
import { useTranslation } from 'react-i18next'
import {
  ClipboardPaste,
  ChevronDown,
  FileUp,
  FilePlus2,
  Check,
  MessageCircleQuestionMark
} from 'lucide-react'

interface Props {
  item: ProfileItem
  isCurrent: boolean
  updateProfileItem: (item: ProfileItem) => Promise<void>
  onClose: () => void
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

const EditInfoModal: React.FC<Props> = (props) => {
  const { t } = useTranslation()
  const { item, isCurrent, updateProfileItem, onClose } = props
  const [values, setValues] = useState({ ...item, autoUpdate: item.autoUpdate ?? true })
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [urlTouched, setUrlTouched] = useState(false)
  const [localFileName, setLocalFileName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  const isNew = !item.id
  const isLocal = values.type === 'local'
  const urlInvalid = !isLocal && urlTouched && !!values.url && !isValidUrl(values.url)

  const canImport = isNew
    ? isLocal
      ? !!values.file
      : isValidUrl(values.url || '')
    : true

  const onSave = async (): Promise<void> => {
    setSaving(true)
    try {
      const itemToSave = { ...values }
      await updateProfileItem(itemToSave)
      if (item.id && isCurrent) {
        await mihomoHotReloadConfig()
      }
      closeRef.current?.click()
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setSaving(false)
    }
  }

  const handlePaste = async (): Promise<void> => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setValues({ ...values, url: text.trim() })
        setUrlTouched(true)
      }
    } catch {
      // clipboard access denied
    }
  }

  const handleSelectFile = async (): Promise<void> => {
    try {
      const files = await getFilePath(['yml', 'yaml'])
      if (files?.length) {
        const content = await readTextFile(files[0])
        const fileName = files[0].split('/').pop()?.split('\\').pop() || ''
        setLocalFileName(fileName)
        setValues({
          ...values,
          type: 'local',
          file: content,
          name: values.name || fileName
        })
      }
    } catch (e) {
      toast.error(`${e}`)
    }
  }

  const handleCreateEmpty = (): void => {
    setLocalFileName(null)
    setValues({
      ...values,
      type: 'local',
      file: 'proxies: []\nproxy-groups: []\nrules: []',
      name: values.name || t('profile.blankSubscription')
    })
  }

  const switchToType = (type: 'remote' | 'local'): void => {
    if (type === values.type) return
    setValues({
      ...values,
      type,
      url: type === 'local' ? undefined : values.url,
      file: type === 'remote' ? undefined : values.file
    })
    setLocalFileName(null)
    setUrlTouched(false)
  }

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className={cn(
          'sm:max-w-none',
          'w-120'
        )}
        showCloseButton={false}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogClose ref={closeRef} className="hidden" />
        <DialogHeader className="app-drag">
          <DialogTitle>
            {isNew ? t('profile.importRemoteConfig') : t('profile.editInfo')}
          </DialogTitle>
        </DialogHeader>

        {isNew ? (
          <div className="flex flex-col gap-3">
            {/* Source: URL input or local file picker */}
            {isLocal ? (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-2"
                    onClick={handleSelectFile}
                  >
                    <FileUp className="size-4" />
                    {t('profile.selectFile')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-2"
                    onClick={handleCreateEmpty}
                  >
                    <FilePlus2 className="size-4" />
                    {t('profile.createEmpty')}
                  </Button>
                </div>
                {values.file && (
                  <div className="flex items-center gap-2 text-xs text-success">
                    <Check className="size-3.5" />
                    {localFileName
                      ? `${t('profile.fileSelected')}: ${localFileName}`
                      : t('profile.blankSubscription')}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="relative">
                  <Input
                    data-guide="profile-import-url-input"
                    className={cn(
                      'h-9 pr-9',
                      urlInvalid && 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/50'
                    )}
                    placeholder={t('profile.urlPlaceholder')}
                    value={values.url || ''}
                    onChange={(e) => {
                      setValues({ ...values, url: e.target.value })
                      if (!urlTouched) setUrlTouched(true)
                    }}
                    onBlur={() => setUrlTouched(true)}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        data-guide="profile-import-paste-btn"
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={handlePaste}
                      >
                        <ClipboardPaste className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('profile.pasteFromClipboard')}</TooltipContent>
                  </Tooltip>
                </div>
                {urlInvalid && (
                  <p className="text-xs text-destructive">{t('profile.invalidUrl')}</p>
                )}
              </div>
            )}

            {/* Advanced settings toggle */}
            <button
              type="button"
              className="flex items-center gap-1.5 self-start text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <ChevronDown
                className={cn(
                  'size-3.5 transition-transform duration-200',
                  showAdvanced && 'rotate-180'
                )}
              />
              {t('profile.advancedSettings')}
            </button>

            {showAdvanced && (
              <div className="rounded-xl border border-stroke/50 bg-accent/20 p-3 flex flex-col gap-2">
                <SettingItem title={t('profile.profileType')}>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant={!isLocal ? 'default' : 'outline'}
                      className="h-7 px-3 text-xs"
                      onClick={() => switchToType('remote')}
                    >
                      {t('common.remote')}
                    </Button>
                    <Button
                      size="sm"
                      variant={isLocal ? 'default' : 'outline'}
                      className="h-7 px-3 text-xs"
                      onClick={() => switchToType('local')}
                    >
                      {t('common.local')}
                    </Button>
                  </div>
                </SettingItem>
                <SettingItem title={t('profile.name')}>
                  <Input
                    className="h-8"
                    value={values.name}
                    onChange={(e) => setValues({ ...values, name: e.target.value })}
                  />
                </SettingItem>
                {!isLocal && (
                  <>
                    <SettingItem title={t('profile.customUA')}>
                      <Input
                        className="h-8"
                        value={values.ua ?? ''}
                        onChange={(e) =>
                          setValues({ ...values, ua: e.target.value.trim() || undefined })
                        }
                      />
                    </SettingItem>
                    <SettingItem title={t('profile.verifyFormat')}>
                      <Switch
                        checked={values.verify ?? true}
                        onCheckedChange={(v) => setValues({ ...values, verify: v })}
                      />
                    </SettingItem>
                    <SettingItem title={t('profile.useProxyUpdate')}>
                      <Switch
                        checked={values.useProxy ?? false}
                        onCheckedChange={(v) => setValues({ ...values, useProxy: v })}
                      />
                    </SettingItem>
                    <SettingItem title={t('profile.autoUpdate')}>
                      <Switch
                        checked={values.autoUpdate ?? false}
                        onCheckedChange={(v) => setValues({ ...values, autoUpdate: v })}
                      />
                    </SettingItem>
                    {values.autoUpdate && (
                      <SettingItem
                        title={t('profile.updateIntervalMinutes')}
                        actions={
                          values.locked && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="icon-sm" variant="ghost">
                                  <MessageCircleQuestionMark className="text-lg" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {t('profile.updateIntervalLockedHelp')}
                              </TooltipContent>
                            </Tooltip>
                          )
                        }
                      >
                        <Input
                          type="number"
                          className="h-8 w-24"
                          value={values.interval?.toString() ?? ''}
                          onChange={(e) =>
                            setValues({ ...values, interval: parseInt(e.target.value) })
                          }
                          disabled={values.locked}
                        />
                      </SettingItem>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Edit existing profile */
          <div className="flex flex-col gap-3 overflow-y-auto max-h-[60vh]">
            {/* Identity */}
            <div className="rounded-xl border border-stroke/50 bg-accent/20 p-3 flex flex-col gap-2">
              <SettingItem title={t('profile.name')}>
                <Input
                  className="h-8"
                  value={values.name}
                  onChange={(e) => setValues({ ...values, name: e.target.value })}
                />
              </SettingItem>
              {values.type === 'remote' && (
                <SettingItem title={t('profile.subscriptionAddress')}>
                  <Input
                    className="h-8"
                    value={values.url}
                    onChange={(e) => setValues({ ...values, url: e.target.value })}
                  />
                </SettingItem>
              )}
            </div>
            {/* Remote settings */}
            {values.type === 'remote' && (
              <div className="rounded-xl border border-stroke/50 bg-accent/20 p-3 flex flex-col gap-2">
                <SettingItem title={t('profile.customUA')}>
                  <Input
                    className="h-8"
                    value={values.ua ?? ''}
                    onChange={(e) =>
                      setValues({ ...values, ua: e.target.value.trim() || undefined })
                    }
                  />
                </SettingItem>
                <SettingItem title={t('profile.verifyFormat')}>
                  <Switch
                    checked={values.verify ?? true}
                    onCheckedChange={(v) => setValues({ ...values, verify: v })}
                  />
                </SettingItem>
                <SettingItem title={t('profile.useProxyUpdate')}>
                  <Switch
                    checked={values.useProxy ?? false}
                    onCheckedChange={(v) => setValues({ ...values, useProxy: v })}
                  />
                </SettingItem>
                <SettingItem title={t('profile.autoUpdate')}>
                  <Switch
                    checked={values.autoUpdate ?? false}
                    onCheckedChange={(v) => setValues({ ...values, autoUpdate: v })}
                  />
                </SettingItem>
                {values.autoUpdate && (
                  <SettingItem
                    title={t('profile.updateIntervalMinutes')}
                    actions={
                      values.locked && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon-sm" variant="ghost">
                              <MessageCircleQuestionMark className="text-lg" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t('profile.updateIntervalLockedHelp')}
                          </TooltipContent>
                        </Tooltip>
                      )
                    }
                  >
                    <Input
                      type="number"
                      className="h-8 w-24"
                      value={values.interval?.toString() ?? ''}
                      onChange={(e) =>
                        setValues({ ...values, interval: parseInt(e.target.value) })
                      }
                      disabled={values.locked}
                    />
                  </SettingItem>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button size="sm" variant="ghost">
              {t('common.cancel')}
            </Button>
          </DialogClose>
          <Button
            size="sm"
            onClick={onSave}
            disabled={!canImport || saving}
            data-guide={isNew ? 'profile-import-submit' : undefined}
          >
            <span className="relative inline-flex items-center justify-center">
              {saving && <Spinner className="size-4 absolute" />}
              <span className={saving ? 'invisible' : undefined}>
                {isNew ? t('common.import') : t('common.save')}
              </span>
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default EditInfoModal
