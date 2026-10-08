import React, { useEffect, useState } from 'react'
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
import { Badge } from '@renderer/components/ui/badge'
import { Card, CardContent, CardHeader } from '@renderer/components/ui/card'
import { Separator } from '@renderer/components/ui/separator'
import { Spinner } from '@renderer/components/ui/spinner'
import {
  checkCorePermission,
  checkElevateTask,
  installedCores,
  manualGrantCorePermition,
  revokeCorePermission
} from '@renderer/utils/ipc'
import { platform } from '@renderer/utils/init'
import { t } from 'i18next'
import useSWR from 'swr'

interface Props {
  onChange: (open: boolean) => void
  onRevoke: () => Promise<void>
  onGrant: () => Promise<void>
}

const PermissionModal: React.FC<Props> = (props) => {
  const { onChange, onRevoke, onGrant } = props
  const [loading, setLoading] = useState<{ mihomo?: boolean; 'mihomo-alpha'?: boolean }>({})
  const [hasPermission, setHasPermission] = useState<
    { mihomo: boolean; 'mihomo-alpha': boolean } | boolean | null
  >(null)
  const { data: cores } = useSWR('installedCores', installedCores)
  const isWindows = platform === 'win32'

  const checkPermissions = async (): Promise<void> => {
    try {
      const result = isWindows ? await checkElevateTask() : await checkCorePermission()
      setHasPermission(result)
    } catch {
      setHasPermission(isWindows ? false : { mihomo: false, 'mihomo-alpha': false })
    }
  }

  useEffect(() => {
    checkPermissions()
  }, [])

  const handleAction = async (action: () => Promise<void>): Promise<void> => {
    setLoading({ mihomo: true, 'mihomo-alpha': true })
    try {
      await action()
      onChange(false)
    } catch (e) {
      // Ignore user-cancelled errors
      const errorMsg = String(e)
      if (
        errorMsg.includes(t('common.cancel', { lng: 'zh-CN' })) ||
        errorMsg.includes('UserCancelledError')
      ) {
        // Fail silently; just refresh status
        await checkPermissions()
        return
      }
      toast.error(`${e}`)
    } finally {
      setLoading({})
    }
  }

  const handleCoreAction = async (
    coreName: 'mihomo' | 'mihomo-alpha',
    isGrant: boolean
  ): Promise<void> => {
    setLoading({ ...loading, [coreName]: true })
    try {
      if (isGrant) {
        await manualGrantCorePermition([coreName])
      } else {
        await revokeCorePermission([coreName])
      }
      await checkPermissions()
    } catch (e) {
      // Ignore user-cancelled errors
      const errorMsg = String(e)
      if (
        errorMsg.includes(t('common.cancel', { lng: 'zh-CN' })) ||
        errorMsg.includes('UserCancelledError')
      ) {
        // Fail silently; just refresh status
        await checkPermissions()
        return
      }
      toast.error(`${e}`)
    } finally {
      setLoading({ ...loading, [coreName]: false })
    }
  }

  const getStatusText = (coreName: 'mihomo' | 'mihomo-alpha'): string => {
    if (hasPermission === null) return t('mihomo.permissionModal.checking')
    if (typeof hasPermission === 'boolean') {
      return hasPermission
        ? t('mihomo.permissionModal.authorized')
        : t('mihomo.permissionModal.unauthorized')
    }
    return hasPermission[coreName]
      ? t('mihomo.permissionModal.authorized')
      : t('mihomo.permissionModal.unauthorized')
  }

  const getStatusBadgeClass = (coreName: 'mihomo' | 'mihomo-alpha'): string => {
    if (hasPermission === null) return 'bg-muted-foreground text-white animate-pulse'
    if (typeof hasPermission === 'boolean') {
      return hasPermission ? 'bg-success text-white' : 'bg-warning text-white'
    }
    return hasPermission[coreName] ? 'bg-success text-white' : 'bg-warning text-white'
  }

  return (
    <Dialog open={true} onOpenChange={onChange}>
      <DialogContent
        className="w-[450px] max-w-[calc(100%-2rem)] max-h-[70vh] flex flex-col"
        showCloseButton={false}
      >
        <DialogHeader className="flex flex-col gap-1">
          <DialogTitle>
            {isWindows
              ? t('notifications.taskScheduleManagement')
              : t('notifications.coreAuthManagement')}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-4">
            {isWindows ? (
              <>
                <Card className="border-none bg-gradient-to-br from-muted/30 to-muted/50 py-0 gap-0">
                  <CardContent className="px-4 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {t('mihomo.permissionModal.taskScheduleStatus')}
                        </span>
                      </div>
                      <Badge
                        className={`text-xs ${
                          hasPermission === null
                            ? 'bg-muted-foreground text-white animate-pulse'
                            : typeof hasPermission === 'boolean'
                              ? hasPermission
                                ? 'bg-success text-white'
                                : 'bg-warning text-white'
                              : 'bg-muted-foreground text-white'
                        }`}
                      >
                        {hasPermission === null
                          ? t('mihomo.permissionModal.checkingEllipsis')
                          : typeof hasPermission === 'boolean'
                            ? hasPermission
                              ? t('mihomo.permissionModal.registered')
                              : t('mihomo.permissionModal.unregistered')
                            : t('mihomo.permissionModal.unknown')}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                <Separator />

                <div className="text-xs text-muted-foreground space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5">•</span>
                    <span>{t('mihomo.permissionModal.taskScheduleNote1')}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5">•</span>
                    <span>{t('mihomo.permissionModal.taskScheduleNote2')}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5">•</span>
                    <span>{t('mihomo.permissionModal.taskScheduleNote3')}</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3">
                  <Card className="border-none py-0 gap-0">
                    <CardHeader className="px-4 pt-4 pb-0">
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-base">
                            {t('pages.mihomo.builtinStable')}
                          </h4>
                        </div>
                        <Badge className={`text-xs ${getStatusBadgeClass('mihomo')}`}>
                          {getStatusText('mihomo')}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pt-3 pb-4">
                      {typeof hasPermission !== 'boolean' && hasPermission?.mihomo ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full border-warning text-warning hover:bg-warning/10"
                          onClick={() => handleCoreAction('mihomo', false)}
                          disabled={loading.mihomo}
                        >
                          {loading.mihomo && <Spinner className="mr-2 size-4" />}
                          {t('mihomo.permissionModal.revokeAuthorization')}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="w-full shadow-sm"
                          onClick={() => handleCoreAction('mihomo', true)}
                          disabled={loading.mihomo}
                        >
                          {loading.mihomo && <Spinner className="mr-2 size-4" />}
                          {t('mihomo.permissionModal.authorizeCore')}
                        </Button>
                      )}
                    </CardContent>
                  </Card>

                  {cores?.includes('mihomo-alpha') && (
                    <Card className="border-none py-0 gap-0">
                      <CardHeader className="px-4 pt-4 pb-0">
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-base">
                              {t('pages.mihomo.builtinPreview')}
                            </h4>
                          </div>
                          <Badge className={`text-xs ${getStatusBadgeClass('mihomo-alpha')}`}>
                            {getStatusText('mihomo-alpha')}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pt-3 pb-4">
                        {typeof hasPermission !== 'boolean' && hasPermission?.['mihomo-alpha'] ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full border-warning text-warning hover:bg-warning/10"
                            onClick={() => handleCoreAction('mihomo-alpha', false)}
                            disabled={loading['mihomo-alpha']}
                          >
                            {loading['mihomo-alpha'] && <Spinner className="mr-2 size-4" />}
                            {t('mihomo.permissionModal.revokeAuthorization')}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="w-full shadow-sm"
                            onClick={() => handleCoreAction('mihomo-alpha', true)}
                            disabled={loading['mihomo-alpha']}
                          >
                            {loading['mihomo-alpha'] && <Spinner className="mr-2 size-4" />}
                            {t('mihomo.permissionModal.authorizeCore')}
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>

                <div className="text-xs text-muted-foreground space-y-2">
                  <div className="flex items-start gap-2">
                    <span>{t('mihomo.permissionModal.grantNote1')}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span>{t('mihomo.permissionModal.grantNote2')}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        <DialogFooter className="flex-row justify-end gap-2">
          <DialogClose asChild>
            <Button
              size="sm"
              variant="ghost"
              disabled={Object.values(loading).some((v) => v)}
            >
              {t('common.close')}
            </Button>
          </DialogClose>
          {isWindows &&
            (() => {
              const hasAnyPermission = typeof hasPermission === 'boolean' ? hasPermission : false
              const isLoading = Object.values(loading).some((v) => v)

              return hasAnyPermission ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-warning text-warning hover:bg-warning/10"
                  onClick={() => handleAction(onRevoke)}
                  disabled={isLoading}
                >
                  {isLoading && <Spinner className="mr-2 size-4" />}
                  {t('mihomo.permissionModal.unregisterTaskSchedule')}
                </Button>
              ) : (
                <Button size="sm" onClick={() => handleAction(onGrant)} disabled={isLoading}>
                  {isLoading && <Spinner className="mr-2 size-4" />}
                  {t('mihomo.permissionModal.registerTaskSchedule')}
                </Button>
              )
            })()}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default PermissionModal
