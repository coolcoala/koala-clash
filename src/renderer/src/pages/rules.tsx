import BasePage from '@renderer/components/base/base-page'
import RuleItem from '@renderer/components/rules/rule-item'
import EditRulesModal from '@renderer/components/profiles/edit-rules-modal'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import yaml from 'js-yaml'
import useSWR from 'swr'
import { Separator } from '@renderer/components/ui/separator'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Textarea } from '@renderer/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { useUnifiedUiBundle } from '@renderer/hooks/use-unified-ui-bundle'
import { useGroups } from '@renderer/hooks/use-groups'
import { includesIgnoreCase } from '@renderer/utils/includes'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  confirmRealtimePresetValidation,
  getRuleStr,
  mihomoHotReloadConfig,
  runRealtimePresetSmoke,
  runRealtimePresetValidation,
  setRuleStr
} from '@renderer/utils/ipc'
import {
  createUnifiedRuleSavePlan,
  getUnifiedRuleDisplayTarget,
  isUserFacingRuleTarget,
  normalizeUnifiedRuleType,
  resolveDefaultRuleOwnerId,
  UnifiedRuleItem,
  UnifiedRuleOwner,
  UnifiedRuleViewScopeId,
  UnifiedStatusLevel,
  UnifiedUiBundle
} from '../../../core/ui/unified-ui'
import {
  getUnifiedRuleBypassPresentation,
  type UnifiedRuleBypassContext,
  type UnifiedRuleBypassTone
} from '../../../core/ui/unified-rule-bypass'
import {
  createKoalaRuBundleRule,
  isKoalaRuBundleRuleString,
  KOALA_RU_BUNDLE_RULE_PROVIDER_NAME
} from '../../../core/routing/mihomo-rule-provider-presets'
import {
  DISCORD_REALTIME_PRESET_ID,
  analyzeRealtimeReliability,
  listRealtimePresetDefinitions
} from '../../../core/routing/realtime-reliability'
import {
  createRealtimePresetQualityPlatformPresentations,
  createRealtimePresetQualityPresetPresentation,
  type RealtimePresetQualityTone
} from '../../../core/routing/realtime-preset-quality'
import {
  applyRealtimePresetToPatch,
  createEmptyUnifiedRulePatchFile,
  createUnifiedRulesForDisplay,
  appendUnifiedManagedRule,
  dedupeUnifiedRulePatchFile,
  duplicateUnifiedManagedRulesToOwner,
  duplicateUnifiedManagedRuleToOwner,
  getSelectableUnifiedRuleIds,
  importUnifiedRulesToPatch,
  isUnifiedManagedRuleSelectable,
  mapRulePatchesToUnifiedRules,
  moveUnifiedManagedRule,
  normalizeUnifiedRulePatchFile,
  promoteObservedIpsToUnifiedRules,
  removeUnifiedManagedRules,
  removeUnifiedManagedRule,
  replaceUnifiedManagedRule,
  serializeUnifiedRulesExportDocument,
  setUnifiedManagedRulesEnabled,
  setUnifiedManagedRuleEnabled,
  UnifiedRulePatchFile
} from '../../../core/ui/unified-rule-management'
import {
  AppWindow,
  ArrowDown,
  ArrowUp,
  Ban,
  CircleHelp,
  Copy,
  Database,
  Download,
  Globe2,
  ListChecks,
  Network,
  Pencil,
  Plus,
  Radio,
  ShieldCheck,
  ShieldOff,
  SlidersHorizontal,
  Save,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import { toast } from 'sonner'

const unifiedRuleTypes = [
  'DOMAIN-SUFFIX',
  'DOMAIN',
  'DOMAIN-KEYWORD',
  'IP-CIDR',
  'PROCESS-NAME',
  'RULE-SET',
  'MATCH'
] as const

const commonMihomoTargets = ['PROXY', 'DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE']
const vpnTargets = ['PROXY', 'DIRECT', 'REJECT']

interface RuleTargetOption {
  value: string
  label: string
}

interface OverflowRevealSubtitleProps {
  text: string
}

const OverflowRevealSubtitle: React.FC<OverflowRevealSubtitleProps> = ({ text }) => {
  const textRef = useRef<HTMLSpanElement>(null)
  const [overflowPixels, setOverflowPixels] = useState(0)

  useEffect(() => {
    const element = textRef.current
    if (!element) return

    const updateOverflow = (): void => {
      const nextOverflow = Math.ceil(element.scrollWidth - element.clientWidth)
      setOverflowPixels(nextOverflow > 1 ? nextOverflow : 0)
    }

    updateOverflow()

    const resizeObserver = new ResizeObserver(updateOverflow)
    resizeObserver.observe(element)

    return () => resizeObserver.disconnect()
  }, [text])

  const isOverflowing = overflowPixels > 0
  const revealStyle = isOverflowing
    ? ({
        '--overflow-reveal-distance': `${overflowPixels}px`,
        '--overflow-reveal-duration': `${Math.min(Math.max(overflowPixels / 28, 2.4), 7)}s`
      } as React.CSSProperties)
    : undefined

  return (
    <span
      className="quick-rule-card-subtitle block text-[11px] opacity-80"
      data-overflow={isOverflowing ? 'true' : undefined}
      title={text}
    >
      <span ref={textRef} className="quick-rule-card-subtitle__static">
        {text}
      </span>
      {isOverflowing && (
        <span aria-hidden="true" className="quick-rule-card-subtitle__reveal" style={revealStyle}>
          {text}
        </span>
      )}
    </span>
  )
}

const Rules: React.FC = () => {
  const { t } = useTranslation()
  const [filter, setFilter] = useState('')
  const [showRulesEditor, setShowRulesEditor] = useState(false)
  const [viewScope, setViewScope] = useState<UnifiedRuleViewScopeId>('all')
  const [selectedOwnerId, setSelectedOwnerId] = useState('')
  const [newRuleType, setNewRuleType] = useState<string>('DOMAIN-SUFFIX')
  const [newRuleValue, setNewRuleValue] = useState('')
  const [newRuleTarget, setNewRuleTarget] = useState('PROXY')
  const [editingRule, setEditingRule] = useState<UnifiedRuleItem | undefined>()
  const [ownerTypeFilter, setOwnerTypeFilter] = useState<'all' | 'mihomo' | 'amnezia'>('all')
  const [profileFilter, setProfileFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')
  const [duplicateOwnerId, setDuplicateOwnerId] = useState('')
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([])
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [showQuickAddAdvanced, setShowQuickAddAdvanced] = useState(false)
  const [showScenarioDetails, setShowScenarioDetails] = useState(false)
  const [showAdvancedManagement, setShowAdvancedManagement] = useState(false)
  const [bulkImportText, setBulkImportText] = useState('')
  const [bulkImportSummary, setBulkImportSummary] = useState('')
  const [rulesBusy, setRulesBusy] = useState(false)
  const [presetValidationBusy, setPresetValidationBusy] = useState(false)
  const [selectedObservedIps, setSelectedObservedIps] = useState<string[]>([])
  const [observedIpPromotionTarget, setObservedIpPromotionTarget] = useState('PROXY')
  const [selectedRealtimePresetId, setSelectedRealtimePresetId] = useState(
    DISCORD_REALTIME_PRESET_ID
  )
  const [realtimePresetEvidenceOverride, setRealtimePresetEvidenceOverride] = useState<
    RealtimePresetValidationEvidence | undefined
  >()
  const navigate = useNavigate()
  const { groups } = useGroups()
  const {
    bundle,
    amneziaSupport,
    mutateMihomoRules,
    mutateAmneziaRulePacks,
    mutateAmneziaStatus,
    mutateAmneziaSupport
  } = useUnifiedUiBundle(viewScope === 'all' ? undefined : viewScope)
  const ruleOwnerProfileIds = useMemo(
    () => bundle.ruleOwners.map((owner) => owner.ownerProfileId).sort(),
    [bundle.ruleOwners]
  )
  const { data: rulePatches = {}, mutate: mutateRulePatches } = useSWR<
    Record<string, UnifiedRulePatchFile>
  >(
    ruleOwnerProfileIds.length > 0 ? ['unified-rule-patches', ruleOwnerProfileIds.join('|')] : null,
    () => readRulePatches(ruleOwnerProfileIds)
  )

  const selectedOwner = useMemo(
    () => bundle.ruleOwners.find((owner) => owner.id === selectedOwnerId),
    [bundle.ruleOwners, selectedOwnerId]
  )
  const defaultOwnerId = useMemo(
    () =>
      resolveDefaultRuleOwnerId(
        bundle.ruleOwners,
        viewScope,
        viewScope === 'all' ? selectedOwnerId : undefined
      ),
    [bundle.ruleOwners, selectedOwnerId, viewScope]
  )

  useEffect(() => {
    if (!defaultOwnerId) {
      if (selectedOwnerId) setSelectedOwnerId('')
      return
    }
    if (!selectedOwner || (viewScope !== 'all' && selectedOwner.scopeId !== viewScope)) {
      setSelectedOwnerId(defaultOwnerId)
    }
  }, [defaultOwnerId, selectedOwner, selectedOwnerId, viewScope])

  useEffect(() => {
    if (duplicateOwnerId && !bundle.ruleOwners.some((owner) => owner.id === duplicateOwnerId)) {
      setDuplicateOwnerId('')
    }
  }, [bundle.ruleOwners, duplicateOwnerId])

  const targetOptions = useMemo<RuleTargetOption[]>(() => {
    if (selectedOwner?.ownerType === 'amnezia') {
      return vpnTargets.map((value) => ({
        value,
        label: getTargetLabel(t, selectedOwner, value)
      }))
    }
    const groupNames =
      groups
        ?.map((group) => group.name)
        .filter((name): name is string => Boolean(name) && isUserFacingRuleTarget(name)) ?? []
    const mihomoTargets = [...new Set([...commonMihomoTargets, ...groupNames])]
    return mihomoTargets.filter(isUserFacingRuleTarget).map((value) => ({
      value,
      label: getTargetLabel(t, selectedOwner, value)
    }))
  }, [groups, selectedOwner, t])

  useEffect(() => {
    if (targetOptions.length === 0) return
    if (!targetOptions.some((option) => option.value === newRuleTarget)) {
      setNewRuleTarget(targetOptions[0].value)
    }
  }, [newRuleTarget, targetOptions])

  const managedRules = useMemo(
    () => mapRulePatchesToUnifiedRules(bundle.ruleOwners, rulePatches),
    [bundle.ruleOwners, rulePatches]
  )
  const allDisplayRules = useMemo(
    () => createUnifiedRulesForDisplay({ runtimeRules: bundle.allRules, managedRules }),
    [bundle.allRules, managedRules]
  )
  const visibleRules = useMemo(() => {
    const scopedRules =
      viewScope === 'all'
        ? allDisplayRules
        : allDisplayRules.filter((rule) => rule.scopeId === viewScope)
    return scopedRules.filter((rule) => {
      if (ownerTypeFilter !== 'all' && rule.ownerType !== ownerTypeFilter) return false
      if (profileFilter !== 'all' && rule.ownerProfileId !== profileFilter) return false
      if (actionFilter !== 'all' && rule.target !== actionFilter) return false
      return true
    })
  }, [actionFilter, allDisplayRules, ownerTypeFilter, profileFilter, viewScope])

  const filteredRules = useMemo(() => {
    if (filter === '') return visibleRules
    return visibleRules.filter((rule) => {
      return (
        includesIgnoreCase(rule.value, filter) ||
        includesIgnoreCase(rule.type, filter) ||
        includesIgnoreCase(rule.target, filter) ||
        includesIgnoreCase(getUnifiedRuleDisplayTarget(rule.ownerType, rule.target), filter) ||
        includesIgnoreCase(rule.ownerProfileName, filter) ||
        includesIgnoreCase(rule.packName, filter) ||
        includesIgnoreCase(rule.note, filter) ||
        includesIgnoreCase(rule.source, filter)
      )
    })
  }, [filter, visibleRules])

  const scopeWarnings = useMemo(
    () =>
      viewScope === 'all'
        ? []
        : bundle.ruleScopes.filter((scope) => scope.unavailableReason && scope.id === viewScope),
    [bundle.ruleScopes, viewScope]
  )
  const ownerUnavailable = !selectedOwner || !selectedOwner.canEditRules
  const normalizedNewRuleType = normalizeUnifiedRuleType(newRuleType)
  const ruleRequiresValue = normalizedNewRuleType !== 'MATCH'
  const duplicateRule = useMemo(() => {
    const value = ruleRequiresValue ? newRuleValue.trim() : ''
    if (ruleRequiresValue && !value) return false
    return allDisplayRules.some(
      (rule) =>
        rule.id !== editingRule?.id &&
        rule.ownerProfileId === selectedOwner?.ownerProfileId &&
        normalizeUnifiedRuleType(rule.type) === normalizedNewRuleType &&
        rule.value === value &&
        rule.target === newRuleTarget
    )
  }, [
    allDisplayRules,
    editingRule?.id,
    newRuleTarget,
    newRuleType,
    newRuleValue,
    normalizedNewRuleType,
    ruleRequiresValue,
    selectedOwner?.ownerProfileId
  ])
  const canAddRule =
    !rulesBusy &&
    (!ruleRequiresValue || !!newRuleValue.trim()) &&
    !ownerUnavailable &&
    !duplicateRule
  const quickRuleActions = [
    {
      target: 'PROXY',
      label: t('pages.rules.quickActionVpn'),
      description: t('pages.rules.quickActionVpnDescription'),
      icon: <ShieldCheck className="size-4" />
    },
    {
      target: 'DIRECT',
      label: t('pages.rules.quickActionDirect'),
      description: t('pages.rules.quickActionDirectDescription'),
      icon: <ShieldOff className="size-4" />
    },
    {
      target: 'REJECT',
      label: t('pages.rules.quickActionReject'),
      description: t('pages.rules.quickActionRejectDescription'),
      icon: <Ban className="size-4" />
    }
  ]
  const quickTargetKinds = [
    {
      type: 'DOMAIN-SUFFIX',
      label: t('pages.rules.quickTargetSite'),
      description: t('pages.rules.quickTargetSiteDescription'),
      icon: <Globe2 className="size-4" />
    },
    {
      type: 'IP-CIDR',
      label: t('pages.rules.quickTargetIp'),
      description: t('pages.rules.quickTargetIpDescription'),
      icon: <Network className="size-4" />
    },
    {
      type: 'PROCESS-NAME',
      label: t('pages.rules.quickTargetApp'),
      description: t('pages.rules.quickTargetAppDescription'),
      icon: <AppWindow className="size-4" />
    },
    {
      type: 'MATCH',
      label: t('pages.rules.quickTargetAll'),
      description: t('pages.rules.quickTargetAllDescription'),
      icon: <ListChecks className="size-4" />
    }
  ]
  const quickRuleValuePlaceholder =
    normalizedNewRuleType === 'DOMAIN-SUFFIX' || normalizedNewRuleType === 'DOMAIN'
      ? t('pages.rules.quickValuePlaceholderSite')
      : normalizedNewRuleType === 'IP-CIDR'
        ? t('pages.rules.quickValuePlaceholderIp')
        : normalizedNewRuleType === 'PROCESS-NAME'
          ? t('pages.rules.quickValuePlaceholderApp')
          : ruleRequiresValue
            ? t('profile.helperRuleValuePlaceholder')
            : t('pages.rules.matchRuleValuePlaceholder')
  const advancedRuleEditorProfileId =
    selectedOwner?.ownerType === 'mihomo' ? selectedOwner.ownerProfileId : undefined
  const duplicateOwner = useMemo(
    () => bundle.ruleOwners.find((owner) => owner.id === duplicateOwnerId),
    [bundle.ruleOwners, duplicateOwnerId]
  )
  const actionFilterOptions = useMemo(
    () => [...new Set(allDisplayRules.map((rule) => rule.target).filter(isUserFacingRuleTarget))],
    [allDisplayRules]
  )
  const filteredManagedRules = useMemo(
    () => filteredRules.filter(isUnifiedManagedRuleSelectable),
    [filteredRules]
  )
  const selectedOwnerManagedRules = useMemo(
    () =>
      selectedOwner
        ? allDisplayRules.filter(
            (rule) =>
              rule.ownerProfileId === selectedOwner.ownerProfileId &&
              isUnifiedManagedRuleSelectable(rule)
          )
        : [],
    [allDisplayRules, selectedOwner]
  )
  const selectedRuleIdSet = useMemo(() => new Set(selectedRuleIds), [selectedRuleIds])
  const selectedRules = useMemo(
    () =>
      allDisplayRules.filter(
        (rule) => selectedRuleIdSet.has(rule.id) && isUnifiedManagedRuleSelectable(rule)
      ),
    [allDisplayRules, selectedRuleIdSet]
  )
  const selectableFilteredRuleIds = useMemo(
    () => getSelectableUnifiedRuleIds(filteredRules),
    [filteredRules]
  )
  const allFilteredManagedRulesSelected =
    selectableFilteredRuleIds.length > 0 &&
    selectableFilteredRuleIds.every((ruleId) => selectedRuleIdSet.has(ruleId))
  const bypassContext = useMemo<UnifiedRuleBypassContext>(
    () => ({
      platform: amneziaSupport?.platform.platform,
      tunEnabled: amneziaSupport?.tun.enabled,
      directTunBypassActive: amneziaSupport?.tun.directTunBypassActive,
      directTunBypassStatus: amneziaSupport?.tun.directTunBypassStatus,
      directExcludeOverallStatus: amneziaSupport?.tun.directExcludeOverallStatus,
      learnedBypassActive: amneziaSupport?.tun.learnedBypassActive,
      learnedBypassOverallStatus: amneziaSupport?.tun.learnedBypassOverallStatus,
      learnedBypassEntryCount: amneziaSupport?.tun.learnedBypassEntryCount,
      nativeProcessBypassActive: amneziaSupport?.tun.nativeProcessBypassActive,
      nativeProcessBypassPlatformMode: amneziaSupport?.tun.nativeProcessBypassPlatformMode,
      nativeProcessBypassNativeDataPlaneActive:
        amneziaSupport?.tun.nativeProcessBypassNativeDataPlaneActive,
      nativeProcessBypassFallbackOnly: amneziaSupport?.tun.nativeProcessBypassFallbackOnly,
      nativeProcessBypassWindowsServiceAvailable:
        amneziaSupport?.tun.nativeProcessBypassWindowsServiceAvailable,
      nativeProcessBypassWindowsControllerAvailable:
        amneziaSupport?.tun.nativeProcessBypassWindowsControllerAvailable,
      nativeProcessBypassMacosControllerAvailable:
        amneziaSupport?.tun.nativeProcessBypassMacosControllerAvailable,
      nativeProcessBypassMacosUserApprovalRequired:
        amneziaSupport?.tun.nativeProcessBypassMacosUserApprovalRequired,
      processDirectEffectiveBypassMode: amneziaSupport?.tun.processDirectEffectiveBypassMode
    }),
    [amneziaSupport]
  )
  const realtimeSummary = useMemo(() => {
    if (selectedOwner?.ownerType !== 'amnezia') return undefined
    const ownerRules = allDisplayRules.filter(
      (rule) => rule.ownerProfileId === selectedOwner.ownerProfileId
    )
    const presetValidation =
      realtimePresetEvidenceOverride?.profileId === selectedOwner.ownerProfileId &&
      realtimePresetEvidenceOverride.presetId === selectedRealtimePresetId
        ? realtimePresetEvidenceOverride
        : amneziaSupport?.profileId === selectedOwner.ownerProfileId &&
            amneziaSupport.realtime.presetValidation.presetId === selectedRealtimePresetId
          ? amneziaSupport.realtime.presetValidation
          : undefined
    return analyzeRealtimeReliability({
      rules: ownerRules.map((rule) => ({
        type: rule.type,
        value: rule.value,
        target: rule.target,
        enabled: rule.enabled
      })),
      udp: amneziaSupport?.udp,
      platform: amneziaSupport?.platform.platform,
      tunEnabled: amneziaSupport?.tun.enabled,
      profileId: selectedOwner.ownerProfileId,
      processDirectEffectiveBypassMode: amneziaSupport?.tun.processDirectEffectiveBypassMode,
      presetValidation
    })
  }, [
    allDisplayRules,
    amneziaSupport,
    realtimePresetEvidenceOverride,
    selectedOwner,
    selectedRealtimePresetId
  ])
  const realtimePresetDefinitions = useMemo(() => listRealtimePresetDefinitions(), [])
  const selectedRealtimePreset = useMemo(
    () =>
      realtimePresetDefinitions.find((preset) => preset.id === selectedRealtimePresetId) ??
      realtimePresetDefinitions[0],
    [realtimePresetDefinitions, selectedRealtimePresetId]
  )
  const selectedPresetPlatformNote = useMemo(
    () => selectedRealtimePreset?.platformNotes[amneziaSupport?.platform.platform ?? 'unknown'],
    [amneziaSupport?.platform.platform, selectedRealtimePreset]
  )
  const selectedPresetRecommendations = useMemo(
    () => selectedRealtimePreset?.recommendedActions ?? [],
    [selectedRealtimePreset]
  )

  useEffect(
    () => setRealtimePresetEvidenceOverride(undefined),
    [selectedOwner?.ownerProfileId, selectedRealtimePresetId]
  )

  useEffect(() => {
    if (!realtimePresetDefinitions.some((preset) => preset.id === selectedRealtimePresetId)) {
      setSelectedRealtimePresetId(DISCORD_REALTIME_PRESET_ID)
    }
  }, [realtimePresetDefinitions, selectedRealtimePresetId])

  const selectedRealtimePresetTitle =
    selectedRealtimePreset?.title ?? t('pages.rules.addRealtimePreset')
  const selectedRealtimePresetSmokeProfile = selectedRealtimePreset?.smokeChecklistProfile ?? []
  const selectedRealtimePresetCoverageSummary = t('pages.rules.realtimePresetCoverageSummary', {
    process: selectedRealtimePreset?.processNames.length ?? 0,
    domain:
      (selectedRealtimePreset?.domains.length ?? 0) +
      (selectedRealtimePreset?.domainSuffixes.length ?? 0),
    ip: selectedRealtimePreset?.ipCidrs.length ?? 0,
    checks: selectedRealtimePresetSmokeProfile.length
  })

  const selectedRealtimePresetRecommendationText = useMemo(
    () =>
      selectedPresetRecommendations
        .slice(0, 3)
        .map((code) => getRealtimeActionMessage(t, { code, message: code }))
        .join(' · '),
    [selectedPresetRecommendations, t]
  )

  const selectedRealtimePresetNote = [
    selectedPresetPlatformNote,
    selectedRealtimePresetCoverageSummary,
    selectedRealtimePresetRecommendationText
  ]
    .filter(Boolean)
    .join(' ')
  const selectedRealtimePresetQuality = useMemo(
    () =>
      createRealtimePresetQualityPresetPresentation(
        amneziaSupport?.realtimePresetQuality,
        selectedRealtimePresetId,
        amneziaSupport?.platform.platform
      ),
    [
      amneziaSupport?.platform.platform,
      amneziaSupport?.realtimePresetQuality,
      selectedRealtimePresetId
    ]
  )
  const selectedRealtimePresetPlatformQuality = useMemo(
    () =>
      createRealtimePresetQualityPlatformPresentations(
        amneziaSupport?.realtimePresetQuality,
        selectedRealtimePresetId
      ),
    [amneziaSupport?.realtimePresetQuality, selectedRealtimePresetId]
  )

  const observedIpEvidenceIps = useMemo(
    () => realtimeSummary?.presetValidation.observedIpEvidenceIps ?? [],
    [realtimeSummary]
  )

  useEffect(() => {
    const availableIps = new Set(observedIpEvidenceIps)
    setSelectedObservedIps((current) => {
      const next = current.filter((ip) => availableIps.has(ip))
      return next.length === current.length ? current : next
    })
  }, [observedIpEvidenceIps])

  useEffect(() => {
    const availableRuleIds = new Set(allDisplayRules.map((rule) => rule.id))
    setSelectedRuleIds((current) => {
      const next = current.filter((ruleId) => availableRuleIds.has(ruleId))
      return next.length === current.length ? current : next
    })
  }, [allDisplayRules])

  useEffect(() => {
    if (showRulesEditor && !advancedRuleEditorProfileId) {
      setShowRulesEditor(false)
    }
  }, [advancedRuleEditorProfileId, showRulesEditor])

  const handleAddRule = async (): Promise<void> => {
    const value = ruleRequiresValue ? newRuleValue.trim() : ''
    if ((ruleRequiresValue && !value) || rulesBusy) return

    if (duplicateRule) {
      toast.error(t('pages.rules.duplicateRule'))
      return
    }

    if (ownerUnavailable || !selectedOwner) {
      toast.error(t('pages.rules.ruleOwnerUnavailable'))
      return
    }

    setRulesBusy(true)
    try {
      const draft = {
        type: newRuleType,
        value,
        target: newRuleTarget
      }

      if (editingRule) {
        await updateManagedRule(editingRule, draft)
        toast.success(t('pages.rules.ruleUpdated', { name: selectedOwner.ownerProfileName }))
      } else {
        const plan = createUnifiedRuleSavePlan({
          owner: selectedOwner,
          ...draft
        })
        const added = await appendProfileRule(plan.ownerProfileId, plan.serializedRule)
        if (!added) {
          toast.error(t('pages.rules.duplicateRule'))
          await refreshRuleState()
          return
        }
        toast.success(t(plan.successMessageKey, { name: plan.ownerProfileName }))
      }
      await mihomoHotReloadConfig()
      mutateMihomoRules()
      await refreshRuleState()
      setNewRuleValue('')
      setEditingRule(undefined)
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setRulesBusy(false)
    }
  }

  const handleAddRuBundle = async (): Promise<void> => {
    if (rulesBusy) return

    if (ownerUnavailable || !selectedOwner) {
      toast.error(t('pages.rules.ruleOwnerUnavailable'))
      return
    }

    setRulesBusy(true)
    try {
      const rule = createKoalaRuBundleRule(newRuleTarget)
      const added = await appendProfileRule(selectedOwner.ownerProfileId, rule)
      if (!added) {
        toast.error(t('pages.rules.duplicateRule'))
        await refreshRuleState()
        return
      }
      toast.success(
        t('pages.rules.ruBundleAdded', {
          name: selectedOwner.ownerProfileName,
          action: getTargetLabel(t, selectedOwner, newRuleTarget)
        })
      )
      await mihomoHotReloadConfig()
      mutateMihomoRules()
      await refreshRuleState()
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setRulesBusy(false)
    }
  }

  const handleAddRealtimePreset = async (): Promise<void> => {
    if (rulesBusy) return

    if (ownerUnavailable || !selectedOwner || selectedOwner.ownerType !== 'amnezia') {
      toast.error(t('pages.rules.realtimePresetRequiresVpnOwner'))
      return
    }

    setRulesBusy(true)
    try {
      const patch = getOwnerPatch(selectedOwner.ownerProfileId)
      const result = applyRealtimePresetToPatch({
        patch,
        presetId: selectedRealtimePresetId,
        target: 'PROXY'
      })
      await writeProfileRulePatch(selectedOwner.ownerProfileId, result.patch)
      await mihomoHotReloadConfig()
      mutateMihomoRules()
      await refreshRuleState()
      toast.success(
        t('pages.rules.realtimePresetAdded', {
          preset: selectedRealtimePresetTitle,
          name: selectedOwner.ownerProfileName,
          added: result.added,
          skipped: result.skippedDuplicate
        })
      )
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setRulesBusy(false)
    }
  }

  const handleRunRealtimePresetCheck = async (): Promise<void> => {
    if (presetValidationBusy) return
    if (ownerUnavailable || !selectedOwner || selectedOwner.ownerType !== 'amnezia') {
      toast.error(t('pages.rules.realtimePresetRequiresVpnOwner'))
      return
    }

    setPresetValidationBusy(true)
    try {
      const evidence = await runRealtimePresetValidation(
        selectedOwner.ownerProfileId,
        selectedRealtimePresetId
      )
      setRealtimePresetEvidenceOverride(evidence)
      mutateAmneziaSupport()
      toast.success(
        t('pages.rules.realtimePresetCheckCompleted', {
          status: getRealtimeValidationStatusLabel(t, evidence.validationStatus)
        })
      )
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setPresetValidationBusy(false)
    }
  }

  const handleRunRealtimePresetSmoke = async (): Promise<void> => {
    if (presetValidationBusy) return
    if (ownerUnavailable || !selectedOwner || selectedOwner.ownerType !== 'amnezia') {
      toast.error(t('pages.rules.realtimePresetRequiresVpnOwner'))
      return
    }

    setPresetValidationBusy(true)
    try {
      const evidence = await runRealtimePresetSmoke(
        selectedOwner.ownerProfileId,
        selectedRealtimePresetId
      )
      setRealtimePresetEvidenceOverride(evidence)
      mutateAmneziaSupport()
      toast.success(
        t('pages.rules.realtimePresetSmokeCompleted', {
          status: getRealtimeValidationStatusLabel(t, evidence.validationStatus)
        })
      )
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setPresetValidationBusy(false)
    }
  }

  const handleConfirmRealtimePreset = async (): Promise<void> => {
    if (presetValidationBusy) return
    if (ownerUnavailable || !selectedOwner || selectedOwner.ownerType !== 'amnezia') {
      toast.error(t('pages.rules.realtimePresetRequiresVpnOwner'))
      return
    }

    const noteInput = window.prompt(t('pages.rules.realtimePresetManualNotePrompt'))
    if (noteInput === null) return
    const note = noteInput.trim() || undefined
    setPresetValidationBusy(true)
    try {
      const evidence = await confirmRealtimePresetValidation(
        selectedOwner.ownerProfileId,
        note,
        selectedRealtimePresetId
      )
      setRealtimePresetEvidenceOverride(evidence)
      mutateAmneziaSupport()
      toast.success(t('pages.rules.realtimePresetMarkedVerified'))
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setPresetValidationBusy(false)
    }
  }

  const handleToggleObservedIp = (ip: string, checked: boolean): void => {
    setSelectedObservedIps((current) => {
      if (checked) return current.includes(ip) ? current : [...current, ip]
      return current.filter((item) => item !== ip)
    })
  }

  const handlePromoteObservedIps = async (): Promise<void> => {
    if (rulesBusy || selectedObservedIps.length === 0) return
    if (ownerUnavailable || !selectedOwner) {
      toast.error(t('pages.rules.ruleOwnerUnavailable'))
      return
    }

    setRulesBusy(true)
    try {
      const result = promoteObservedIpsToUnifiedRules({
        patch: getOwnerPatch(selectedOwner.ownerProfileId),
        observedIps: selectedObservedIps,
        target: observedIpPromotionTarget
      })
      if (result.added > 0) {
        await writeProfileRulePatch(selectedOwner.ownerProfileId, result.patch)
        await mihomoHotReloadConfig()
        mutateMihomoRules()
        await refreshRuleState()
      }
      toast.success(
        t('pages.rules.realtimeObservedIpPromotionCompleted', {
          added: result.added,
          skipped: result.skippedDuplicate,
          invalid: result.invalid.length
        })
      )
      if (result.added > 0) setSelectedObservedIps([])
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setRulesBusy(false)
    }
  }

  const refreshRuleState = async (): Promise<void> => {
    await Promise.all([
      mutateRulePatches(),
      mutateAmneziaRulePacks(),
      mutateAmneziaStatus(),
      mutateAmneziaSupport()
    ])
  }

  const handleStartEditRule = (rule: UnifiedRuleItem): void => {
    if (!rule.editable || !rule.ownerProfileId) return
    setEditingRule(rule)
    setSelectedOwnerId(`${rule.ownerType}:${rule.ownerProfileId}`)
    setNewRuleType(rule.type)
    setNewRuleValue(rule.value)
    setNewRuleTarget(rule.target)
  }

  const handleCancelEdit = (): void => {
    setEditingRule(undefined)
    setNewRuleValue('')
    setNewRuleTarget('PROXY')
  }

  const handleDeleteRule = async (rule: UnifiedRuleItem): Promise<void> => {
    if (!rule.ownerProfileId || !rule.managedPatchSection || rule.managedPatchIndex === undefined)
      return
    setRulesBusy(true)
    try {
      const patch = getOwnerPatch(rule.ownerProfileId)
      const next = removeUnifiedManagedRule(patch, rule.managedPatchSection, rule.managedPatchIndex)
      await writeProfileRulePatch(rule.ownerProfileId, next)
      await mihomoHotReloadConfig()
      mutateMihomoRules()
      await refreshRuleState()
      toast.success(t('pages.rules.ruleDeleted'))
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setRulesBusy(false)
    }
  }

  const handleToggleRule = async (rule: UnifiedRuleItem): Promise<void> => {
    if (!rule.ownerProfileId || !rule.managedPatchSection || rule.managedPatchIndex === undefined)
      return
    setRulesBusy(true)
    try {
      const patch = getOwnerPatch(rule.ownerProfileId)
      const next = setUnifiedManagedRuleEnabled(
        patch,
        rule.managedPatchSection,
        rule.managedPatchIndex,
        !rule.enabled
      )
      await writeProfileRulePatch(rule.ownerProfileId, next)
      await mihomoHotReloadConfig()
      mutateMihomoRules()
      await refreshRuleState()
      toast.success(rule.enabled ? t('pages.rules.ruleDisabled') : t('pages.rules.ruleEnabled'))
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setRulesBusy(false)
    }
  }

  const handleDuplicateRule = async (rule: UnifiedRuleItem): Promise<void> => {
    if (
      !rule.ownerProfileId ||
      !rule.managedPatchSection ||
      rule.managedPatchIndex === undefined ||
      !duplicateOwner
    ) {
      return
    }

    setRulesBusy(true)
    try {
      const sourcePatch = getOwnerPatch(rule.ownerProfileId)
      const targetPatch = getOwnerPatch(duplicateOwner.ownerProfileId)
      const nextTargetPatch = duplicateUnifiedManagedRuleToOwner({
        sourcePatch,
        sourceSection: rule.managedPatchSection,
        sourceIndex: rule.managedPatchIndex,
        targetPatch
      })
      await writeProfileRulePatch(duplicateOwner.ownerProfileId, nextTargetPatch)
      await mihomoHotReloadConfig()
      mutateMihomoRules()
      await refreshRuleState()
      toast.success(t('pages.rules.ruleDuplicated', { name: duplicateOwner.ownerProfileName }))
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setRulesBusy(false)
    }
  }

  const handleMoveRule = async (rule: UnifiedRuleItem, direction: 'up' | 'down'): Promise<void> => {
    if (!isUnifiedManagedRuleSelectable(rule)) return

    setRulesBusy(true)
    try {
      const patch = getOwnerPatch(rule.ownerProfileId)
      const next = moveUnifiedManagedRule(
        patch,
        rule.managedPatchSection,
        rule.managedPatchIndex,
        direction
      )
      await writeProfileRulePatch(rule.ownerProfileId, next)
      await mihomoHotReloadConfig()
      mutateMihomoRules()
      await refreshRuleState()
      toast.success(t('pages.rules.ruleMoved'))
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setRulesBusy(false)
    }
  }

  const handleToggleRuleSelection = (rule: UnifiedRuleItem, selected: boolean): void => {
    if (!isUnifiedManagedRuleSelectable(rule)) return
    setSelectedRuleIds((current) => {
      if (selected) return current.includes(rule.id) ? current : [...current, rule.id]
      return current.filter((ruleId) => ruleId !== rule.id)
    })
  }

  const handleSelectAllFilteredRules = (): void => {
    setSelectedRuleIds((current) => {
      const next = new Set(current)
      selectableFilteredRuleIds.forEach((ruleId) => next.add(ruleId))
      return [...next]
    })
  }

  const handleClearSelection = (): void => {
    setSelectedRuleIds([])
  }

  const handleBulkSetEnabled = async (enabled: boolean): Promise<void> => {
    if (rulesBusy || selectedRules.length === 0) return
    setRulesBusy(true)
    try {
      for (const [profileId, rules] of groupManagedRulesByProfileId(selectedRules)) {
        const next = setUnifiedManagedRulesEnabled(getOwnerPatch(profileId), rules, enabled)
        await writeProfileRulePatch(profileId, next)
      }
      await mihomoHotReloadConfig()
      mutateMihomoRules()
      await refreshRuleState()
      toast.success(
        enabled
          ? t('pages.rules.bulkRulesEnabled', { count: selectedRules.length })
          : t('pages.rules.bulkRulesDisabled', { count: selectedRules.length })
      )
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setRulesBusy(false)
    }
  }

  const handleBulkDelete = async (): Promise<void> => {
    if (rulesBusy || selectedRules.length === 0) return
    setRulesBusy(true)
    try {
      for (const [profileId, rules] of groupManagedRulesByProfileId(selectedRules)) {
        const next = removeUnifiedManagedRules(getOwnerPatch(profileId), rules)
        await writeProfileRulePatch(profileId, next)
      }
      await mihomoHotReloadConfig()
      mutateMihomoRules()
      await refreshRuleState()
      toast.success(t('pages.rules.bulkRulesDeleted', { count: selectedRules.length }))
      setSelectedRuleIds([])
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setRulesBusy(false)
    }
  }

  const handleBulkDuplicate = async (): Promise<void> => {
    if (rulesBusy || selectedRules.length === 0 || !duplicateOwner) return
    setRulesBusy(true)
    try {
      const result = duplicateUnifiedManagedRulesToOwner({
        targetOwner: duplicateOwner,
        targetPatch: getOwnerPatch(duplicateOwner.ownerProfileId),
        rules: selectedRules
      })
      if (result.added > 0) {
        await writeProfileRulePatch(duplicateOwner.ownerProfileId, result.patch)
        await mihomoHotReloadConfig()
        mutateMihomoRules()
        await refreshRuleState()
      }
      toast.success(
        t('pages.rules.bulkRulesDuplicated', {
          name: duplicateOwner.ownerProfileName,
          added: result.added,
          skipped: result.skippedDuplicate,
          invalid: result.invalid.length
        })
      )
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setRulesBusy(false)
    }
  }

  const handleBulkImport = async (): Promise<void> => {
    if (rulesBusy || ownerUnavailable || !selectedOwner || !bulkImportText.trim()) return
    setRulesBusy(true)
    try {
      const result = importUnifiedRulesToPatch({
        patch: getOwnerPatch(selectedOwner.ownerProfileId),
        type: newRuleType,
        target: newRuleTarget,
        text: bulkImportText
      })
      if (result.added > 0) {
        await writeProfileRulePatch(selectedOwner.ownerProfileId, result.patch)
        await mihomoHotReloadConfig()
        mutateMihomoRules()
        await refreshRuleState()
        setBulkImportText('')
      }
      const summary = t('pages.rules.bulkImportSummary', {
        added: result.added,
        skipped: result.skippedDuplicate,
        invalid: result.invalid.length
      })
      setBulkImportSummary(summary)
      toast.success(summary)
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setRulesBusy(false)
    }
  }

  const handleExportRules = async (rules: UnifiedRuleItem[]): Promise<void> => {
    const exportableRules = rules.filter(isUnifiedManagedRuleSelectable)
    if (exportableRules.length === 0) {
      toast.error(t('pages.rules.noExportableRules'))
      return
    }

    try {
      await copyTextToClipboard(serializeUnifiedRulesExportDocument(exportableRules))
      toast.success(t('pages.rules.rulesExported', { count: exportableRules.length }))
    } catch (e) {
      toast.error(`${e}`)
    }
  }

  const updateManagedRule = async (
    rule: UnifiedRuleItem,
    draft: { type: string; value: string; target: string }
  ): Promise<void> => {
    if (!rule.ownerProfileId || !rule.managedPatchSection || rule.managedPatchIndex === undefined) {
      throw new Error(t('pages.rules.readOnlyRule'))
    }
    const patch = getOwnerPatch(rule.ownerProfileId)
    const next = replaceUnifiedManagedRule(
      patch,
      rule.managedPatchSection,
      rule.managedPatchIndex,
      draft
    )
    await writeProfileRulePatch(rule.ownerProfileId, next)
  }

  const getOwnerPatch = (profileId: string): UnifiedRulePatchFile => {
    return rulePatches[profileId] ?? createEmptyUnifiedRulePatchFile()
  }

  const canMoveRule = (rule: UnifiedRuleItem, direction: 'up' | 'down'): boolean => {
    if (!isUnifiedManagedRuleSelectable(rule)) return false
    const sectionRules = getOwnerPatch(rule.ownerProfileId)[rule.managedPatchSection]
    const currentRule = sectionRules[rule.managedPatchIndex]
    if (!currentRule || isKoalaRuBundleRuleString(currentRule)) return false
    const targetIndex = direction === 'up' ? rule.managedPatchIndex - 1 : rule.managedPatchIndex + 1
    const targetRule = sectionRules[targetIndex]
    if (targetRule && isKoalaRuBundleRuleString(targetRule)) return false
    return direction === 'up'
      ? rule.managedPatchIndex > 0
      : rule.managedPatchIndex < sectionRules.length - 1
  }

  return (
    <BasePage
      title={t('pages.rules.title')}
      header={
        <>
          {advancedRuleEditorProfileId && (
            <Button
              size="icon-sm"
              variant="ghost"
              className="app-nodrag"
              title={t('pages.rules.advancedMihomoRuleEditor')}
              onClick={() => setShowRulesEditor(true)}
            >
              <Pencil className="size-4" />
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            className="app-nodrag"
            title={t('pages.resources.title')}
            onClick={() => navigate('/resources')}
          >
            <Database className="text-lg" />
          </Button>
        </>
      }
    >
      {showRulesEditor && advancedRuleEditorProfileId && (
        <EditRulesModal
          id={advancedRuleEditorProfileId}
          onClose={() => {
            setShowRulesEditor(false)
            mutateMihomoRules()
            void refreshRuleState()
          }}
        />
      )}

      <div className="flex flex-col gap-2 px-2 pb-2">
        <div className="rounded-lg border border-border bg-card/40 p-2">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('pages.rules.sectionOverview')}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Select
                value={viewScope}
                onValueChange={(value) => setViewScope(value as UnifiedRuleViewScopeId)}
              >
                <SelectTrigger size="sm" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  <SelectItem value="all">{t('pages.rules.scopeAll')}</SelectItem>
                  {bundle.ruleScopes.map((scope) => (
                    <SelectItem key={scope.id} value={scope.id}>
                      {t(scope.titleKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <RuleCountBadges bundle={bundle} rules={allDisplayRules} />
            </div>
            <UnifiedStatusBadges bundle={bundle} />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card/40 p-2">
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-medium">{t('pages.rules.quickAddTitle')}</div>
              <div className="text-xs text-muted-foreground">
                {t('pages.rules.quickAddDescription')}
              </div>
            </div>
            <Select
              value={selectedOwnerId}
              onValueChange={setSelectedOwnerId}
              disabled={Boolean(editingRule)}
            >
              <SelectTrigger size="sm" className="w-56">
                <SelectValue placeholder={t('pages.rules.selectRuleOwner')} />
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                {bundle.ruleOwners.map((owner) => (
                  <SelectItem key={owner.id} value={owner.id}>
                    {getOwnerLabel(t, owner)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">
                {t('pages.rules.quickActionQuestion')}
              </div>
              <div className="grid gap-1.5 sm:grid-cols-3 lg:grid-cols-1">
                {quickRuleActions.map((action) => (
                  <Button
                    key={action.target}
                    type="button"
                    variant={newRuleTarget === action.target ? 'default' : 'outline'}
                    className="quick-rule-card h-auto justify-start gap-2 px-2 py-1.5 text-left"
                    onClick={() => setNewRuleTarget(action.target)}
                  >
                    {action.icon}
                    <span className="min-w-0">
                      <span className="block text-xs font-medium">{action.label}</span>
                      <OverflowRevealSubtitle text={action.description} />
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">
                  {t('pages.rules.quickTargetQuestion')}
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
                  {quickTargetKinds.map((target) => (
                    <Button
                      key={target.type}
                      type="button"
                      variant={normalizedNewRuleType === target.type ? 'default' : 'outline'}
                      className="quick-rule-card h-auto justify-start gap-2 px-2 py-1.5 text-left"
                      onClick={() => {
                        setNewRuleType(target.type)
                        if (normalizeUnifiedRuleType(target.type) === 'MATCH') setNewRuleValue('')
                      }}
                    >
                      {target.icon}
                      <span className="min-w-0">
                        <span className="block text-xs font-medium">{target.label}</span>
                        <OverflowRevealSubtitle text={target.description} />
                      </span>
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  className="h-8 flex-1 text-sm"
                  value={newRuleValue}
                  placeholder={quickRuleValuePlaceholder}
                  disabled={!ruleRequiresValue}
                  onChange={(e) => setNewRuleValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddRule()
                    }
                  }}
                />
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={!canAddRule}
                  onClick={handleAddRule}
                >
                  {editingRule ? <Save className="size-4" /> : <Plus className="size-4" />}
                  {editingRule ? t('pages.rules.saveRule') : t('pages.rules.addRule')}
                </Button>
                {editingRule && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={handleCancelEdit}
                  >
                    <X className="size-4" />
                    {t('common.cancel')}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-stroke-power-on/50 bg-gradient-to-br from-gradient-start-power-on/15 to-gradient-end-power-on/15 text-foreground shadow-sm hover:bg-gradient-start-power-on/20"
              disabled={rulesBusy || ownerUnavailable}
              title={KOALA_RU_BUNDLE_RULE_PROVIDER_NAME}
              onClick={handleAddRuBundle}
            >
              <Upload className="size-4" />
              {t('pages.rules.addRuBundle')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-muted-foreground"
              onClick={() => setShowQuickAddAdvanced((value) => !value)}
            >
              <SlidersHorizontal className="size-4" />
              {showQuickAddAdvanced
                ? t('pages.rules.hideAdvancedOptions')
                : t('pages.rules.showAdvancedOptions')}
            </Button>
            {selectedOwner && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="h-5 w-5 shrink-0 text-muted-foreground"
                    title={t('pages.rules.ruleHelp')}
                  >
                    <CircleHelp className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-80">
                  <div className="space-y-1 text-xs">
                    <div>
                      {selectedOwner.ownerType === 'mihomo'
                        ? t('pages.rules.mihomoOwnerHelp')
                        : t('pages.rules.vpnOwnerHelp')}
                    </div>
                    {selectedOwner.ownerType === 'amnezia' && selectedRealtimePresetNote && (
                      <div>
                        {t('pages.rules.realtimePresetGuidance', {
                          preset: selectedRealtimePresetTitle,
                          guidance: selectedRealtimePresetNote
                        })}
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {showQuickAddAdvanced && (
            <div className="mt-2 grid gap-2 rounded-md border border-border/70 bg-card/30 p-2 sm:grid-cols-2 lg:grid-cols-3">
              <Select
                value={newRuleType}
                onValueChange={(value) => {
                  setNewRuleType(value)
                  if (normalizeUnifiedRuleType(value) === 'MATCH') setNewRuleValue('')
                }}
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {unifiedRuleTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={newRuleTarget} onValueChange={setNewRuleTarget}>
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {targetOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={selectedOwnerId}
                onValueChange={setSelectedOwnerId}
                disabled={Boolean(editingRule)}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder={t('pages.rules.selectRuleOwner')} />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {bundle.ruleOwners.map((owner) => (
                    <SelectItem key={owner.id} value={owner.id}>
                      {getOwnerLabel(t, owner)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(duplicateRule ||
            ownerUnavailable ||
            scopeWarnings.length > 0 ||
            bundle.legacyHelperRules.totalRules > 0) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {duplicateRule && (
                <span className="text-xs text-warning">{t('pages.rules.duplicateRule')}</span>
              )}
              {ownerUnavailable && (
                <span className="text-xs text-warning">
                  {t('pages.rules.ruleOwnerUnavailable')}
                </span>
              )}
              {scopeWarnings.map((scope) => (
                <span key={scope.id} className="text-xs text-muted-foreground">
                  {getScopeUnavailableText(t, scope.unavailableReason ?? '')}
                </span>
              ))}
              {bundle.legacyHelperRules.totalRules > 0 && (
                <span className="text-xs text-muted-foreground">
                  {t('pages.rules.hiddenLegacyHelperRules', {
                    count: bundle.legacyHelperRules.totalRules,
                    enabled: bundle.legacyHelperRules.enabledRules
                  })}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card/40 p-2">
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-medium">{t('pages.rules.commonScenariosTitle')}</div>
              <div className="text-xs text-muted-foreground">
                {t('pages.rules.commonScenariosDescription')}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="rounded-sm">
                {selectedRealtimePresetTitle}
              </Badge>
              {selectedRealtimePresetNote && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="h-5 w-5 text-muted-foreground"
                      title={t('pages.rules.realtimeDetails')}
                    >
                      <CircleHelp className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-96">
                    <div className="text-xs">{selectedRealtimePresetNote}</div>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>

          {selectedOwner?.ownerType !== 'amnezia' && (
            <div className="mb-2 text-xs text-warning">
              {t('pages.rules.commonScenariosRequiresVpnOwner')}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedRealtimePresetId} onValueChange={setSelectedRealtimePresetId}>
              <SelectTrigger size="sm" className="w-60">
                <SelectValue placeholder={t('pages.rules.selectRealtimePreset')} />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {realtimePresetDefinitions.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={rulesBusy || ownerUnavailable || selectedOwner?.ownerType !== 'amnezia'}
              onClick={handleAddRealtimePreset}
            >
              <Radio className="size-4" />
              {t('pages.rules.addSelectedRealtimePreset')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={
                presetValidationBusy || ownerUnavailable || selectedOwner?.ownerType !== 'amnezia'
              }
              onClick={handleRunRealtimePresetCheck}
            >
              {t('pages.rules.runRealtimePresetCheck')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-muted-foreground"
              onClick={() => setShowScenarioDetails((value) => !value)}
            >
              <SlidersHorizontal className="size-4" />
              {showScenarioDetails
                ? t('pages.rules.hideScenarioDetails')
                : t('pages.rules.showScenarioDetails')}
            </Button>
          </div>

          {showScenarioDetails && (
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={
                  presetValidationBusy || ownerUnavailable || selectedOwner?.ownerType !== 'amnezia'
                }
                onClick={handleRunRealtimePresetSmoke}
              >
                {t('pages.rules.runRealtimePresetSmoke')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={
                  presetValidationBusy || ownerUnavailable || selectedOwner?.ownerType !== 'amnezia'
                }
                onClick={handleConfirmRealtimePreset}
              >
                {t('pages.rules.markRealtimePresetVerified')}
              </Button>
            </div>
          )}

          {realtimeSummary && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className={getRealtimeConfidenceClassName(realtimeSummary.realtimeConfidence)}>
                {t('pages.rules.realtimeConfidence', {
                  confidence: t(
                    `pages.rules.realtimeConfidenceLevels.${realtimeSummary.realtimeConfidence}`
                  )
                })}
              </span>
              <span className="text-xs text-muted-foreground">
                {t('pages.rules.realtimeUdpConfidence', {
                  confidence: t(
                    `pages.rules.realtimeUdpConfidenceLevels.${realtimeSummary.udpConfidence}`
                  )
                })}
              </span>
              <span className="text-xs text-muted-foreground">
                {t('pages.rules.realtimePresetValidation', {
                  status: getRealtimeValidationStatusLabel(
                    t,
                    realtimeSummary.presetValidation.validationStatus
                  )
                })}
              </span>
              {observedIpEvidenceIps.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {t('pages.rules.realtimeObservedIpEvidence', {
                    count: observedIpEvidenceIps.length
                  })}
                </span>
              )}
              {realtimeSummary.presetValidation.validationExpired ||
              realtimeSummary.presetValidation.environmentChanged ? (
                <span className="text-xs text-warning">
                  {getRealtimeFreshnessMessage(t, realtimeSummary.presetValidation)}
                </span>
              ) : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="h-5 w-5 text-muted-foreground"
                    title={t('pages.rules.realtimeDetails')}
                  >
                    <CircleHelp className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-96">
                  <div className="space-y-1 text-xs">
                    <div>
                      {t('pages.rules.realtimeCoverage', {
                        process: formatRealtimeBoolean(
                          t,
                          realtimeSummary.ruleCoverage.processCoverage
                        ),
                        domain: formatRealtimeBoolean(
                          t,
                          realtimeSummary.ruleCoverage.domainCoverage
                        ),
                        catchAll: formatRealtimeBoolean(
                          t,
                          realtimeSummary.ruleCoverage.catchAllProxy
                        )
                      })}
                    </div>
                    <div>
                      {t('pages.rules.realtimePresetValidationSource', {
                        source: getRealtimeValidationSourceLabel(
                          t,
                          realtimeSummary.presetValidation.validationSource
                        )
                      })}
                    </div>
                    {realtimeSummary.presetValidation.lastValidatedAt && (
                      <div>
                        {t('pages.rules.realtimePresetLastValidated', {
                          time: formatRealtimeTimestamp(
                            realtimeSummary.presetValidation.lastValidatedAt
                          )
                        })}
                      </div>
                    )}
                    {realtimeSummary.presetValidation.smokeResult && (
                      <div>
                        {t('pages.rules.realtimePresetSmokeResult', {
                          result: realtimeSummary.presetValidation.smokeResult
                        })}
                      </div>
                    )}
                    {realtimeSummary.topReasons.slice(0, 2).map((reason) => (
                      <div key={reason.code}>{getRealtimeReasonMessage(t, reason)}</div>
                    ))}
                    {realtimeSummary.recommendedActions.slice(0, 2).map((action) => (
                      <div key={action.code}>{getRealtimeActionMessage(t, action)}</div>
                    ))}
                    {realtimeSummary.warnings.slice(0, 2).map((warning) => (
                      <div key={warning.code}>{getRealtimeWarningMessage(t, warning)}</div>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
          )}

          {showScenarioDetails && selectedRealtimePresetQuality && (
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
              <span className="text-xs font-medium text-muted-foreground">
                {t('pages.rules.realtimePresetQuality')}
              </span>
              <Badge
                variant={getRealtimeQualityBadgeVariant(selectedRealtimePresetQuality.tone)}
                className={getRealtimeQualityBadgeClassName(selectedRealtimePresetQuality.tone)}
              >
                {t(selectedRealtimePresetQuality.bestStatusLabelKey)}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {t('pages.rules.realtimePresetQualityScope', {
                  scope: t(selectedRealtimePresetQuality.evidenceScopeLabelKey)
                })}
              </span>
              <span
                className={
                  selectedRealtimePresetQuality.stale
                    ? 'text-xs text-warning'
                    : 'text-xs text-muted-foreground'
                }
              >
                {t(selectedRealtimePresetQuality.freshnessLabelKey)}
              </span>
              {[selectedRealtimePresetQuality.proxy, selectedRealtimePresetQuality.tun].map(
                (scenario) => (
                  <span key={scenario.runtimeScenario} className="text-xs text-muted-foreground">
                    {t('pages.rules.realtimePresetQualityScenario', {
                      scenario: t(
                        scenario.runtimeScenario === 'proxy'
                          ? 'profile.realtimeQualityScenarioProxy'
                          : 'profile.realtimeQualityScenarioTun'
                      ),
                      status: t(scenario.statusLabelKey),
                      scope: t(scenario.evidenceScopeLabelKey)
                    })}
                  </span>
                )
              )}
              {selectedRealtimePresetPlatformQuality.length > 1 &&
                selectedRealtimePresetPlatformQuality.slice(0, 4).map((platformQuality) => (
                  <span key={platformQuality.platform} className="text-xs text-muted-foreground">
                    {t('pages.rules.realtimePresetQualityPlatform', {
                      platform: platformQuality.platform,
                      proxy: t(platformQuality.proxy.statusLabelKey),
                      tun: t(platformQuality.tun.statusLabelKey)
                    })}
                  </span>
                ))}
              {selectedRealtimePresetQuality.warningCodes.slice(0, 2).map((code) => (
                <span key={code} className="text-xs text-warning">
                  {getRealtimeQualityWarningMessage(t, code)}
                </span>
              ))}
            </div>
          )}

          {showScenarioDetails && observedIpEvidenceIps.length > 0 && selectedOwner && (
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
              <span className="text-xs font-medium text-muted-foreground">
                {t('pages.rules.realtimeObservedIps')}
              </span>
              {observedIpEvidenceIps.slice(0, 8).map((ip) => (
                <label
                  key={ip}
                  className="flex items-center gap-1 rounded-md border border-border/70 px-2 py-1 text-xs"
                >
                  <Checkbox
                    checked={selectedObservedIps.includes(ip)}
                    onCheckedChange={(checked) => handleToggleObservedIp(ip, checked === true)}
                  />
                  <span>{ip}</span>
                </label>
              ))}
              {observedIpEvidenceIps.length > 8 && (
                <span className="text-xs text-muted-foreground">
                  {t('pages.rules.realtimeObservedIpsMore', {
                    count: observedIpEvidenceIps.length - 8
                  })}
                </span>
              )}
              <Select
                value={observedIpPromotionTarget}
                onValueChange={setObservedIpPromotionTarget}
              >
                <SelectTrigger className="h-8 w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['PROXY', 'DIRECT'].map((target) => (
                    <SelectItem key={target} value={target}>
                      {getTargetLabel(t, selectedOwner, target)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={rulesBusy || ownerUnavailable || selectedObservedIps.length === 0}
                onClick={handlePromoteObservedIps}
              >
                {t('pages.rules.promoteObservedIps')}
              </Button>
              <span className="text-xs text-muted-foreground">
                {t('pages.rules.realtimeObservedIpPromotionHint')}
              </span>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card/30 p-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">{t('pages.rules.manageRulesTitle')}</div>
              <div className="text-xs text-muted-foreground">
                {t('pages.rules.manageRulesDescription')}
              </div>
            </div>
            <Badge variant="outline" className="rounded-sm">
              {filteredRules.length}/{allDisplayRules.length}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="h-8 min-w-60 flex-1 text-sm"
              value={filter}
              placeholder={t('common.filter')}
              onChange={(e) => setFilter(e.target.value)}
            />
            <Select
              value={ownerTypeFilter}
              onValueChange={(value) => setOwnerTypeFilter(value as 'all' | 'mihomo' | 'amnezia')}
            >
              <SelectTrigger size="sm" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value="all">{t('pages.rules.scopeAll')}</SelectItem>
                <SelectItem value="mihomo">{t('pages.rules.ownerMihomo')}</SelectItem>
                <SelectItem value="amnezia">{t('pages.rules.ownerVpn')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={profileFilter} onValueChange={setProfileFilter}>
              <SelectTrigger size="sm" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value="all">{t('pages.rules.allProfiles')}</SelectItem>
                {bundle.ruleOwners.map((owner) => (
                  <SelectItem key={owner.id} value={owner.ownerProfileId}>
                    {getOwnerLabel(t, owner)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value="all">{t('pages.rules.allActions')}</SelectItem>
                {actionFilterOptions.map((target) => (
                  <SelectItem key={target} value={target}>
                    {getTargetLabel(t, selectedOwner, target)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5"
              onClick={() => setShowAdvancedManagement((value) => !value)}
            >
              <SlidersHorizontal className="size-4" />
              {showAdvancedManagement
                ? t('pages.rules.hideAdvancedManagement')
                : t('pages.rules.showAdvancedManagement')}
            </Button>
            <span className="text-xs text-muted-foreground">
              {t('pages.rules.bulkEditableHint')}
            </span>
          </div>

          {showAdvancedManagement && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border/70 bg-card/30 p-2">
              <Button
                size="sm"
                variant="outline"
                disabled={selectableFilteredRuleIds.length === 0}
                onClick={
                  allFilteredManagedRulesSelected
                    ? handleClearSelection
                    : handleSelectAllFilteredRules
                }
              >
                {allFilteredManagedRulesSelected
                  ? t('pages.rules.clearSelection')
                  : t('pages.rules.selectFiltered')}
              </Button>
              <Select value={duplicateOwnerId} onValueChange={setDuplicateOwnerId}>
                <SelectTrigger size="sm" className="w-52">
                  <SelectValue placeholder={t('pages.rules.duplicateTarget')} />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {bundle.ruleOwners.map((owner) => (
                    <SelectItem key={owner.id} value={owner.id}>
                      {getOwnerLabel(t, owner)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setShowBulkImport((value) => !value)}
              >
                <Upload className="size-4" />
                {t('pages.rules.bulkImport')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={filteredManagedRules.length === 0}
                onClick={() => handleExportRules(filteredManagedRules)}
              >
                <Download className="size-4" />
                {t('pages.rules.exportFiltered')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={selectedOwnerManagedRules.length === 0}
                onClick={() => handleExportRules(selectedOwnerManagedRules)}
              >
                <Download className="size-4" />
                {t('pages.rules.exportOwner')}
              </Button>
            </div>
          )}
        </div>

        {showBulkImport && (
          <div className="rounded-lg border border-border bg-card/40 p-2">
            <div className="mb-2 text-xs text-muted-foreground">
              {t('pages.rules.bulkImportOwnerHint', {
                name: selectedOwner ? getOwnerLabel(t, selectedOwner) : '-',
                action: getTargetLabel(t, selectedOwner, newRuleTarget)
              })}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <Textarea
                className="min-h-20 flex-1 text-sm"
                value={bulkImportText}
                placeholder={t('pages.rules.bulkImportPlaceholder')}
                onChange={(e) => setBulkImportText(e.target.value)}
              />
              <Button
                size="sm"
                className="gap-1.5"
                disabled={rulesBusy || ownerUnavailable || !selectedOwner || !bulkImportText.trim()}
                onClick={handleBulkImport}
              >
                <Upload className="size-4" />
                {t('pages.rules.bulkImportApply')}
              </Button>
            </div>
            {bulkImportSummary && (
              <div className="mt-2 text-xs text-muted-foreground">{bulkImportSummary}</div>
            )}
          </div>
        )}

        {selectedRules.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/40 p-2">
            <span className="text-xs font-medium">
              {t('pages.rules.selectedRules', { count: selectedRules.length })}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={rulesBusy}
              onClick={() => handleBulkSetEnabled(true)}
            >
              {t('pages.rules.enableSelected')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={rulesBusy}
              onClick={() => handleBulkSetEnabled(false)}
            >
              {t('pages.rules.disableSelected')}
            </Button>
            <Select value={duplicateOwnerId} onValueChange={setDuplicateOwnerId}>
              <SelectTrigger size="sm" className="w-52">
                <SelectValue placeholder={t('pages.rules.duplicateTarget')} />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {bundle.ruleOwners.map((owner) => (
                  <SelectItem key={owner.id} value={owner.id}>
                    {getOwnerLabel(t, owner)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={rulesBusy || !duplicateOwner}
              onClick={handleBulkDuplicate}
            >
              {t('pages.rules.duplicateSelected')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={rulesBusy}
              onClick={() => handleExportRules(selectedRules)}
            >
              {t('pages.rules.exportSelected')}
            </Button>
            <Button size="sm" variant="destructive" disabled={rulesBusy} onClick={handleBulkDelete}>
              {t('pages.rules.deleteSelected')}
            </Button>
            <Button size="sm" variant="ghost" disabled={rulesBusy} onClick={handleClearSelection}>
              {t('pages.rules.clearSelection')}
            </Button>
          </div>
        )}
      </div>
      <Separator className="mx-2" />
      <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('pages.rules.sectionList')}
      </div>
      <div className="mt-px">
        {filteredRules.map((rule, i) => {
          const bypass = getUnifiedRuleBypassPresentation(rule, bypassContext)
          return (
            <RuleItem
              key={rule.id}
              index={i}
              type={rule.type}
              payload={rule.value}
              proxy={getRuleTargetLabel(t, rule)}
              bypassLabel={bypass ? t(bypass.labelKey) : undefined}
              bypassHint={bypass ? t(bypass.hintKey) : undefined}
              bypassTone={bypass?.tone}
              bypassVariant={getBypassBadgeVariant(bypass?.tone)}
              size={rule.size}
              enabled={rule.enabled}
              note={rule.note}
              sourceLabel={getRuleSourceLabel(t, rule)}
              scopeLabel={rule.ownerProfileName}
              disabledLabel={t('profile.helperRuleDisabled')}
              actions={
                rule.editable && rule.managedPatchSection !== undefined ? (
                  <>
                    <Checkbox
                      checked={selectedRuleIdSet.has(rule.id)}
                      disabled={rulesBusy}
                      title={t('pages.rules.selectRule')}
                      onCheckedChange={(checked) =>
                        handleToggleRuleSelection(rule, checked === true)
                      }
                    />
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={rulesBusy || !canMoveRule(rule, 'up')}
                      title={t('pages.rules.moveRuleUp')}
                      onClick={() => handleMoveRule(rule, 'up')}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={rulesBusy || !canMoveRule(rule, 'down')}
                      title={t('pages.rules.moveRuleDown')}
                      onClick={() => handleMoveRule(rule, 'down')}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={rulesBusy}
                      title={t('pages.rules.editRule')}
                      onClick={() => handleStartEditRule(rule)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={rulesBusy}
                      onClick={() => handleToggleRule(rule)}
                    >
                      {rule.enabled ? t('pages.rules.disableRule') : t('pages.rules.enableRule')}
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={
                        rulesBusy ||
                        !duplicateOwner ||
                        duplicateOwner.ownerProfileId === rule.ownerProfileId
                      }
                      title={t('pages.rules.duplicateRuleToProfile')}
                      onClick={() => handleDuplicateRule(rule)}
                    >
                      <Copy className="size-4" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={rulesBusy}
                      title={t('pages.rules.deleteRule')}
                      onClick={() => handleDeleteRule(rule)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                ) : undefined
              }
            />
          )
        })}
      </div>
    </BasePage>
  )
}

function RuleCountBadges({
  bundle,
  rules
}: {
  bundle: UnifiedUiBundle
  rules: UnifiedRuleItem[]
}): React.ReactElement {
  const { t } = useTranslation()
  const mihomo = rules.filter((rule) => rule.scopeId === 'mihomo')
  const amnezia = rules.filter((rule) => rule.scopeId === 'amnezia')
  return (
    <>
      <Badge variant="secondary" className="rounded-sm">
        {t('pages.rules.scopeAll')}: {rules.length}
      </Badge>
      {bundle.ruleScopes.some((scope) => scope.id === 'mihomo') && (
        <Badge variant="outline" className="rounded-sm">
          {t('pages.rules.scopeMihomo')}: {mihomo.length}
        </Badge>
      )}
      {bundle.ruleScopes.some((scope) => scope.id === 'amnezia') && (
        <Badge variant="outline" className="rounded-sm">
          {t('pages.rules.scopeAmnezia')}: {amnezia.filter((rule) => rule.enabled).length}/
          {amnezia.length}
        </Badge>
      )}
    </>
  )
}

function UnifiedStatusBadges({ bundle }: { bundle: UnifiedUiBundle }): React.ReactElement {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge
        variant={getStatusBadgeVariant(bundle.connectionStatus.mihomoStatus)}
        className="rounded-sm"
      >
        {t('pages.rules.scopeMihomo')}: {getStatusLabel(t, bundle.connectionStatus.mihomoStatus)}
      </Badge>
      <Badge
        variant={getStatusBadgeVariant(bundle.connectionStatus.amneziaStatus)}
        className="rounded-sm"
      >
        {t('pages.rules.scopeAmnezia')}: {getStatusLabel(t, bundle.connectionStatus.amneziaStatus)}
      </Badge>
      <Badge
        variant={getStatusBadgeVariant(bundle.connectionStatus.tunStatus)}
        className="rounded-sm"
      >
        TUN: {getStatusLabel(t, bundle.connectionStatus.tunStatus)}
      </Badge>
    </div>
  )
}

function getStatusBadgeVariant(
  status: UnifiedStatusLevel
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'blocked') return 'destructive'
  if (status === 'warning') return 'outline'
  if (status === 'ready') return 'default'
  return 'secondary'
}

function getBypassBadgeVariant(
  tone: UnifiedRuleBypassTone | undefined
): 'default' | 'secondary' | 'destructive' | 'outline' | undefined {
  if (tone === 'info') return 'default'
  if (tone === 'danger') return 'destructive'
  if (tone === 'warning') return 'outline'
  if (tone === 'neutral') return 'secondary'
  return undefined
}

function getRealtimeQualityBadgeVariant(
  tone: RealtimePresetQualityTone
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (tone === 'success') return 'default'
  if (tone === 'danger') return 'destructive'
  if (tone === 'warning') return 'outline'
  return 'secondary'
}

function getRealtimeQualityBadgeClassName(tone: RealtimePresetQualityTone): string {
  if (tone === 'success') return 'rounded-sm bg-green-600 text-white'
  if (tone === 'warning') return 'rounded-sm border-warning text-warning'
  return 'rounded-sm'
}

function getRealtimeConfidenceClassName(confidence: 'high' | 'medium' | 'low'): string {
  if (confidence === 'high') return 'text-xs text-green-500'
  if (confidence === 'medium') return 'text-xs text-warning'
  return 'text-xs text-destructive'
}

function getRealtimeQualityWarningMessage(
  t: ReturnType<typeof useTranslation>['t'],
  code: string
): string {
  switch (code) {
    case 'no_evidence':
      return t('profile.realtimeQualityWarningNoEvidence')
    case 'local_evidence_only':
      return t('profile.realtimeQualityWarningLocalOnly')
    case 'stale_evidence_present':
    case 'evidence_stale':
    case 'validation_expired':
    case 'environment_changed':
      return t('profile.realtimeQualityWarningStale')
    case 'validation_failed':
    case 'smoke_failed':
      return t('profile.realtimeQualityWarningFailed')
    case 'smoke_partial':
    case 'preset_partially_validated':
      return t('profile.realtimeQualityWarningPartial')
    case 'no_observed_ip_evidence':
      return t('profile.realtimeQualityWarningNoObservedIps')
    case 'macos_fallback_heavy':
      return t('profile.realtimeQualityWarningMacosFallback')
    case 'windows_native_bypass_requires_service':
      return t('profile.realtimeQualityWarningWindowsService')
    default:
      return code
  }
}

function getRealtimeWarningMessage(
  t: ReturnType<typeof useTranslation>['t'],
  warning: { code: string; message: string }
): string {
  switch (warning.code) {
    case 'udp_not_validated':
      return t('profile.realtimeWarningUdpNotValidated')
    case 'udp_not_end_to_end_validated':
      return t('profile.realtimeWarningUdpNotEndToEndValidated')
    case 'no_proxy_rule_coverage':
      return t('profile.realtimeWarningNoProxyRuleCoverage')
    case 'no_final_proxy_catch_all':
      return t('profile.realtimeWarningNoFinalProxyCatchAll')
    case 'domain_only_rules_partial':
      return t('profile.realtimeWarningDomainOnlyRulesPartial')
    case 'process_only_rules_partial':
      return t('profile.realtimeWarningProcessOnlyRulesPartial')
    case 'process_name_metadata_platform_dependent':
      return t('profile.realtimeWarningProcessNameMetadataPlatformDependent')
    default:
      return warning.message
  }
}

function getRealtimeReasonMessage(
  t: ReturnType<typeof useTranslation>['t'],
  reason: { code: string; message: string }
): string {
  switch (reason.code) {
    case 'preset_not_tested':
      return t('profile.realtimeReasonPresetNotTested')
    case 'preset_partially_validated':
      return t('profile.realtimeReasonPresetPartiallyValidated')
    case 'preset_smoke_passed':
      return t('profile.realtimeReasonPresetSmokePassed')
    case 'preset_validation_failed':
      return t('profile.realtimeReasonPresetValidationFailed')
    case 'preset_validation_stale':
      return t('profile.realtimeReasonPresetValidationStale')
    default:
      return getRealtimeWarningMessage(t, reason)
  }
}

function getRealtimeActionMessage(
  t: ReturnType<typeof useTranslation>['t'],
  action: { code: string; message: string }
): string {
  switch (action.code) {
    case 'validate_helper_udp':
      return t('profile.realtimeActionValidateHelperUdp')
    case 'verify_udp_end_to_end':
      return t('profile.realtimeActionVerifyUdpEndToEnd')
    case 'add_realtime_preset':
      return t('profile.realtimeActionAddPreset')
    case 'add_final_match_proxy':
      return t('profile.realtimeActionAddFinalMatchProxy')
    case 'add_process_and_domain_rules':
      return t('profile.realtimeActionAddProcessAndDomainRules')
    case 'strengthen_domain_coverage':
      return t('profile.realtimeActionStrengthenDomainCoverage')
    case 'add_observed_ip_rules':
      return t('profile.realtimeActionAddObservedIpRules')
    case 'review_platform_process_fallback':
      return t('profile.realtimeActionReviewPlatformProcessFallback')
    case 'run_realtime_smoke':
      return t('profile.realtimeActionRunRealtimeSmoke')
    default:
      return action.message
  }
}

function getRealtimeValidationStatusLabel(
  t: ReturnType<typeof useTranslation>['t'],
  status: RealtimePresetValidationStatus
): string {
  switch (status) {
    case 'validated':
      return t('profile.realtimeValidationValidated')
    case 'smoke_passed':
      return t('profile.realtimeValidationSmokePassed')
    case 'partial':
      return t('profile.realtimeValidationPartial')
    case 'failed':
      return t('profile.realtimeValidationFailed')
    case 'not_tested':
      return t('profile.realtimeValidationNotTested')
  }
}

function getRealtimeFreshnessMessage(
  t: ReturnType<typeof useTranslation>['t'],
  validation: RealtimeReliabilitySummary['presetValidation']
): string {
  if (validation.environmentChanged) return t('profile.realtimeValidationEnvironmentChanged')
  if (validation.validationExpired) return t('profile.realtimeValidationExpired')
  return ''
}

function getRealtimeValidationSourceLabel(
  t: ReturnType<typeof useTranslation>['t'],
  source: RealtimePresetValidationSource
): string {
  switch (source) {
    case 'rule_analysis':
    case 'runtime_analysis':
      return t('profile.realtimeValidationSourceRuleAnalysis')
    case 'runtime_state':
      return t('profile.realtimeValidationSourceRuntimeState')
    case 'connectivity_probe':
    case 'helper_connectivity':
      return t('profile.realtimeValidationSourceConnectivityProbe')
    case 'preset_smoke':
    case 'manual_smoke':
      return t('profile.realtimeValidationSourcePresetSmoke')
    case 'manual_confirmation':
      return t('profile.realtimeValidationSourceManualConfirmation')
    case 'unknown':
      return t('profile.realtimeValidationSourceUnknown')
  }
}

function formatRealtimeBoolean(t: ReturnType<typeof useTranslation>['t'], value: boolean): string {
  return value ? t('profile.booleanYes') : t('profile.booleanNo')
}

function formatRealtimeTimestamp(value: number): string {
  return new Date(value).toLocaleString()
}

function getStatusLabel(
  t: ReturnType<typeof useTranslation>['t'],
  status: UnifiedStatusLevel
): string {
  switch (status) {
    case 'ready':
      return t('profile.helperReadinessComponentReady')
    case 'warning':
      return t('profile.helperReadinessComponentWarning')
    case 'blocked':
      return t('profile.helperReadinessComponentBlocked')
    case 'unknown':
      return t('profile.helperReadinessComponentUnknown')
  }
}

function getRuleSourceLabel(
  t: ReturnType<typeof useTranslation>['t'],
  rule: UnifiedRuleItem
): string {
  return rule.ownerType === 'amnezia' ? t('pages.rules.ownerVpn') : t('pages.rules.ownerMihomo')
}

function getRuleTargetLabel(
  t: ReturnType<typeof useTranslation>['t'],
  rule: UnifiedRuleItem
): string {
  const displayTarget = getUnifiedRuleDisplayTarget(rule.ownerType, rule.target)
  return displayTarget === 'VPN / PROXY' ? t('pages.rules.actionVpnProxy') : displayTarget
}

function getTargetLabel(
  t: ReturnType<typeof useTranslation>['t'],
  owner: UnifiedRuleOwner | undefined,
  target: string
): string {
  const displayTarget = getUnifiedRuleDisplayTarget(owner?.ownerType ?? 'mihomo', target)
  return displayTarget === 'VPN / PROXY' ? t('pages.rules.actionVpnProxy') : displayTarget
}

function getOwnerLabel(t: ReturnType<typeof useTranslation>['t'], owner: UnifiedRuleOwner): string {
  const ownerTypeLabel =
    owner.ownerType === 'amnezia' ? t('pages.rules.ownerVpn') : t('pages.rules.ownerMihomo')
  const currentSuffix = owner.isCurrent ? ` · ${t('pages.rules.currentOwner')}` : ''
  return `${ownerTypeLabel}: ${owner.ownerProfileName}${currentSuffix}`
}

function getScopeUnavailableText(
  t: ReturnType<typeof useTranslation>['t'],
  reason: string
): string {
  switch (reason) {
    case 'no_current_mihomo_profile':
    case 'no_mihomo_rule_owner':
      return t('pages.rules.noCurrentMihomoProfile')
    case 'no_amnezia_rule_owner':
      return t('pages.rules.noAmneziaRuleOwner')
    default:
      return reason
  }
}

async function appendProfileRule(profileId: string, serializedRule: string): Promise<boolean> {
  const rulePatch = await readProfileRulePatch(profileId)
  const result = appendUnifiedManagedRule(rulePatch, serializedRule)
  await writeProfileRulePatch(profileId, result.patch)
  return result.added
}

function groupManagedRulesByProfileId(rules: UnifiedRuleItem[]): Map<string, UnifiedRuleItem[]> {
  const grouped = new Map<string, UnifiedRuleItem[]>()
  for (const rule of rules) {
    if (!isUnifiedManagedRuleSelectable(rule)) continue
    const current = grouped.get(rule.ownerProfileId) ?? []
    current.push(rule)
    grouped.set(rule.ownerProfileId, current)
  }
  return grouped
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard API is unavailable')
  }
  await navigator.clipboard.writeText(text)
}

async function readRulePatches(
  profileIds: string[]
): Promise<Record<string, UnifiedRulePatchFile>> {
  const entries = await Promise.all(
    profileIds.map(async (profileId) => [profileId, await readProfileRulePatch(profileId)] as const)
  )
  return Object.fromEntries(entries)
}

async function readProfileRulePatch(profileId: string): Promise<UnifiedRulePatchFile> {
  try {
    const content = await getRuleStr(profileId)
    const parsed = yaml.load(content)
    return normalizeUnifiedRulePatchFile(parsed)
  } catch {
    // No per-profile rule patch exists yet.
  }

  return createEmptyUnifiedRulePatchFile()
}

async function writeProfileRulePatch(
  profileId: string,
  rulePatch: UnifiedRulePatchFile
): Promise<void> {
  const normalizedPatch = dedupeUnifiedRulePatchFile(rulePatch)
  await setRuleStr(
    profileId,
    yaml.dump({
      prepend: normalizedPatch.prepend,
      append: normalizedPatch.append,
      delete: normalizedPatch.delete,
      disabled: normalizedPatch.disabled
    })
  )
}

export default Rules
