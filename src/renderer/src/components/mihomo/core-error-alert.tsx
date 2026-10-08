import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleAlert } from 'lucide-react'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { dismissCoreError, useCoreLifecycleStore } from '@renderer/store/core-lifecycle-store'
import { restartCore } from '@renderer/utils/ipc'
import { Spinner } from '@renderer/components/ui/spinner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'

const REASON_KEYS: Record<CoreErrorReason, string> = {
  'binary-missing': 'binaryMissing',
  'config-invalid': 'configInvalid',
  crashed: 'crashed'
}

const CoreErrorAlert: React.FC = () => {
  const { t } = useTranslation()
  const error = useCoreLifecycleStore((s) => s.coreState.error)
  const dismissedErrorAt = useCoreLifecycleStore((s) => s.dismissedErrorAt)
  const { profileConfig } = useProfileConfig()
  const [restarting, setRestarting] = useState(false)
  // Keeps the content in place while the dialog fades out after the error is cleared
  const shownError = useRef(error)
  if (error) shownError.current = error
  const shown = shownError.current

  const supportUrl = profileConfig?.items?.find(
    (item) => item.id === profileConfig.current
  )?.supportUrl
  const reasonKey = REASON_KEYS[shown?.reason ?? 'crashed']
  const canRestart = shown?.reason === 'crashed'

  const handleRestart = async (event: React.MouseEvent): Promise<void> => {
    // Stay open: a successful start clears the error and closes the alert, a failed one updates it
    event.preventDefault()
    setRestarting(true)
    try {
      await restartCore()
    } finally {
      setRestarting(false)
    }
  }

  return (
    <AlertDialog
      open={!!error && error.at > dismissedErrorAt}
      onOpenChange={(open) => !open && dismissCoreError()}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <CircleAlert className="size-8 text-destructive" />
          </AlertDialogMedia>
          <AlertDialogTitle>{t(`coreError.${reasonKey}Title`)}</AlertDialogTitle>
          <AlertDialogDescription>{t(`coreError.${reasonKey}Description`)}</AlertDialogDescription>
        </AlertDialogHeader>
        {shown?.detail && (
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-stroke bg-card/80 p-2 text-xs text-foreground/60 select-text">
            {shown.detail}
          </pre>
        )}
        <AlertDialogFooter>
          {/* Without another action closing is the only one, so it takes the primary style */}
          <AlertDialogCancel variant={canRestart || supportUrl ? 'outline' : 'default'}>
            {t('common.close')}
          </AlertDialogCancel>
          {canRestart ? (
            <AlertDialogAction disabled={restarting} onClick={handleRestart}>
              {restarting && <Spinner />}
              {t('coreError.restart')}
            </AlertDialogAction>
          ) : (
            supportUrl && (
              <AlertDialogAction onClick={() => open(supportUrl)}>
                {t('pages.profiles.support')}
              </AlertDialogAction>
            )
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default CoreErrorAlert
