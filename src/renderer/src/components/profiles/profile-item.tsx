import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { cn } from '@renderer/lib/utils'
import { useTranslation } from 'react-i18next'
import { calcTraffic } from '@renderer/utils/calc'
import dayjs from 'dayjs'
import React, { useEffect, useMemo, useState } from 'react'
import EditFileModal from './edit-file-modal'
import EditRulesModal from './edit-rules-modal'
import EditInfoModal from './edit-info-modal'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { openFile } from '@renderer/utils/ipc'
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
import {
  Clock,
  EllipsisVertical,
  ExternalLink,
  FileText,
  FolderOpen,
  HeadsetIcon,
  InfinityIcon,
  ListTree,
  Pencil,
  RefreshCcw,
  Trash2
} from 'lucide-react'

interface Props {
  info: ProfileItem
  isCurrent: boolean
  addProfileItem: (item: Partial<ProfileItem>) => Promise<void>
  updateProfileItem: (item: ProfileItem) => Promise<void>
  removeProfileItem: (id: string) => Promise<void>
  onClick: () => Promise<void>
  switching: boolean
}

interface MenuItem {
  key: string
  label: string
  icon: React.ReactNode
  showDivider: boolean
  variant: 'default' | 'destructive'
}

const ProfileItem: React.FC<Props> = (props) => {
  const { t } = useTranslation()
  const {
    info,
    addProfileItem,
    removeProfileItem,
    updateProfileItem,
    onClick,
    isCurrent,
    switching
  } = props
  const extra = info?.extra
  const usage = (extra?.upload ?? 0) + (extra?.download ?? 0)
  const total = extra?.total ?? 0
  const [updating, setUpdating] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [openInfoEditor, setOpenInfoEditor] = useState(false)
  const [openFileEditor, setOpenFileEditor] = useState(false)
  const [openRulesEditor, setOpenRulesEditor] = useState(false)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform: tf,
    transition,
    isDragging
  } = useSortable({
    id: info.id
  })
  const transform = tf ? { x: tf.x, y: tf.y, scaleX: 1, scaleY: 1 } : null
  const [disableSelect, setDisableSelect] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const updatedFromNow = dayjs(info.updated).fromNow()

  const hasLimit = total > 0
  const expired = extra?.expire ? dayjs.unix(extra.expire).isBefore(dayjs()) : false

  const trafficRemaining = useMemo(() => {
    if (info.type !== 'remote' || !extra) return null
    if (!hasLimit) return null
    const remaining = Math.max(0, total - usage)
    return calcTraffic(remaining)
  }, [info.type, extra, hasLimit, total, usage])

  const daysRemaining = useMemo(() => {
    if (info.type !== 'remote' || !extra) return null
    if (!extra.expire) return null
    if (expired) return '0'
    const days = dayjs.unix(extra.expire).diff(dayjs(), 'day')
    return days.toString()
  }, [info.type, extra, expired])

  const intervalLabel = useMemo(() => {
    if (!info.interval || info.interval <= 0) return null
    const hours = Math.floor(info.interval / 60)
    if (hours >= 24) {
      const days = Math.floor(hours / 24)
      return `${days}${t('profile.dayShort')}`
    }
    if (hours > 0) return `${hours}${t('profile.hourShort')}`
    return `${info.interval}${t('profile.minuteShort')}`
  }, [info.interval, t])

  const menuItems: MenuItem[] = useMemo(() => {
    const list: MenuItem[] = []
    if (info.home) {
      list.push({
        key: 'home',
        label: t('profile.homepage'),
        icon: <ExternalLink />,
        showDivider: false,
        variant: 'default'
      })
    }
    if (info.supportUrl) {
      list.push({
        key: 'support',
        label: t('profile.support'),
        icon: <HeadsetIcon />,
        showDivider: false,
        variant: 'default'
      })
    }
    list.push(
      {
        key: 'edit-info',
        label: t('profile.editInfo'),
        icon: <Pencil />,
        showDivider: false,
        variant: 'default'
      },
      {
        key: 'edit-file',
        label: t('profile.editFile'),
        icon: <FileText />,
        showDivider: false,
        variant: 'default'
      },
      {
        key: 'edit-rules',
        label: t('profile.editRule'),
        icon: <ListTree />,
        showDivider: false,
        variant: 'default'
      },
      {
        key: 'open-file',
        label: t('profile.openFile'),
        icon: <FolderOpen />,
        showDivider: true,
        variant: 'default'
      },
      {
        key: 'delete',
        label: t('profile.delete'),
        icon: <Trash2 />,
        showDivider: false,
        variant: 'destructive'
      }
    )
    return list
  }, [info, t])

  const onMenuAction = async (key: string): Promise<void> => {
    switch (key) {
      case 'update': {
        setUpdating(true)
        try {
          await addProfileItem(info)
        } finally {
          setUpdating(false)
        }
        break
      }
      case 'edit-info': {
        setOpenInfoEditor(true)
        break
      }
      case 'edit-file': {
        setOpenFileEditor(true)
        break
      }
      case 'edit-rules': {
        setOpenRulesEditor(true)
        break
      }
      case 'open-file': {
        openFile(info.id)
        break
      }
      case 'delete': {
        setConfirmOpen(true)
        break
      }
      case 'home': {
        open(info.home)
        break
      }
      case 'support': {
        open(info.supportUrl)
        break
      }
    }
  }

  useEffect(() => {
    if (isDragging) {
      setTimeout(() => setDisableSelect(true), 100)
    } else {
      setTimeout(() => setDisableSelect(false), 100)
    }
  }, [isDragging])

  const handleSelect = (): void => {
    if (disableSelect || switching) return
    setSelecting(true)
    onClick().finally(() => setSelecting(false))
  }

  return (
    <div
      className="relative col-span-1"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 'calc(infinity)' : undefined
      }}
    >
      {openFileEditor && <EditFileModal id={info.id} onClose={() => setOpenFileEditor(false)} />}
      {openRulesEditor && <EditRulesModal id={info.id} onClose={() => setOpenRulesEditor(false)} />}
      {openInfoEditor && (
        <EditInfoModal
          item={info}
          isCurrent={isCurrent}
          onClose={() => setOpenInfoEditor(false)}
          updateProfileItem={updateProfileItem}
        />
      )}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2 className="size-8 text-destructive" />
            </AlertDialogMedia>
            <AlertDialogTitle>{t('profile.confirmDeleteProfile')}</AlertDialogTitle>
            <AlertDialogDescription className="truncate max-w-3xs">
              {info.name}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setTimeout(() => removeProfileItem(info.id), 200)
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div
        role="button"
        tabIndex={0}
        aria-selected={isCurrent}
        aria-busy={selecting || switching}
        onClick={handleSelect}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            handleSelect()
          }
        }}
        className={cn(
          'group relative rounded-2xl backdrop-blur-3xl border px-4 pt-3 pb-2 cursor-pointer transition-all duration-200',
          isCurrent
            ? 'border-stroke-profile-active bg-profile-active hover:bg-profile-active/90'
            : 'border-stroke-profile-inactive bg-profile-inactive hover:bg-accent/60',
          selecting && 'opacity-60 scale-[0.98]',
          switching && 'cursor-wait'
        )}
      >
        <div ref={setNodeRef} {...attributes} {...listeners} className="w-full h-full">
          {/* Header: logo + name + menu */}
          <div className="flex items-center gap-2">
            {info.logo && (
              <img
                src={info.logo}
                alt=""
                className="size-7 rounded-full object-cover shrink-0"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            )}
            <h3 title={info.name} className="text-sm font-semibold truncate flex-1 leading-tight">
              {info.name}
            </h3>
            <div
              className="shrink-0 -mr-1 flex items-center"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {info.type === 'remote' && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => onMenuAction('update')}
                  disabled={updating}
                >
                  <RefreshCcw
                    className={cn('text-base text-muted-foreground', updating && 'animate-spin')}
                  />
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-sm" variant="ghost">
                    <EllipsisVertical className="text-base text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  {menuItems.map((item) => (
                    <React.Fragment key={item.key}>
                      <DropdownMenuItem
                        variant={item.variant}
                        onClick={() => onMenuAction(item.key)}
                      >
                        {item.icon}
                        {item.label}
                      </DropdownMenuItem>
                      {item.showDivider && <DropdownMenuSeparator />}
                    </React.Fragment>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Stats: traffic remaining | days remaining */}
          <div className="grid grid-cols-2 mt-2">
            <div className="pr-3 border-r border-foreground/10 justify-items-center">
              <div className="text-[11px] text-muted-foreground">
                {t('profile.trafficRemaining')}
              </div>
              <div className="text-sm font-bold mt-0.5 leading-tight">
                {hasLimit ? trafficRemaining : <InfinityIcon className="size-5" />}
              </div>
            </div>
            <div className="pl-3 justify-items-center">
              <div className="text-[11px] text-muted-foreground">
                {t('profile.daysRemaining')}
              </div>
              <div className="text-sm font-bold mt-0.5 leading-tight">
                {extra?.expire ? daysRemaining : <InfinityIcon className="size-5" />}
              </div>
            </div>
          </div>


          {/* Footer */}
          <div className="border-t border-foreground/10 mt-3 pt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            {info.type === 'remote' ? (
              <>
                <span>
                  {t('profile.updatedAt')}: {updatedFromNow}
                </span>
                {intervalLabel && (
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {intervalLabel}
                  </span>
                )}
              </>
            ) : (
              <span>{t('profile.localProfileLabel')}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProfileItem
