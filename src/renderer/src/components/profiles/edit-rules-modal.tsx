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
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Textarea } from '@renderer/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'
import { Separator } from '@renderer/components/ui/separator'
import { Spinner } from '@renderer/components/ui/spinner'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@renderer/components/ui/command'
import { Tooltip, TooltipTrigger, TooltipContent } from '@renderer/components/ui/tooltip'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent
} from '@renderer/components/ui/accordion'
import { cn } from '@renderer/lib/utils'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
  defaultAnimateLayoutChanges,
  type AnimateLayoutChanges
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowDownToLine,
  ArrowUpToLine,
  CheckIcon,
  ChevronsUpDownIcon,
  Code,
  GripVertical,
  Trash2,
  Undo2,
  XIcon
} from 'lucide-react'
import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  startTransition,
  memo,
  useRef
} from 'react'
import { createPortal, flushSync } from 'react-dom'
import { getProfileStr, setRuleStr, getRuleStr, mihomoHotReloadConfig } from '@renderer/utils/ipc'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { useTranslation } from 'react-i18next'
import yaml from 'js-yaml'
import { platform } from '@renderer/utils/init'
import { BaseEditor } from '@renderer/components/base/base-editor-lazy'

interface Props {
  id: string
  onClose: () => void
}

interface RuleItem {
  id: string
  type: string
  payload: string
  proxy: string
  additionalParams?: string[]
  offset?: number
}

type RuleDraft = Omit<RuleItem, 'id'>

const createRuleId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `rule-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
}

const sortableAnimateLayoutChanges: AnimateLayoutChanges = (args) => {
  if (args.wasDragging) return false
  return defaultAnimateLayoutChanges(args)
}

const logicalRuleTypes = new Set(['AND', 'OR', 'NOT'])

const isLogicalRuleType = (ruleType: string): boolean => logicalRuleTypes.has(ruleType)

const splitByTopLevelCommas = (value: string): string[] => {
  const parts: string[] = []
  let current = ''
  let depth = 0

  for (const char of value) {
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }

    if (char === '(') {
      depth += 1
    } else if (char === ')') {
      depth = Math.max(0, depth - 1)
    }

    current += char
  }

  parts.push(current)
  return parts
}

const isFullyWrappedByParentheses = (value: string): boolean => {
  if (!value.startsWith('(') || !value.endsWith(')')) return false

  let depth = 0
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (char === '(') depth += 1
    if (char === ')') depth -= 1

    if (depth < 0) return false
    if (depth === 0 && index < value.length - 1) return false
  }

  return depth === 0
}

const unwrapFullyWrappedParentheses = (value: string): string => {
  let result = value.trim()
  while (isFullyWrappedByParentheses(result)) {
    result = result.slice(1, -1).trim()
  }
  return result
}

const getLogicalRuleClauses = (payload: string): string[] => {
  const normalizedPayload = unwrapFullyWrappedParentheses(payload)
  if (!normalizedPayload) return []

  return splitByTopLevelCommas(normalizedPayload)
    .map((clause) => unwrapFullyWrappedParentheses(clause))
    .map((clause) => clause.trim())
    .filter(Boolean)
}

const formatLogicalRuleClause = (clause: string): string => {
  const clauseParts = splitByTopLevelCommas(clause).map((part) => part.trim())
  if (clauseParts.length <= 1) return clause

  const [clauseType, ...clauseValues] = clauseParts
  return clauseValues.length > 0 ? `${clauseType}: ${clauseValues.join(', ')}` : clauseType
}

const parseRuleStringToItem = (ruleStr: string): RuleItem => {
  const parts = splitByTopLevelCommas(ruleStr).map((part) => part.trim())
  const firstPartIsNumber = parts.length >= 3 && parts[0] !== '' && !Number.isNaN(Number(parts[0]))

  const offset = firstPartIsNumber ? Number.parseInt(parts[0], 10) : undefined
  const ruleParts = firstPartIsNumber ? parts.slice(1) : parts
  const [type = '', payload = '', proxy = '', ...additionalParamsRaw] = ruleParts

  if (type === 'MATCH') {
    return {
      id: createRuleId(),
      type: 'MATCH',
      payload: '',
      proxy: payload,
      offset: offset && offset > 0 ? offset : undefined
    }
  }

  return {
    id: createRuleId(),
    type,
    payload,
    proxy,
    additionalParams: additionalParamsRaw.filter(Boolean),
    offset: offset && offset > 0 ? offset : undefined
  }
}

const domainValidator = (value: string): boolean => {
  if (value.length > 253 || value.length < 2) return false

  return (
    new RegExp('^(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)\\.)+[a-zA-Z]{2,}$').test(
      value
    ) || ['localhost', 'local', 'localdomain'].includes(value.toLowerCase())
  )
}

const domainSuffixValidator = (value: string): boolean => {
  return new RegExp(
    '^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.[a-zA-Z]{2,}$'
  ).test(value)
}

const domainKeywordValidator = (value: string): boolean => {
  return value.length > 0 && !value.includes(',') && !value.includes(' ')
}

const domainRegexValidator = (value: string): boolean => {
  try {
    new RegExp(value)
    return true
  } catch {
    return false
  }
}

const portValidator = (value: string): boolean => {
  return new RegExp(
    '^(?:[1-9]\\d{0,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$'
  ).test(value)
}

const ipv4CIDRValidator = (value: string): boolean => {
  return new RegExp(
    '^(?:(?:[1-9]?[0-9]|1[0-9][0-9]|2(?:[0-4][0-9]|5[0-5]))\\.){3}(?:[1-9]?[0-9]|1[0-9][0-9]|2(?:[0-4][0-9]|5[0-5]))(?:\\/(?:[12]?[0-9]|3[0-2]))$'
  ).test(value)
}

const ipv6CIDRValidator = (value: string): boolean => {
  return new RegExp(
    '^([0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){7}|::|:(?::[0-9a-fA-F]{1,4}){1,6}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,5}|(?:[0-9a-fA-F]{1,4}:){2}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){3}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){4}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){5}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,6}:)\\/(?:12[0-8]|1[01][0-9]|[1-9]?[0-9])$'
  ).test(value)
}

// 内置路由规则 https://wiki.metacubex.one/config/rules/
const ruleDefinitionsMap = new Map<
  string,
  {
    name: string
    required?: boolean
    example?: string
    noResolve?: boolean
    src?: boolean
    validator?: (value: string) => boolean
  }
>([
  [
    'DOMAIN',
    {
      name: 'DOMAIN',
      example: 'example.com',
      validator: (value) => domainValidator(value)
    }
  ],
  [
    'DOMAIN-SUFFIX',
    {
      name: 'DOMAIN-SUFFIX',
      example: 'example.com',
      validator: (value) => domainSuffixValidator(value)
    }
  ],
  [
    'DOMAIN-KEYWORD',
    {
      name: 'DOMAIN-KEYWORD',
      example: 'example',
      validator: (value) => domainKeywordValidator(value)
    }
  ],
  [
    'DOMAIN-REGEX',
    {
      name: 'DOMAIN-REGEX',
      example: 'example.*',
      validator: (value) => domainRegexValidator(value)
    }
  ],
  [
    'GEOSITE',
    {
      name: 'GEOSITE',
      example: 'youtube'
    }
  ],
  [
    'GEOIP',
    {
      name: 'GEOIP',
      example: 'CN',
      noResolve: true,
      src: true
    }
  ],
  [
    'SRC-GEOIP',
    {
      name: 'SRC-GEOIP',
      example: 'CN'
    }
  ],
  [
    'IP-ASN',
    {
      name: 'IP-ASN',
      example: '13335',
      noResolve: true,
      src: true,
      validator: (value) => !!+value
    }
  ],
  [
    'SRC-IP-ASN',
    {
      name: 'SRC-IP-ASN',
      example: '9808',
      validator: (value) => !!+value
    }
  ],
  [
    'IP-CIDR',
    {
      name: 'IP-CIDR',
      example: '127.0.0.0/8',
      noResolve: true,
      src: true,
      validator: (value) => ipv4CIDRValidator(value) || ipv6CIDRValidator(value)
    }
  ],
  [
    'IP-CIDR6',
    {
      name: 'IP-CIDR6',
      example: '2620:0:2d0:200::7/32',
      noResolve: true,
      src: true,
      validator: (value) => ipv4CIDRValidator(value) || ipv6CIDRValidator(value)
    }
  ],
  [
    'SRC-IP-CIDR',
    {
      name: 'SRC-IP-CIDR',
      example: '192.168.1.201/32',
      validator: (value) => ipv4CIDRValidator(value) || ipv6CIDRValidator(value)
    }
  ],
  [
    'IP-SUFFIX',
    {
      name: 'IP-SUFFIX',
      example: '8.8.8.8/24',
      noResolve: true,
      src: true,
      validator: (value) => ipv4CIDRValidator(value) || ipv6CIDRValidator(value)
    }
  ],
  [
    'SRC-IP-SUFFIX',
    {
      name: 'SRC-IP-SUFFIX',
      example: '192.168.1.201/8',
      validator: (value) => ipv4CIDRValidator(value) || ipv6CIDRValidator(value)
    }
  ],
  [
    'SRC-PORT',
    {
      name: 'SRC-PORT',
      example: '7777',
      validator: (value) => portValidator(value)
    }
  ],
  [
    'DST-PORT',
    {
      name: 'DST-PORT',
      example: '80',
      validator: (value) => portValidator(value)
    }
  ],
  [
    'IN-PORT',
    {
      name: 'IN-PORT',
      example: '7897',
      validator: (value) => portValidator(value)
    }
  ],
  [
    'DSCP',
    {
      name: 'DSCP',
      example: '4'
    }
  ],
  [
    'PROCESS-NAME',
    {
      name: 'PROCESS-NAME',
      example: platform === 'win32' ? 'chrome.exe' : 'curl'
    }
  ],
  [
    'PROCESS-PATH',
    {
      name: 'PROCESS-PATH',
      example:
        platform === 'win32'
          ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
          : '/usr/bin/wget'
    }
  ],
  [
    'PROCESS-NAME-REGEX',
    {
      name: 'PROCESS-NAME-REGEX',
      example: '.*telegram.*'
    }
  ],
  [
    'PROCESS-PATH-REGEX',
    {
      name: 'PROCESS-PATH-REGEX',
      example: platform === 'win32' ? '(?i).*Application\\chrome.*' : '.*bin/wget'
    }
  ],
  [
    'NETWORK',
    {
      name: 'NETWORK',
      example: 'udp',
      validator: (value) => ['tcp', 'udp'].includes(value)
    }
  ],
  [
    'UID',
    {
      name: 'UID',
      example: '1001',
      validator: (value) => !!+value
    }
  ],
  [
    'IN-TYPE',
    {
      name: 'IN-TYPE',
      example: 'SOCKS/HTTP'
    }
  ],
  [
    'IN-USER',
    {
      name: 'IN-USER',
      example: 'mihomo'
    }
  ],
  [
    'IN-NAME',
    {
      name: 'IN-NAME',
      example: 'ss'
    }
  ],
  [
    'SUB-RULE',
    {
      name: 'SUB-RULE',
      example: '(NETWORK,tcp)'
    }
  ],
  [
    'RULE-SET',
    {
      name: 'RULE-SET',
      example: 'providername',
      noResolve: true,
      src: true
    }
  ],
  [
    'AND',
    {
      name: 'AND',
      example: '((DOMAIN,baidu.com),(NETWORK,UDP))',
      validator: (value) => getLogicalRuleClauses(value).length >= 2
    }
  ],
  [
    'OR',
    {
      name: 'OR',
      example: '((NETWORK,UDP),(DOMAIN,baidu.com))',
      validator: (value) => getLogicalRuleClauses(value).length >= 2
    }
  ],
  [
    'NOT',
    {
      name: 'NOT',
      example: '((DOMAIN,baidu.com))',
      validator: (value) => getLogicalRuleClauses(value).length >= 1
    }
  ],
  [
    'MATCH',
    {
      name: 'MATCH',
      required: false
    }
  ]
])

const ruleTypes = Array.from(ruleDefinitionsMap.keys())

const isRuleSupportsNoResolve = (ruleType: string): boolean => {
  const rule = ruleDefinitionsMap.get(ruleType)
  return rule?.noResolve === true
}

const isRuleSupportsSrc = (ruleType: string): boolean => {
  const rule = ruleDefinitionsMap.get(ruleType)
  return rule?.src === true
}

const getRuleExample = (ruleType: string): string => {
  const rule = ruleDefinitionsMap.get(ruleType)
  return rule?.example || ''
}

const isAddRuleDisabled = (
  newRule: RuleDraft,
  validateRulePayload: (ruleType: string, payload: string) => boolean
): boolean => {
  return (
    !(newRule.payload.trim() || newRule.type === 'MATCH') ||
    !newRule.type ||
    !newRule.proxy ||
    (newRule.type !== 'MATCH' &&
      newRule.payload.trim() !== '' &&
      !validateRulePayload(newRule.type, newRule.payload))
  )
}

// Rule list item
interface RuleListItemProps {
  rule: RuleItem
  originalIndex: number
  isDeleted: boolean
  isCustom: boolean
  sortableId: string
  isDragDisabled: boolean
  onRemove: (index: number) => void
  isEditing: boolean
  editingRule: RuleItem | null
  onStartEditing: (index: number) => void
  onCancelEditing: () => void
  onConfirmEditing: () => void
  onEditingRuleChange: (rule: RuleItem) => void
  proxyGroups: string[]
}

interface RuleDisplayContentProps {
  rule: RuleItem
  isDeleted: boolean
  showDragHandle: boolean
  isOverlay?: boolean
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>
}

const RuleDisplayContent: React.FC<RuleDisplayContentProps> = ({
  rule,
  isDeleted,
  showDragHandle,
  isOverlay = false,
  dragHandleProps
}) => {
  const isLogicalRule = isLogicalRuleType(rule.type)
  const logicalRuleClauses = isLogicalRule ? getLogicalRuleClauses(rule.payload) : []
  const logicalRuleSummary = logicalRuleClauses.map(formatLogicalRuleClause)
  const logicalRulePreview = logicalRuleSummary.slice(0, 2).join(' • ')
  const hiddenClausesCount = Math.max(0, logicalRuleSummary.length - 2)
  const logicalRuleContent =
    logicalRuleSummary.length > 0
      ? `${logicalRulePreview}${hiddenClausesCount > 0 ? ` • +${hiddenClausesCount}` : ''}`
      : rule.payload || '-'
  const logicalRuleContentTitle =
    logicalRuleSummary.length > 0 ? logicalRuleSummary.join(' • ') : rule.payload || '-'
  const primaryContent = isLogicalRule
    ? logicalRuleContent
    : rule.type === 'MATCH'
      ? rule.proxy
      : rule.payload
  const primaryContentTitle = isLogicalRule
    ? logicalRuleContentTitle
    : rule.type === 'MATCH'
      ? rule.proxy
      : rule.payload

  return (
    <>
      {showDragHandle && (
        <div
          className={cn(
            'cursor-grab active:cursor-grabbing text-muted-foreground/50 transition-colors touch-none',
            isOverlay ? 'text-muted-foreground/70 cursor-grabbing' : 'hover:text-muted-foreground'
          )}
          {...dragHandleProps}
        >
          <GripVertical className="size-4" />
        </div>
      )}

      {/* Type badge + additional params */}
      <div className="flex flex-col gap-1">
        <Badge variant="secondary" className="text-[11px]">
          {rule.type}
        </Badge>
        {rule.additionalParams && rule.additionalParams.length > 0 && (
          <div className="flex gap-0.5">
            {rule.additionalParams.map((param, idx) => (
              <Badge key={idx} variant="outline" className="text-[10px] px-1 py-0">
                {param}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Payload + proxy */}
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            'text-sm font-medium truncate',
            isDeleted && 'line-through text-muted-foreground'
          )}
          title={primaryContentTitle}
        >
          {primaryContent}
        </div>
        {rule.proxy && rule.type !== 'MATCH' && (
          <div
            className={cn('text-xs text-muted-foreground truncate', isDeleted && 'line-through')}
          >
            {rule.proxy}
          </div>
        )}
      </div>
    </>
  )
}

const RuleListItemBase: React.FC<RuleListItemProps> = ({
  rule,
  originalIndex,
  isDeleted,
  isCustom,
  sortableId,
  isDragDisabled,
  onRemove,
  isEditing,
  editingRule,
  onStartEditing,
  onCancelEditing,
  onConfirmEditing,
  onEditingRuleChange,
  proxyGroups
}) => {
  const { t } = useTranslation()
  const [proxyPopoverOpen, setProxyPopoverOpen] = useState(false)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform: tf,
    transition,
    isDragging
  } = useSortable({
    id: sortableId,
    disabled: isDragDisabled || isDeleted || isEditing,
    animateLayoutChanges: sortableAnimateLayoutChanges,
    transition: {
      duration: 220,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)'
    }
  })
  const transform = !isDragging && tf ? { x: tf.x, y: tf.y, scaleX: 1, scaleY: 1 } : null
  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition
  }

  // Inline editing mode
  if (isEditing && editingRule) {
    const isEditingLogicalRule = isLogicalRuleType(editingRule.type)

    const handleEditKeyDown = (e: React.KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancelEditing()
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onConfirmEditing()
      } else if (e.key === 'Enter' && !e.shiftKey && !isEditingLogicalRule) {
        e.preventDefault()
        onConfirmEditing()
      }
    }

    const handleEditParamChange = (param: string, checked: boolean): void => {
      let params = [...(editingRule.additionalParams || [])]
      if (checked) {
        if (!params.includes(param)) params.push(param)
      } else {
        params = params.filter((p) => p !== param)
      }
      onEditingRuleChange({ ...editingRule, additionalParams: params })
    }

    const typeSelect = (
      <Select
        value={editingRule.type}
        onValueChange={(v) => {
          const noResolve = isRuleSupportsNoResolve(v)
          const src = isRuleSupportsSrc(v)
          let params = [...(editingRule.additionalParams || [])]
          if (!noResolve) params = params.filter((p) => p !== 'no-resolve')
          if (!src) params = params.filter((p) => p !== 'src')
          onEditingRuleChange({ ...editingRule, type: v, additionalParams: params })
        }}
      >
        <SelectTrigger className="w-full h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-60" style={{ maxHeight: 240 }} position="popper">
          {ruleTypes.map((type) => (
            <SelectItem key={type} value={type}>
              {type}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )

    const proxySelector = (
      <Popover modal open={proxyPopoverOpen} onOpenChange={setProxyPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-between font-normal h-8 text-xs">
            <span className="truncate">{editingRule.proxy}</span>
            <ChevronsUpDownIcon className="ml-1 size-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-50" align="start">
          <Command>
            <CommandInput placeholder={t('profile.editRules.proxyPlaceholder')} />
            <CommandList>
              <CommandEmpty>No results</CommandEmpty>
              <CommandGroup>
                {proxyGroups.map((group) => (
                  <CommandItem
                    key={group}
                    value={group}
                    onSelect={(v) => {
                      onEditingRuleChange({ ...editingRule, proxy: v })
                      setProxyPopoverOpen(false)
                    }}
                  >
                    {group}
                    <CheckIcon
                      className={cn(
                        'ml-auto size-3',
                        editingRule.proxy === group ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    )

    const additionalParamsControls = (
      <>
        {isRuleSupportsNoResolve(editingRule.type) && (
          <div className="flex items-center gap-1.5">
            <Switch
              size="sm"
              checked={editingRule.additionalParams?.includes('no-resolve') || false}
              onCheckedChange={(checked) => handleEditParamChange('no-resolve', checked)}
            />
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">no-resolve</span>
          </div>
        )}
        {isRuleSupportsSrc(editingRule.type) && (
          <div className="flex items-center gap-1.5">
            <Switch
              size="sm"
              checked={editingRule.additionalParams?.includes('src') || false}
              onCheckedChange={(checked) => handleEditParamChange('src', checked)}
            />
            <span className="text-[10px] text-muted-foreground">src</span>
          </div>
        )}
      </>
    )

    return (
      <div
        ref={setNodeRef}
        style={sortableStyle}
        className="p-3 rounded-xl border-2 border-primary/50 bg-primary/5 flex flex-col gap-2 animate-in fade-in-0 duration-150"
        onKeyDown={handleEditKeyDown}
      >
        {isEditingLogicalRule ? (
          <>
            <div className="grid grid-cols-[180px_minmax(0,1fr)] gap-2 items-start">
              <div className="flex flex-col gap-2">
                {typeSelect}
                {proxySelector}
              </div>
              <div className="flex-1 flex flex-col gap-1">
                <Textarea
                  className="min-h-18 text-xs leading-5 font-mono resize-y"
                  value={editingRule.payload}
                  onChange={(e) => onEditingRuleChange({ ...editingRule, payload: e.target.value })}
                  placeholder={getRuleExample(editingRule.type) || ''}
                  disabled={editingRule.type === 'MATCH'}
                  autoFocus
                />
                <p className="text-[10px] text-muted-foreground">Ctrl/Cmd + Enter to save</p>
              </div>
            </div>

            {/* Row 2: Params + actions */}
            <div className="flex items-center gap-2">
              {additionalParamsControls}

              <div className="flex-1" />
              <Button size="xs" variant="ghost" onClick={onCancelEditing}>
                <XIcon className="size-3" />
                {t('common.cancel')}
              </Button>
              <Button size="xs" onClick={onConfirmEditing}>
                <CheckIcon className="size-3" />
                {t('common.save')}
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Row 1: Type + Payload */}
            <div className="flex gap-2">
              <div className="w-45 shrink-0">{typeSelect}</div>
              <Input
                className="flex-1 h-8 text-xs"
                value={editingRule.payload}
                onChange={(e) => onEditingRuleChange({ ...editingRule, payload: e.target.value })}
                placeholder={getRuleExample(editingRule.type) || ''}
                disabled={editingRule.type === 'MATCH'}
                autoFocus
              />
            </div>

            {/* Row 2: Proxy + params + actions */}
            <div className="flex items-center gap-2">
              <div className="w-45 shrink-0">{proxySelector}</div>

              {additionalParamsControls}

              <div className="flex-1" />
              <Button size="xs" variant="ghost" onClick={onCancelEditing}>
                <XIcon className="size-3" />
                {t('common.cancel')}
              </Button>
              <Button size="xs" onClick={onConfirmEditing}>
                <CheckIcon className="size-3" />
                {t('common.save')}
              </Button>
            </div>
          </>
        )}
      </div>
    )
  }

  // Display mode
  return (
    <div
      ref={setNodeRef}
      style={sortableStyle}
      className={cn(
        'flex items-center gap-2 p-2.5 rounded-xl border group transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out',
        isDeleted && 'bg-destructive/10 opacity-70 border-destructive/20 cursor-not-allowed',
        !isDeleted &&
          isCustom &&
          'bg-green-500/8 border-green-500/20 hover:border-green-500/40 cursor-pointer',
        !isDeleted &&
          !isCustom &&
          'bg-muted/50 border-transparent hover:border-border cursor-pointer',
        isDragging && 'opacity-0 pointer-events-none'
      )}
      onClick={() => !isDeleted && originalIndex !== -1 && onStartEditing(originalIndex)}
    >
      <RuleDisplayContent
        rule={rule}
        isDeleted={isDeleted}
        showDragHandle={!isDeleted && !isDragDisabled}
        dragHandleProps={{
          ...attributes,
          ...listeners,
          onClick: (e) => e.stopPropagation()
        }}
      />

      {/* Delete/Restore button - visible on hover */}
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              className={
                originalIndex !== -1 && isDeleted
                  ? 'text-green-500 hover:text-green-600'
                  : 'text-destructive hover:text-destructive/80'
              }
              onClick={(e) => {
                e.stopPropagation()
                originalIndex !== -1 && onRemove(originalIndex)
              }}
            >
              {originalIndex !== -1 && isDeleted ? <Undo2 /> : <Trash2 />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {originalIndex !== -1 && isDeleted
              ? t('profile.editRules.restore')
              : t('profile.editRules.delete')}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

const RuleListItem = memo(RuleListItemBase, (prevProps, nextProps) => {
  return (
    prevProps.rule === nextProps.rule &&
    prevProps.originalIndex === nextProps.originalIndex &&
    prevProps.isDeleted === nextProps.isDeleted &&
    prevProps.isCustom === nextProps.isCustom &&
    prevProps.sortableId === nextProps.sortableId &&
    prevProps.isDragDisabled === nextProps.isDragDisabled &&
    prevProps.isEditing === nextProps.isEditing &&
    prevProps.editingRule === nextProps.editingRule &&
    prevProps.proxyGroups === nextProps.proxyGroups
  )
})

RuleListItem.displayName = 'RuleListItem'

const EditRulesModal: React.FC<Props> = (props) => {
  const { id, onClose } = props
  const { profileConfig } = useProfileConfig()
  const isCurrentProfile = profileConfig?.current === id
  const dialogCloseRef = useRef<HTMLButtonElement>(null)
  const [rules, setRules] = useState<RuleItem[]>([])
  const [profileContent, setProfileContent] = useState('')
  const [newRule, setNewRule] = useState<RuleDraft>({
    type: 'DOMAIN',
    payload: '',
    proxy: 'DIRECT',
    additionalParams: []
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [deferredSearchTerm, setDeferredSearchTerm] = useState('')
  const [proxyGroups, setProxyGroups] = useState<string[]>([])
  const [deletedRules, setDeletedRules] = useState<Set<number>>(new Set())
  const [prependRules, setPrependRules] = useState<Set<number>>(new Set())
  const [appendRules, setAppendRules] = useState<Set<number>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingRule, setEditingRule] = useState<RuleItem | null>(null)
  const [newRuleProxyOpen, setNewRuleProxyOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeDragSize, setActiveDragSize] = useState<{ width: number; height: number } | null>(
    null
  )
  const [isYamlMode, setIsYamlMode] = useState(false)
  const [yamlContent, setYamlContent] = useState('')
  const { t } = useTranslation()

  const ruleIndexMap = useMemo(() => {
    const map = new Map<RuleItem, number>()
    rules.forEach((rule, index) => {
      map.set(rule, index)
    })
    return map
  }, [rules])

  const filteredRules = useMemo(() => {
    if (deferredSearchTerm === '') return rules

    const lowerSearch = deferredSearchTerm.toLowerCase()
    return rules.filter(
      (rule) =>
        rule.type.toLowerCase().includes(lowerSearch) ||
        rule.payload.toLowerCase().includes(lowerSearch) ||
        (rule.proxy && rule.proxy.toLowerCase().includes(lowerSearch)) ||
        (rule.additionalParams &&
          rule.additionalParams.some((param) => param.toLowerCase().includes(lowerSearch)))
    )
  }, [deferredSearchTerm, rules])

  useEffect(() => {
    startTransition(() => {
      setDeferredSearchTerm(searchTerm)
    })
    // Cancel editing when search changes
    if (searchTerm) {
      setEditingIndex(null)
      setEditingRule(null)
    }
  }, [searchTerm])

  // Check if rule is custom (added by user, not from profile)
  const isCustomRule = useCallback(
    (index: number): boolean => {
      return prependRules.has(index) || appendRules.has(index)
    },
    [prependRules, appendRules]
  )

  // Count custom rules for the header badge
  const customRulesCount = useMemo(
    () => prependRules.size + appendRules.size,
    [prependRules, appendRules]
  )

  // 解析规则字符串
  const parseRuleString = useCallback((ruleStr: string): RuleItem => {
    return parseRuleStringToItem(ruleStr)
  }, [])

  // 处理前置规则位置
  const processRulesWithPositions = useCallback(
    (
      rulesToProcess: RuleItem[],
      allRules: RuleItem[],
      positionCalculator: (rule: RuleItem, currentRules: RuleItem[]) => number
    ): { updatedRules: RuleItem[]; ruleIndices: Set<number> } => {
      const updatedRules = [...allRules]
      const ruleIndices = new Set<number>()

      rulesToProcess.forEach((rule) => {
        const targetPosition = positionCalculator(rule, updatedRules)
        const actualPosition = Math.min(targetPosition, updatedRules.length)
        updatedRules.splice(actualPosition, 0, rule)

        const newRuleIndices = new Set<number>()
        ruleIndices.forEach((idx) => {
          if (idx >= actualPosition) {
            newRuleIndices.add(idx + 1)
          } else {
            newRuleIndices.add(idx)
          }
        })
        newRuleIndices.add(actualPosition)

        ruleIndices.clear()
        newRuleIndices.forEach((idx) => ruleIndices.add(idx))
      })

      return { updatedRules, ruleIndices }
    },
    []
  )

  // 处理后置规则位置
  const processAppendRulesWithPositions = useCallback(
    (
      rulesToProcess: RuleItem[],
      allRules: RuleItem[],
      positionCalculator: (rule: RuleItem, currentRules: RuleItem[]) => number
    ): { updatedRules: RuleItem[]; ruleIndices: Set<number> } => {
      const updatedRules = [...allRules]
      const ruleIndices = new Set<number>()

      rulesToProcess.forEach((rule) => {
        const targetPosition = positionCalculator(rule, updatedRules)
        const actualPosition = Math.min(targetPosition, updatedRules.length)
        updatedRules.splice(actualPosition, 0, rule)

        const newRuleIndices = new Set<number>()
        ruleIndices.forEach((idx) => {
          if (idx >= actualPosition) {
            newRuleIndices.add(idx + 1)
          } else {
            newRuleIndices.add(idx)
          }
        })
        newRuleIndices.add(actualPosition)

        ruleIndices.clear()
        newRuleIndices.forEach((idx) => ruleIndices.add(idx))
      })

      return { updatedRules, ruleIndices }
    },
    []
  )

  useEffect(() => {
    const loadContent = async (): Promise<void> => {
      setIsLoading(true)
      try {
        const content = await getProfileStr(id)
        setProfileContent(content)

        const parsed = yaml.load(content) as Record<string, unknown> | undefined
        let initialRules: RuleItem[] = []

        if (parsed && parsed.rules && Array.isArray(parsed.rules)) {
          initialRules = parsed.rules.map((rule: string) => parseRuleStringToItem(rule))
        }

        if (parsed) {
          const groups: string[] = []

          if (Array.isArray(parsed['proxy-groups'])) {
            groups.push(
              ...((parsed['proxy-groups'] as Array<Record<string, unknown>>)
                .map((group) =>
                  group && typeof group['name'] === 'string' ? (group['name'] as string) : ''
                )
                .filter(Boolean) as string[])
            )
          }

          if (Array.isArray(parsed['proxies'])) {
            groups.push(
              ...((parsed['proxies'] as Array<Record<string, unknown>>)
                .map((proxy) =>
                  proxy && typeof proxy['name'] === 'string' ? (proxy['name'] as string) : ''
                )
                .filter(Boolean) as string[])
            )
          }

          groups.push('DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE')
          setProxyGroups([...new Set(groups)])
        }

        try {
          const ruleContent = await getRuleStr(id)
          const ruleData = yaml.load(ruleContent) as {
            prepend?: string[]
            append?: string[]
            delete?: string[]
          }

          if (ruleData) {
            let allRules = [...initialRules]
            const newPrependRules = new Set<number>()
            const newAppendRules = new Set<number>()
            const newDeletedRules = new Set<number>()

            if (ruleData.prepend && Array.isArray(ruleData.prepend)) {
              const prependRuleItems: RuleItem[] = []
              ruleData.prepend.forEach((ruleStr: string) => {
                prependRuleItems.push(parseRuleString(ruleStr))
              })

              let prependInsertCount = 0
              const { updatedRules, ruleIndices } = processRulesWithPositions(
                prependRuleItems,
                allRules,
                (rule, currentRules) => {
                  if (rule.offset !== undefined && rule.offset < currentRules.length) {
                    return rule.offset
                  }
                  return prependInsertCount++
                }
              )

              allRules = updatedRules
              ruleIndices.forEach((index) => newPrependRules.add(index))
            }

            if (ruleData.append && Array.isArray(ruleData.append)) {
              const appendRuleItems: RuleItem[] = []
              ruleData.append.forEach((ruleStr: string) => {
                appendRuleItems.push(parseRuleString(ruleStr))
              })

              const { updatedRules, ruleIndices } = processAppendRulesWithPositions(
                appendRuleItems,
                allRules,
                (rule, currentRules) => {
                  if (rule.offset !== undefined) {
                    return Math.max(0, currentRules.length - rule.offset)
                  }
                  return currentRules.length
                }
              )

              allRules = updatedRules
              ruleIndices.forEach((index) => newAppendRules.add(index))
            }

            if (ruleData.delete && Array.isArray(ruleData.delete)) {
              const deleteRules = ruleData.delete.map((ruleStr: string) => {
                return parseRuleString(ruleStr)
              })

              deleteRules.forEach((deleteRule) => {
                const matchedIndex = allRules.findIndex(
                  (rule) =>
                    rule.type === deleteRule.type &&
                    rule.payload === deleteRule.payload &&
                    rule.proxy === deleteRule.proxy &&
                    JSON.stringify(rule.additionalParams || []) ===
                      JSON.stringify(deleteRule.additionalParams || [])
                )

                if (matchedIndex !== -1) {
                  newDeletedRules.add(matchedIndex)
                }
              })
            }

            setPrependRules(newPrependRules)
            setAppendRules(newAppendRules)
            setDeletedRules(newDeletedRules)
            setRules(allRules)
          } else {
            setRules(initialRules)
            setPrependRules(new Set())
            setAppendRules(new Set())
            setDeletedRules(new Set())
          }
        } catch {
          setRules(initialRules)
          setPrependRules(new Set())
          setAppendRules(new Set())
          setDeletedRules(new Set())
        }
      } catch {
        // 解析配置文件失败，静默处理
      } finally {
        setIsLoading(false)
      }
    }
    loadContent()
  }, [id, parseRuleString, processRulesWithPositions, processAppendRulesWithPositions])

  const validateRulePayload = useCallback((ruleType: string, payload: string): boolean => {
    if (ruleType === 'MATCH') {
      return true
    }

    const rule = ruleDefinitionsMap.get(ruleType)
    const validator = rule?.validator
    if (!validator) {
      return true
    }

    return validator(payload)
  }, [])

  const isPayloadValid = useMemo(() => {
    if (newRule.type === 'MATCH' || !newRule.payload) {
      return true
    }
    return validateRulePayload(newRule.type, newRule.payload)
  }, [newRule.type, newRule.payload, validateRulePayload])
  const isNewRuleLogical = isLogicalRuleType(newRule.type)
  const newRuleLogicalSummary = useMemo(() => {
    if (!isNewRuleLogical) return []
    return getLogicalRuleClauses(newRule.payload).map(formatLogicalRuleClause)
  }, [isNewRuleLogical, newRule.payload])

  // Inline editing handlers
  const handleStartEditing = useCallback(
    (index: number) => {
      if (deletedRules.has(index)) return
      setEditingIndex(index)
      setEditingRule({ ...rules[index] })
    },
    [rules, deletedRules]
  )

  const handleCancelEditing = useCallback(() => {
    setEditingIndex(null)
    setEditingRule(null)
  }, [])

  const handleConfirmEditing = useCallback(() => {
    if (editingIndex === null || editingRule === null) return

    if (
      editingRule.type !== 'MATCH' &&
      editingRule.payload.trim() !== '' &&
      !validateRulePayload(editingRule.type, editingRule.payload)
    ) {
      toast.error(
        (t('profile.editRules.invalidPayload') || 'Invalid payload') +
          ': ' +
          getRuleExample(editingRule.type)
      )
      return
    }

    startTransition(() => {
      const updatedRules = [...rules]
      updatedRules[editingIndex] = { ...editingRule }
      setRules(updatedRules)
    })

    setEditingIndex(null)
    setEditingRule(null)
  }, [editingIndex, editingRule, rules, validateRulePayload, t])

  const handleEditingRuleChange = useCallback((rule: RuleItem) => {
    setEditingRule(rule)
  }, [])

  const closeWithAnimation = (): void => {
    dialogCloseRef.current?.click()
  }

  const serializeToYaml = useCallback((): string => {
    const prependRuleStrings = Array.from(prependRules)
      .sort((a, b) => a - b)
      .filter((index) => !deletedRules.has(index) && index < rules.length)
      .map((index) => convertRuleToString(rules[index]))

    const appendRuleStrings = Array.from(appendRules)
      .filter((index) => !deletedRules.has(index) && index < rules.length)
      .map((index) => convertRuleToString(rules[index]))

    const deletedRuleStrings = Array.from(deletedRules)
      .filter(
        (index) => index < rules.length && !prependRules.has(index) && !appendRules.has(index)
      )
      .map((index) => {
        const rule = rules[index]
        const parts = [rule.type]
        if (rule.payload) parts.push(rule.payload)
        if (rule.proxy) parts.push(rule.proxy)
        if (rule.additionalParams && rule.additionalParams.length > 0) {
          parts.push(...rule.additionalParams)
        }
        return parts.join(',')
      })

    return yaml.dump({ prepend: prependRuleStrings, append: appendRuleStrings, delete: deletedRuleStrings })
  }, [prependRules, appendRules, deletedRules, rules])

  const applyYamlToVisualState = useCallback(
    (yamlStr: string): boolean => {
      try {
        const ruleData = yaml.load(yamlStr) as {
          prepend?: string[]
          append?: string[]
          delete?: string[]
        } | null

        const parsed = yaml.load(profileContent) as Record<string, unknown> | undefined
        let initialRules: RuleItem[] = []
        if (parsed && parsed.rules && Array.isArray(parsed.rules)) {
          initialRules = parsed.rules.map((rule: string) => parseRuleStringToItem(rule))
        }

        if (ruleData && typeof ruleData === 'object') {
          let allRules = [...initialRules]
          const newPrependRules = new Set<number>()
          const newAppendRules = new Set<number>()
          const newDeletedRules = new Set<number>()

          if (ruleData.prepend && Array.isArray(ruleData.prepend)) {
            let prependInsertCount = 0
            const { updatedRules, ruleIndices } = processRulesWithPositions(
              ruleData.prepend.map((s) => parseRuleStringToItem(s)),
              allRules,
              (rule, currentRules) => {
                if (rule.offset !== undefined && rule.offset < currentRules.length) {
                  return rule.offset
                }
                return prependInsertCount++
              }
            )
            allRules = updatedRules
            ruleIndices.forEach((index) => newPrependRules.add(index))
          }

          if (ruleData.append && Array.isArray(ruleData.append)) {
            const { updatedRules, ruleIndices } = processAppendRulesWithPositions(
              ruleData.append.map((s) => parseRuleStringToItem(s)),
              allRules,
              (rule, currentRules) => {
                if (rule.offset !== undefined) {
                  return Math.max(0, currentRules.length - rule.offset)
                }
                return currentRules.length
              }
            )
            allRules = updatedRules
            ruleIndices.forEach((index) => newAppendRules.add(index))
          }

          if (ruleData.delete && Array.isArray(ruleData.delete)) {
            ruleData.delete
              .map((s) => parseRuleStringToItem(s))
              .forEach((deleteRule) => {
                const matchedIndex = allRules.findIndex(
                  (rule) =>
                    rule.type === deleteRule.type &&
                    rule.payload === deleteRule.payload &&
                    rule.proxy === deleteRule.proxy &&
                    JSON.stringify(rule.additionalParams || []) ===
                      JSON.stringify(deleteRule.additionalParams || [])
                )
                if (matchedIndex !== -1) {
                  newDeletedRules.add(matchedIndex)
                }
              })
          }

          setPrependRules(newPrependRules)
          setAppendRules(newAppendRules)
          setDeletedRules(newDeletedRules)
          setRules(allRules)
        } else {
          setRules(initialRules)
          setPrependRules(new Set())
          setAppendRules(new Set())
          setDeletedRules(new Set())
        }
        return true
      } catch (e) {
        toast.error(
          t('profile.editRules.invalidYaml') + ': ' + (e instanceof Error ? e.message : String(e))
        )
        return false
      }
    },
    [profileContent, processRulesWithPositions, processAppendRulesWithPositions, t]
  )

  const handleToggleYamlMode = useCallback(() => {
    if (!isYamlMode) {
      setYamlContent(serializeToYaml())
      setIsYamlMode(true)
    } else {
      if (applyYamlToVisualState(yamlContent)) {
        setIsYamlMode(false)
      }
    }
  }, [isYamlMode, serializeToYaml, applyYamlToVisualState, yamlContent])

  const handleSave = useCallback(async (): Promise<boolean> => {
    try {
      if (isYamlMode) {
        yaml.load(yamlContent)
        await setRuleStr(id, yamlContent)
        return true
      }

      const ruleYaml = serializeToYaml()
      await setRuleStr(id, ruleYaml)
      return true
    } catch (e) {
      toast.error(
        t('profile.editRules.saveError') + ': ' + (e instanceof Error ? e.message : String(e))
      )
      return false
    }
  }, [isYamlMode, yamlContent, serializeToYaml, id, t])

  const handleRuleTypeChange = (selected: string): void => {
    const noResolveSupported = isRuleSupportsNoResolve(selected)
    const srcSupported = isRuleSupportsSrc(selected)

    let additionalParams = [...(newRule.additionalParams || [])]
    if (!noResolveSupported) {
      additionalParams = additionalParams.filter((param) => param !== 'no-resolve')
    }
    if (!srcSupported) {
      additionalParams = additionalParams.filter((param) => param !== 'src')
    }

    setNewRule({
      ...newRule,
      type: selected,
      additionalParams: additionalParams.length > 0 ? additionalParams : []
    })
  }

  const handleAdditionalParamChange = (param: string, checked: boolean): void => {
    let newAdditionalParams = [...(newRule.additionalParams || [])]

    if (checked) {
      if (!newAdditionalParams.includes(param)) {
        newAdditionalParams.push(param)
      }
    } else {
      newAdditionalParams = newAdditionalParams.filter((p) => p !== param)
    }

    setNewRule({
      ...newRule,
      additionalParams: newAdditionalParams
    })
  }

  // 计算插入位置的索引
  const getUpdatedIndexForInsertion = (index: number, insertPosition: number): number => {
    if (index >= insertPosition) {
      return index + 1
    } else {
      return index
    }
  }

  // 插入规则后更新所有索引
  const updateAllRuleIndicesAfterInsertion = useCallback(
    (
      currentPrependRules: Set<number>,
      currentAppendRules: Set<number>,
      currentDeletedRules: Set<number>,
      insertPosition: number,
      isNewPrependRule: boolean = false,
      isNewAppendRule: boolean = false
    ): {
      newPrependRules: Set<number>
      newAppendRules: Set<number>
      newDeletedRules: Set<number>
    } => {
      const newPrependRules = new Set<number>()
      const newAppendRules = new Set<number>()
      const newDeletedRules = new Set<number>()

      currentPrependRules.forEach((idx) => {
        newPrependRules.add(getUpdatedIndexForInsertion(idx, insertPosition))
      })

      currentAppendRules.forEach((idx) => {
        newAppendRules.add(getUpdatedIndexForInsertion(idx, insertPosition))
      })

      currentDeletedRules.forEach((idx) => {
        newDeletedRules.add(getUpdatedIndexForInsertion(idx, insertPosition))
      })

      if (isNewPrependRule) {
        newPrependRules.add(insertPosition)
      }

      if (isNewAppendRule) {
        newAppendRules.add(insertPosition)
      }

      return { newPrependRules, newAppendRules, newDeletedRules }
    },
    []
  )

  const handleAddRule = useCallback(
    (position: 'prepend' | 'append' = 'append'): void => {
      if (!(newRule.type === 'MATCH' || newRule.payload.trim() !== '')) {
        return
      }

      if (
        newRule.type !== 'MATCH' &&
        newRule.payload.trim() !== '' &&
        !validateRulePayload(newRule.type, newRule.payload)
      ) {
        toast.error(t('profile.editRules.invalidPayload') + ': ' + getRuleExample(newRule.type))
        return
      }

      const newRuleItem: RuleItem = { ...newRule, id: createRuleId() }

      // Cancel any inline editing
      setEditingIndex(null)
      setEditingRule(null)

      startTransition(() => {
        let updatedRules: RuleItem[]

        if (position === 'prepend') {
          const insertPosition =
            newRuleItem.offset !== undefined ? Math.min(newRuleItem.offset, rules.length) : 0

          updatedRules = [...rules]
          updatedRules.splice(insertPosition, 0, newRuleItem)

          const { newPrependRules, newAppendRules, newDeletedRules } =
            updateAllRuleIndicesAfterInsertion(
              prependRules,
              appendRules,
              deletedRules,
              insertPosition,
              true
            )

          setPrependRules(newPrependRules)
          setAppendRules(newAppendRules)
          setDeletedRules(newDeletedRules)
        } else {
          let insertPosition: number
          if (newRuleItem.offset !== undefined) {
            insertPosition = Math.max(0, rules.length - newRuleItem.offset)
          } else {
            // Insert before the last MATCH rule, or at the end if no MATCH
            const lastMatchIndex = rules.findLastIndex((r) => r.type === 'MATCH')
            if (lastMatchIndex !== -1) {
              insertPosition = lastMatchIndex
              // Encode offset so the generated config also places the rule before MATCH
              newRuleItem.offset = rules.length - lastMatchIndex
            } else {
              insertPosition = rules.length
            }
          }

          updatedRules = [...rules]
          updatedRules.splice(insertPosition, 0, newRuleItem)

          const { newPrependRules, newAppendRules, newDeletedRules } =
            updateAllRuleIndicesAfterInsertion(
              prependRules,
              appendRules,
              deletedRules,
              insertPosition,
              false,
              true
            )

          setPrependRules(newPrependRules)
          setAppendRules(newAppendRules)
          setDeletedRules(newDeletedRules)
        }

        setRules(updatedRules)
      })
      setNewRule({ type: 'DOMAIN', payload: '', proxy: 'DIRECT', additionalParams: [] })
    },
    [
      newRule,
      rules,
      prependRules,
      appendRules,
      deletedRules,
      validateRulePayload,
      t,
      updateAllRuleIndicesAfterInsertion
    ]
  )

  const handleRemoveRule = useCallback((index: number): void => {
    setDeletedRules((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }, [])

  // Drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 1
      }
    })
  )

  const isDragEnabled = !deferredSearchTerm

  // Remap Set indices after arrayMove
  const remapIndicesAfterMove = useCallback(
    (set: Set<number>, oldIndex: number, newIndex: number): Set<number> => {
      const newSet = new Set<number>()
      set.forEach((idx) => {
        if (idx === oldIndex) {
          newSet.add(newIndex)
        } else if (oldIndex < newIndex) {
          // Moving down: indices in (oldIndex, newIndex] shift by -1
          if (idx > oldIndex && idx <= newIndex) {
            newSet.add(idx - 1)
          } else {
            newSet.add(idx)
          }
        } else {
          // Moving up: indices in [newIndex, oldIndex) shift by +1
          if (idx >= newIndex && idx < oldIndex) {
            newSet.add(idx + 1)
          } else {
            newSet.add(idx)
          }
        }
      })
      return newSet
    },
    []
  )

  const handleDragStart = useCallback((event: DragStartEvent): void => {
    setActiveId(String(event.active.id))
    const initialRect = event.active.rect.current.initial
    if (initialRect) {
      setActiveDragSize({
        width: initialRect.width,
        height: initialRect.height
      })
    }
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent): void => {
      const { active, over } = event
      if (!over || active.id === over.id) {
        setActiveId(null)
        setActiveDragSize(null)
        return
      }

      const activeRuleId = String(active.id)
      const overRuleId = String(over.id)
      const oldIndex = rules.findIndex((rule) => rule.id === activeRuleId)
      const newIndex = rules.findIndex((rule) => rule.id === overRuleId)
      if (oldIndex === -1 || newIndex === -1) return

      setEditingIndex(null)
      setEditingRule(null)

      const updatedRules = arrayMove([...rules], oldIndex, newIndex)

      // Update offset for the moved rule if it's prepend/append
      const movedRule = updatedRules[newIndex]
      if (prependRules.has(oldIndex) || appendRules.has(oldIndex)) {
        const delta = newIndex - oldIndex
        if (prependRules.has(oldIndex)) {
          updatedRules[newIndex] = {
            ...movedRule,
            offset: Math.max(0, (movedRule.offset || 0) + delta)
          }
        } else {
          updatedRules[newIndex] = {
            ...movedRule,
            offset: Math.max(0, (movedRule.offset || 0) - delta)
          }
        }
      }

      // Commit list reordering first, then remove the overlay.
      // This avoids a one-frame "return to old position" flicker on drop.
      flushSync(() => {
        setRules(updatedRules)
        setDeletedRules((prev) => remapIndicesAfterMove(prev, oldIndex, newIndex))
        setPrependRules((prev) => remapIndicesAfterMove(prev, oldIndex, newIndex))
        setAppendRules((prev) => remapIndicesAfterMove(prev, oldIndex, newIndex))
      })

      setActiveId(null)
      setActiveDragSize(null)
    },
    [rules, prependRules, appendRules, remapIndicesAfterMove]
  )

  const handleDragCancel = useCallback((): void => {
    setActiveId(null)
    setActiveDragSize(null)
  }, [])

  // Sortable IDs for the rule list
  const sortableIds = useMemo(() => rules.map((rule) => rule.id), [rules])
  const activeRule = activeId !== null ? (rules.find((rule) => rule.id === activeId) ?? null) : null
  const dragOverlayNode = (
    <DragOverlay dropAnimation={null} adjustScale={false}>
      {activeRule ? (
        <div
          className="flex items-center gap-2 p-2.5 rounded-xl border border-primary/40 bg-background/95 shadow-2xl ring-1 ring-primary/20 backdrop-blur-sm"
          style={
            activeDragSize
              ? {
                  width: activeDragSize.width,
                  minHeight: activeDragSize.height
                }
              : undefined
          }
        >
          <RuleDisplayContent rule={activeRule} isDeleted={false} showDragHandle isOverlay={true} />
          <div className="w-7 shrink-0" />
        </div>
      ) : null}
    </DragOverlay>
  )

  // 规则转字符串
  const convertRuleToString = (rule: RuleItem): string => {
    const parts = [rule.type]
    if (rule.payload) parts.push(rule.payload)
    if (rule.proxy) parts.push(rule.proxy)
    if (rule.additionalParams && rule.additionalParams.length > 0) {
      parts.push(...rule.additionalParams)
    }

    if (rule.offset !== undefined && rule.offset > 0) {
      parts.unshift(rule.offset.toString())
    }

    return parts.join(',')
  }

  // Check if a rule item is custom (for coloring)
  const isRuleCustom = useCallback(
    (rule: RuleItem): boolean => {
      const idx = ruleIndexMap.get(rule) ?? -1
      return isCustomRule(idx)
    },
    [ruleIndexMap, isCustomRule]
  )

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className="h-[calc(100vh-100px)] w-[calc(100vw-24px)] sm:w-[calc(100vw-80px)] max-w-none sm:max-w-none flex flex-col"
        showCloseButton={false}
      >
        <DialogHeader className="pb-0 app-drag">
          <div className="flex items-center justify-between">
            <DialogTitle>{t('profile.editRules.title')}</DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              className="app-nodrag"
              onClick={handleToggleYamlMode}
            >
              <Code className="size-4" />
              {isYamlMode ? t('profile.editRules.visualMode') : t('profile.editRules.yamlMode')}
            </Button>
          </div>
        </DialogHeader>
        <div className="h-full overflow-hidden">
          {isYamlMode ? (
            <div className="h-full">
              <BaseEditor
                language="yaml"
                value={yamlContent}
                onChange={(value) => setYamlContent(value)}
              />
            </div>
          ) : (
          <div className="flex gap-4 h-full">
            {/* Left panel - Rule form */}
            <div className="w-2/5 flex flex-col gap-3 pr-1 overflow-y-auto min-h-0">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>{t('profile.editRules.ruleType')}</Label>
                  <Select
                    value={newRule.type}
                    onValueChange={(value) => handleRuleTypeChange(value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                      className="max-h-60"
                      style={{ maxHeight: 240 }}
                      position="popper"
                    >
                      {ruleTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>{t('profile.editRules.payload')}</Label>
                  {isNewRuleLogical ? (
                    <Textarea
                      placeholder={
                        getRuleExample(newRule.type) || t('profile.editRules.payloadPlaceholder')
                      }
                      value={newRule.payload}
                      onChange={(e) => setNewRule({ ...newRule, payload: e.target.value })}
                      disabled={newRule.type === 'MATCH'}
                      className={cn(
                        'min-h-21 text-xs leading-5 font-mono resize-y',
                        newRule.payload && newRule.type !== 'MATCH' && !isPayloadValid
                          ? 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/50'
                          : ''
                      )}
                    />
                  ) : (
                    <Input
                      placeholder={
                        getRuleExample(newRule.type) || t('profile.editRules.payloadPlaceholder')
                      }
                      value={newRule.payload}
                      onChange={(e) => setNewRule({ ...newRule, payload: e.target.value })}
                      disabled={newRule.type === 'MATCH'}
                      className={cn(
                        newRule.payload && newRule.type !== 'MATCH' && !isPayloadValid
                          ? 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/50'
                          : ''
                      )}
                    />
                  )}
                  {isNewRuleLogical && newRuleLogicalSummary.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {newRuleLogicalSummary.slice(0, 4).map((clause, idx) => (
                        <Badge
                          key={`new-clause-${idx}`}
                          variant="outline"
                          className="text-[10px] max-w-65 truncate"
                        >
                          {clause}
                        </Badge>
                      ))}
                      {newRuleLogicalSummary.length > 4 && (
                        <Badge variant="outline" className="text-[10px]">
                          +{newRuleLogicalSummary.length - 4}
                        </Badge>
                      )}
                    </div>
                  )}
                  {newRule.payload && newRule.type !== 'MATCH' && !isPayloadValid && (
                    <p className="text-[11px] text-destructive">
                      {t('profile.editRules.expectedFormat') || 'Expected format'}:{' '}
                      {getRuleExample(newRule.type)}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>{t('profile.editRules.proxy')}</Label>
                  <Popover modal open={newRuleProxyOpen} onOpenChange={setNewRuleProxyOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between font-normal"
                      >
                        <span className="truncate">
                          {newRule.proxy || t('profile.editRules.proxyPlaceholder')}
                        </span>
                        <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="p-0 bg-card/90 h-60"
                      align="start"
                      style={{ width: 'var(--radix-popper-anchor-width)' }}
                    >
                      <Command>
                        <CommandInput placeholder={t('profile.editRules.proxyPlaceholder')} />
                        <CommandList>
                          <CommandEmpty>No results</CommandEmpty>
                          <CommandGroup>
                            {proxyGroups.map((group) => (
                              <CommandItem
                                key={group}
                                value={group}
                                onSelect={(value) => {
                                  setNewRule({ ...newRule, proxy: value })
                                  setNewRuleProxyOpen(false)
                                }}
                              >
                                {group}
                                <CheckIcon
                                  className={cn(
                                    'ml-auto size-4',
                                    newRule.proxy === group ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Additional params - horizontal switches */}
                {(isRuleSupportsNoResolve(newRule.type) || isRuleSupportsSrc(newRule.type)) && (
                  <>
                    <Separator />
                    <div className="flex items-center gap-4">
                      {isRuleSupportsNoResolve(newRule.type) && (
                        <div className="flex items-center gap-2">
                          <Switch
                            id="no-resolve"
                            size="sm"
                            checked={newRule.additionalParams?.includes('no-resolve') || false}
                            onCheckedChange={(checked) =>
                              handleAdditionalParamChange('no-resolve', checked)
                            }
                          />
                          <Label htmlFor="no-resolve" className="text-xs">
                            {t('profile.editRules.noResolve')}
                          </Label>
                        </div>
                      )}
                      {isRuleSupportsSrc(newRule.type) && (
                        <div className="flex items-center gap-2">
                          <Switch
                            id="src"
                            size="sm"
                            checked={newRule.additionalParams?.includes('src') || false}
                            onCheckedChange={(checked) =>
                              handleAdditionalParamChange('src', checked)
                            }
                          />
                          <Label htmlFor="src" className="text-xs">
                            {t('profile.editRules.src')}
                          </Label>
                        </div>
                      )}
                    </div>
                  </>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => handleAddRule('prepend')}
                    disabled={isAddRuleDisabled(newRule, validateRulePayload)}
                  >
                    <ArrowUpToLine className="size-4" />
                    {t('profile.editRules.addRulePrepend')}
                  </Button>
                  <Button
                    className="flex-1"
                    variant="outline"
                    onClick={() => handleAddRule('append')}
                    disabled={isAddRuleDisabled(newRule, validateRulePayload)}
                  >
                    <ArrowDownToLine className="size-4" />
                    {t('profile.editRules.addRuleAppend')}
                  </Button>
                </div>
              </div>

              {/* Collapsible instructions */}
              <Accordion type="single" collapsible className="mt-auto">
                <AccordionItem value="instructions" className="border-b-0">
                  <AccordionTrigger className="text-sm py-2">
                    {t('profile.editRules.instructions')}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="text-xs text-muted-foreground space-y-1.5">
                      <p>{t('profile.editRules.instructions1')}</p>
                      <p>{t('profile.editRules.instructions2')}</p>
                      <p>{t('profile.editRules.instructions3')}</p>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>

            {/* Right panel - Rule list in actual order */}
            <div className="w-3/5 border-l pl-4 pr-1 flex flex-col min-h-0">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center gap-2 shrink-0">
                  <h3 className="text-lg font-semibold whitespace-nowrap">{t('profile.editRules.currentRules')}</h3>
                  <Badge variant="secondary">{rules.length}</Badge>
                  {customRulesCount > 0 && (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-emerald-700 dark:text-emerald-400 border-emerald-600/40 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/50"
                    >
                      +{customRulesCount}
                    </Badge>
                  )}
                </div>
                <Input
                  placeholder={t('profile.editRules.searchPlaceholder')}
                  className="min-w-0 h-8 ml-auto"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
              >
                <SortableContext
                  items={isDragEnabled ? sortableIds : []}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="flex flex-col gap-1.5 overflow-y-auto flex-1 pr-1">
                    {isLoading ? (
                      <div className="flex flex-col items-center justify-center h-full py-8 gap-2">
                        <Spinner className="size-8" />
                        <span className="text-sm text-muted-foreground">
                          {t('common.loading') || 'Loading...'}
                        </span>
                      </div>
                    ) : filteredRules.length === 0 ? (
                      <div className="text-center text-muted-foreground py-4">
                        {rules.length === 0
                          ? t('profile.editRules.noRules')
                          : searchTerm
                            ? t('profile.editRules.noMatchingRules')
                            : t('profile.editRules.noRules')}
                      </div>
                    ) : (
                      filteredRules.map((rule) => {
                        const originalIndex = ruleIndexMap.get(rule) ?? -1
                        const isDeleted = deletedRules.has(originalIndex)
                        const custom = isRuleCustom(rule)

                        return (
                          <RuleListItem
                            key={rule.id}
                            rule={rule}
                            originalIndex={originalIndex}
                            isDeleted={isDeleted}
                            isCustom={custom}
                            sortableId={rule.id}
                            isDragDisabled={!isDragEnabled}
                            onRemove={handleRemoveRule}
                            isEditing={editingIndex === originalIndex}
                            editingRule={editingIndex === originalIndex ? editingRule : null}
                            onStartEditing={handleStartEditing}
                            onCancelEditing={handleCancelEditing}
                            onConfirmEditing={handleConfirmEditing}
                            onEditingRuleChange={handleEditingRuleChange}
                            proxyGroups={proxyGroups}
                          />
                        )
                      })
                    )}
                  </div>
                </SortableContext>
                {createPortal(dragOverlayNode, document.body)}
              </DndContext>
            </div>
          </div>
          )}
        </div>
        <DialogFooter className="pt-0">
          <DialogClose asChild>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDeletedRules(new Set())
              }}
            >
              {t('common.cancel')}
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <button ref={dialogCloseRef} type="button" className="hidden" tabIndex={-1} />
          </DialogClose>
          <Button
            size="sm"
            onClick={async () => {
              const saved = await handleSave()
              if (saved) {
                closeWithAnimation()
                if (isCurrentProfile) {
                  await mihomoHotReloadConfig()
                }
              }
            }}
          >
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default EditRulesModal
