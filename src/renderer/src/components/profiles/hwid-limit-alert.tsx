import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleAlert } from 'lucide-react'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
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

const HwidLimitAlert = () => {
  const { t } = useTranslation()
  const { hwidLimitError, clearHwidLimitError } = useProfileConfig()
  // Keeps the footer in place while the dialog fades out after the error is cleared
  const shownSupportUrl = useRef(hwidLimitError)
  if (hwidLimitError !== null) shownSupportUrl.current = hwidLimitError
  const supportUrl = shownSupportUrl.current

  return (
    <AlertDialog open={hwidLimitError !== null} onOpenChange={(open) => !open && clearHwidLimitError()}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <CircleAlert className="size-8 text-destructive" />
          </AlertDialogMedia>
          <AlertDialogTitle>{t('pages.profiles.hwidLimitTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('pages.profiles.hwidLimitDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* Without a support link closing is the only action, so it takes the primary style */}
          <AlertDialogCancel
            variant={supportUrl ? 'outline' : 'default'}
            onClick={clearHwidLimitError}
          >
            {t('common.close')}
          </AlertDialogCancel>
          {supportUrl && (
            <AlertDialogAction
              onClick={() => {
                open(supportUrl)
                clearHwidLimitError()
              }}
            >
              {t('pages.profiles.support')}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default HwidLimitAlert
