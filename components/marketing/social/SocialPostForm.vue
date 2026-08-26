<script setup lang="ts">
import type { MarketingPostScheduleInput } from '~/types/marketing-schedules'
import type {
  ApprovalPolicy,
  MediaAsset,
  MediaAssetPurpose,
  SocialAccount,
  SocialPostInput,
  SocialPostVariantInput,
  SocialProductionPriority,
} from '~/types/marketing-social'

import ProductionMetaFields from '~/components/marketing/content/ProductionMetaFields.vue'
import ScheduleSlotsEditor from '~/components/marketing/content/ScheduleSlotsEditor.vue'
import SocialPostComposer from '~/components/marketing/social/SocialPostComposer.vue'
import SocialPostPreviewPanel from '~/components/marketing/social/SocialPostPreviewPanel.vue'
import { toast } from 'vue-sonner'
import {
  buildCaptionWithHashtags,
  formatHashtagsInline,
  parseHashtags,
} from '~/utils/social-hashtags'
import {
  isAcceptedMediaFile,
  mediaFileAcceptAttr,
  mediaFileRejectMessage,
} from '~/utils/file-drop'

const props = defineProps<{
  initialValue?: SocialPostInput
  saving?: boolean
}>()

const emit = defineEmits<{
  save: [value: SocialPostInput]
}>()

interface TeamMemberOption {
  userId: string
  name: string
  email: string
}

interface CampaignOption {
  id: string
  name: string
  status: string
}

const social = useMarketingSocial()
const { isClientExperience } = useMarketingAudience()
const currentStep = ref(1)
const formError = ref('')
const title = ref(props.initialValue?.title || '')
const content = ref(props.initialValue?.content || '')
const artText = ref(props.initialValue?.artText || '')
const cta = ref(props.initialValue?.cta || '')
const hashtags = ref<string[]>([...(props.initialValue?.hashtags || [])])
const showLinkField = ref(Boolean(props.initialValue?.variants?.[0]?.linkUrl))
const campaignId = ref(props.initialValue?.campaignId || 'none')
const assignedTo = ref(props.initialValue?.assignedTo || 'none')
const customizeVariants = ref(false)
const scheduledAt = ref(props.initialValue?.scheduledAt?.slice(0, 16) || '')
const schedules = ref<MarketingPostScheduleInput[]>(
  props.initialValue?.schedules?.length
    ? props.initialValue.schedules.map(slot => ({
        ...slot,
        scheduledAt: slot.scheduledAt.slice(0, 16),
      }))
    : (props.initialValue?.scheduledAt
        ? [{ scheduledAt: props.initialValue.scheduledAt.slice(0, 16), platform: null, format: null }]
        : []),
)
const copyOwnerId = ref(props.initialValue?.copyOwnerId || 'none')
const designOwnerId = ref(props.initialValue?.designOwnerId || 'none')
const publishOwnerId = ref(props.initialValue?.publishOwnerId || 'none')
const productionPriority = ref<SocialProductionPriority>(props.initialValue?.productionPriority || 'normal')
const productionDueAt = ref(props.initialValue?.productionDueAt?.slice(0, 16) || '')
const approvalPolicy = ref<ApprovalPolicy>(props.initialValue?.approvalPolicy || 'any')
const minimumApprovals = ref(props.initialValue?.minimumApprovals || 1)
const variants = ref<SocialPostVariantInput[]>(props.initialValue?.variants || [])
const publicationFormat = ref<SocialPostVariantInput['format']>(props.initialValue?.variants?.[0]?.format || 'static')
const publicationLink = ref(props.initialValue?.variants?.[0]?.linkUrl || '')
const publicationAssetIds = ref<string[]>(props.initialValue?.variants?.[0]?.assetIds || [])
const referenceAssetIds = ref(props.initialValue?.referenceAssetIds || [])
const uploading = ref(false)
const slideDirection = ref<'left' | 'right'>('left')

const {
  isDragOver: isPublicationDragOver,
  onDragEnter: onPublicationDragEnter,
  onDragOver: onPublicationDragOver,
  onDragLeave: onPublicationDragLeave,
  onDrop: takePublicationDrop,
  reset: resetPublicationDrop,
} = useFileDropZone({ disabled: uploading })
const {
  isDragOver: isReferenceDragOver,
  onDragEnter: onReferenceDragEnter,
  onDragOver: onReferenceDragOver,
  onDragLeave: onReferenceDragLeave,
  onDrop: takeReferenceDrop,
  reset: resetReferenceDrop,
} = useFileDropZone({ disabled: uploading })
const publicationFileInput = ref<HTMLInputElement | null>(null)
const referenceFileInput = ref<HTMLInputElement | null>(null)

const steps = [
  { step: 1, title: 'Conteúdo', description: 'Título e legenda', icon: 'lucide:pen-line' },
  { step: 2, title: 'Redes', description: 'Canais e formato', icon: 'lucide:share-2' },
  { step: 3, title: 'Planejamento', description: 'Mídia e agenda', icon: 'lucide:calendar-clock' },
  { step: 4, title: 'Revisão', description: 'Conferir e salvar', icon: 'lucide:check-circle-2' },
]

const stepProgress = computed(() => ((currentStep.value - 1) / (steps.length - 1)) * 100)

const { data: accounts, pending: accountsPending, refresh: refreshAccounts } = useMarketingFetch({
  key: () => `marketing-social-form-accounts-${social.tenantId.value}`,
  handler: () => social.listAccounts(),
  default: () => [] as SocialAccount[],
  watch: [social.tenantId],
  enabled: () => Boolean(social.tenantId.value),
})
const { data: assets, pending: assetsPending, refresh: refreshAssets } = useMarketingFetch({
  key: () => `marketing-social-form-assets-${social.tenantId.value}`,
  handler: () => social.listAssets(),
  default: () => [] as MediaAsset[],
  watch: [social.tenantId],
  enabled: () => Boolean(social.tenantId.value),
})
const { data: campaigns, pending: _campaignsPending } = useMarketingFetch({
  key: () => `marketing-social-form-campaigns-${social.tenantId.value}`,
  handler: async () => {
    const response = await $fetch<{ data: CampaignOption[] }>('/api/marketing/social/campaigns', {
      query: { tenant_id: social.tenantId.value || undefined, status: 'all' },
    }).catch(() => ({ data: [] as CampaignOption[] }))
    return response.data
  },
  default: () => [] as CampaignOption[],
  watch: [social.tenantId],
  enabled: () => Boolean(social.tenantId.value),
})
const { data: members, pending: _membersPending } = useMarketingFetch({
  key: () => `marketing-social-form-members-${social.tenantId.value}`,
  handler: async () => {
    const response = await $fetch<{ data: TeamMemberOption[] }>(
      '/api/marketing/social/approvers',
      { query: { tenant_id: social.tenantId.value || undefined } },
    ).catch(() => ({ data: [] as TeamMemberOption[] }))
    return response.data
  },
  default: () => [] as TeamMemberOption[],
  watch: [social.tenantId, isClientExperience],
  enabled: () => !isClientExperience.value && Boolean(social.tenantId.value),
})
const formDataPending = computed(() => accountsPending.value || assetsPending.value)

const { draft: brandGuide } = useBrandGuide()
const suggestedHashtags = computed(() => brandGuide.value?.hashtags || [])

const previewAccount = computed(() => {
  const first = variants.value[0]
  if (!first)
    return { name: 'Sua página', platform: 'facebook' as const }
  const account = accounts.value?.find(item => item.id === first.accountId)
  return {
    name: account?.name || platformLabel(first.platform),
    platform: first.platform,
  }
})

const previewMedia = computed(() => {
  const assetId = publicationAssetIds.value[0]
  if (!assetId)
    return { url: null, type: null as 'image' | 'video' | null }
  const asset = publicationAssetById(assetId)
  const mime = asset?.mimeType || asset?.mime_type || ''
  const url = asset?.previewUrl || asset?.preview_url || null
  return {
    url,
    type: mime.startsWith('video/') ? 'video' as const : mime.startsWith('image/') ? 'image' as const : null,
  }
})

const composedCaptionPreview = computed(() =>
  buildCaptionWithHashtags(content.value, hashtags.value),
)

const selectedCampaignName = computed(() => {
  if (campaignId.value === 'none')
    return 'Sem campanha'
  return campaigns.value?.find(item => item.id === campaignId.value)?.name || 'Campanha'
})
const selectedAssigneeName = computed(() => {
  if (assignedTo.value === 'none')
    return 'Sem responsável'
  return members.value?.find(item => item.userId === assignedTo.value)?.name || 'Responsável'
})

const publicationAssets = computed(() =>
  (assets.value || []).filter(asset => asset.purpose === 'publication' || (asset as any).purpose === 'publication'),
)
const referenceAssets = computed(() =>
  (assets.value || []).filter(asset => asset.purpose === 'reference' || (asset as any).purpose === 'reference'),
)
const hasFormatConflict = computed(() => {
  if (publicationFormat.value === 'video' && variants.value.some(variant => variant.platform === 'linkedin'))
    return true
  if (publicationFormat.value === 'story' && variants.value.some(variant => variant.platform === 'linkedin'))
    return true
  return false
})
const allAccountsSelected = computed(() =>
  Boolean(accounts.value?.length)
  && accounts.value.every(account => accountSelected(account.id)),
)
const formatLabel = computed(() => ({
  static: 'Post estático',
  carousel: 'Carrossel',
  video: 'Vídeo',
  story: 'Stories',
})[publicationFormat.value])
const approvalLabel = computed(() => {
  if (approvalPolicy.value === 'all')
    return 'Todos devem aprovar'
  if (approvalPolicy.value === 'minimum')
    return `Mínimo de ${minimumApprovals.value} aprovações`
  return 'Uma aprovação'
})
const mediaSelectionValid = computed(() => {
  if (publicationFormat.value === 'carousel')
    return publicationAssetIds.value.length >= 2 && publicationAssetIds.value.length <= 10
  return publicationAssetIds.value.length === 1
})

watch(
  () => props.initialValue,
  (value) => {
    if (!value)
      return
    title.value = value.title
    content.value = value.content || ''
    artText.value = value.artText || ''
    cta.value = value.cta || ''
    hashtags.value = [...(value.hashtags || [])]
    showLinkField.value = Boolean(value.variants?.[0]?.linkUrl)
    campaignId.value = value.campaignId || 'none'
    assignedTo.value = value.assignedTo || 'none'
    scheduledAt.value = value.scheduledAt?.slice(0, 16) || ''
    schedules.value = value.schedules?.length
      ? value.schedules.map(slot => ({
          ...slot,
          scheduledAt: slot.scheduledAt.slice(0, 16),
        }))
      : (value.scheduledAt
          ? [{ scheduledAt: value.scheduledAt.slice(0, 16), platform: null, format: null }]
          : [])
    copyOwnerId.value = value.copyOwnerId || 'none'
    designOwnerId.value = value.designOwnerId || 'none'
    publishOwnerId.value = value.publishOwnerId || 'none'
    productionPriority.value = value.productionPriority || 'normal'
    productionDueAt.value = value.productionDueAt?.slice(0, 16) || ''
    approvalPolicy.value = value.approvalPolicy || 'any'
    minimumApprovals.value = value.minimumApprovals || 1
    variants.value = value.variants ? structuredClone(value.variants) : []
    customizeVariants.value = Boolean(value.variants?.some((variant) => {
      const captionDiffers = Boolean(variant.caption && variant.caption !== value.content)
      const hashtagsOverride = Boolean(variant.hashtags?.length)
      const config = variant.platformConfig || {}
      return captionDiffers || hashtagsOverride || Boolean(config.cta) || Boolean(config.artText)
    }))
    publicationFormat.value = value.variants?.[0]?.format || 'static'
    publicationLink.value = value.variants?.[0]?.linkUrl || ''
    publicationAssetIds.value = value.variants?.[0]?.assetIds ? [...value.variants[0].assetIds] : []
    referenceAssetIds.value = value.referenceAssetIds ? [...value.referenceAssetIds] : []
  },
  { deep: true },
)

function accountSelected(accountId: string) {
  return variants.value.some(variant => variant.accountId === accountId)
}

function platformLabel(platform: SocialAccount['platform']) {
  return {
    facebook: 'Facebook',
    instagram: 'Instagram',
    linkedin: 'LinkedIn',
  }[platform]
}

function ensureVariantDefaults(variant: SocialPostVariantInput): SocialPostVariantInput {
  return {
    ...variant,
    caption: variant.caption || content.value,
    hashtags: variant.hashtags?.length ? variant.hashtags : [...hashtags.value],
    platformConfig: {
      ...(variant.platformConfig || {}),
      artText: String(variant.platformConfig?.artText || artText.value || ''),
      cta: String(variant.platformConfig?.cta || cta.value || ''),
    },
  }
}

function toggleAccount(account: SocialAccount) {
  if (accountSelected(account.id)) {
    variants.value = variants.value.filter(variant => variant.accountId !== account.id)
    return
  }
  variants.value.push(ensureVariantDefaults({
    accountId: account.id,
    platform: account.platform,
    format: publicationFormat.value,
    caption: content.value,
    hashtags: [...hashtags.value],
    platformConfig: {
      artText: artText.value || '',
      cta: cta.value || '',
    },
    assetIds: [],
  }))
}

function updateVariantField(
  accountId: string,
  field: 'caption' | 'hashtagsText' | 'artText' | 'cta',
  value: string,
) {
  variants.value = variants.value.map((variant) => {
    if (variant.accountId !== accountId)
      return variant
    if (field === 'caption')
      return { ...variant, caption: value }
    if (field === 'hashtagsText')
      return { ...variant, hashtags: parseHashtags(value) }
    return {
      ...variant,
      platformConfig: {
        ...(variant.platformConfig || {}),
        [field]: value,
      },
    }
  })
}

function variantHashtagsText(variant: SocialPostVariantInput) {
  return formatHashtagsInline(variant.hashtags || [])
}

function toggleAllAccounts() {
  if (allAccountsSelected.value) {
    variants.value = []
    return
  }

  const existing = new Map(variants.value.map(variant => [variant.accountId, variant]))
  variants.value = (accounts.value || []).map(account => existing.get(account.id) || ensureVariantDefaults({
    accountId: account.id,
    platform: account.platform,
    format: publicationFormat.value,
    caption: content.value,
    hashtags: [...hashtags.value],
    platformConfig: {
      artText: artText.value || '',
      cta: cta.value || '',
    },
    assetIds: [],
  }))
}

function toggleAsset(assetId: string) {
  const selected = new Set(publicationAssetIds.value)
  if (selected.has(assetId)) {
    selected.delete(assetId)
  }
  else if (publicationFormat.value === 'carousel' && selected.size < 10) {
    selected.add(assetId)
  }
  else if (publicationFormat.value !== 'carousel') {
    selected.clear()
    selected.add(assetId)
  }
  publicationAssetIds.value = [...selected]
}

function compatiblePublicationAssets() {
  return publicationAssets.value.filter((asset) => {
    const mimeType = asset.mimeType || (asset as any).mime_type || ''
    if (publicationFormat.value === 'video')
      return mimeType.startsWith('video/')
    if (publicationFormat.value === 'story')
      return mimeType.startsWith('image/') || mimeType.startsWith('video/')
    return !mimeType.startsWith('video/')
  })
}

function publicationAssetById(assetId: string): any {
  return publicationAssets.value.find(asset => asset.id === assetId)
}

function changeFormat(format: unknown) {
  publicationFormat.value = format as SocialPostVariantInput['format']
  publicationAssetIds.value = []
}

function toggleReference(assetId: string) {
  const selected = new Set(referenceAssetIds.value)
  if (selected.has(assetId))
    selected.delete(assetId)
  else
    selected.add(assetId)
  referenceAssetIds.value = [...selected]
}

async function uploadFromInput(event: Event, purpose: MediaAssetPurpose) {
  const input = event.target as HTMLInputElement
  if (!input.files?.length)
    return
  const files = Array.from(input.files)
  input.value = ''
  await uploadMediaFiles(files, purpose)
}

async function onPublicationDrop(event: DragEvent) {
  const dropped = takePublicationDrop(event)
  if (!dropped.length)
    return
  const files = dropped.filter(file => isAcceptedMediaFile(file, 'publication'))
  if (!files.length) {
    toast.error(mediaFileRejectMessage('publication'))
    return
  }
  await uploadMediaFiles(files, 'publication')
}

async function onReferenceDrop(event: DragEvent) {
  const dropped = takeReferenceDrop(event)
  if (!dropped.length)
    return
  const files = dropped.filter(file => isAcceptedMediaFile(file, 'reference'))
  if (!files.length) {
    toast.error(mediaFileRejectMessage('reference'))
    return
  }
  await uploadMediaFiles(files, 'reference')
}

function openPublicationFilePicker() {
  if (uploading.value)
    return
  publicationFileInput.value?.click()
}

function openReferenceFilePicker() {
  if (uploading.value)
    return
  referenceFileInput.value?.click()
}

async function uploadMediaFiles(files: File[], purpose: MediaAssetPurpose) {
  if (!files.length || uploading.value)
    return

  uploading.value = true
  const uploadedIds: string[] = []
  try {
    for (const file of files) {
      const uploaded = await social.uploadAsset(file, purpose)
      if (uploaded?.id)
        uploadedIds.push(uploaded.id)
    }
    await refreshAssets()

    if (purpose === 'publication' && uploadedIds.length) {
      const next = [...publicationAssetIds.value]
      for (const id of uploadedIds) {
        if (!next.includes(id))
          next.push(id)
      }
      publicationAssetIds.value = next
    }
    if (purpose === 'reference' && uploadedIds.length) {
      const next = [...referenceAssetIds.value]
      for (const id of uploadedIds) {
        if (!next.includes(id))
          next.push(id)
      }
      referenceAssetIds.value = next
    }

    toast.success(
      uploadedIds.length > 1
        ? purpose === 'publication' ? 'Peças finais enviadas' : 'Referências enviadas'
        : purpose === 'publication' ? 'Peça final enviada' : 'Referência enviada',
    )
  }
  catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Não foi possível enviar o arquivo'
    toast.error(message)
  }
  finally {
    uploading.value = false
    resetPublicationDrop()
    resetReferenceDrop()
  }
}

function nextStep() {
  formError.value = ''
  if (currentStep.value === 1 && !title.value.trim()) {
    formError.value = 'Informe um título interno para continuar.'
    return
  }
  if (currentStep.value === 2 && !variants.value.length) {
    formError.value = 'Selecione ao menos uma rede social.'
    return
  }
  if (currentStep.value === 2 && hasFormatConflict.value) {
    formError.value = 'Ajuste o formato ou os canais selecionados.'
    return
  }
  if (currentStep.value === 3 && !mediaSelectionValid.value) {
    formError.value = publicationFormat.value === 'carousel'
      ? 'Selecione pelo menos duas imagens para o carrossel.'
      : 'Selecione uma peça final para continuar.'
    return
  }
  slideDirection.value = 'left'
  currentStep.value = Math.min(4, currentStep.value + 1)
}

function previousStep() {
  formError.value = ''
  slideDirection.value = 'right'
  currentStep.value = Math.max(1, currentStep.value - 1)
}

function goToStep(step: number) {
  if (step >= currentStep.value)
    return
  formError.value = ''
  slideDirection.value = step < currentStep.value ? 'right' : 'left'
  currentStep.value = step
}

function formatScheduledDate() {
  if (schedules.value.length) {
    return schedules.value
      .map((slot) => {
        if (!slot.scheduledAt)
          return null
        const label = new Intl.DateTimeFormat('pt-BR', {
          dateStyle: 'short',
          timeStyle: 'short',
        }).format(new Date(slot.scheduledAt))
        const parts = [label]
        if (slot.format === 'story')
          parts.push('Stories')
        else if (slot.format === 'video')
          parts.push('Reels/Vídeo')
        else if (slot.format === 'carousel')
          parts.push('Carrossel')
        else if (slot.format === 'static')
          parts.push('Feed')
        if (slot.platform)
          parts.push(slot.platform)
        return parts.join(' · ')
      })
      .filter(Boolean)
      .join(' · ') || 'Sem data sugerida'
  }
  if (!scheduledAt.value)
    return 'Sem data sugerida'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(scheduledAt.value))
}

function submit() {
  if (hasFormatConflict.value)
    return

  const sharedHashtags = [...hashtags.value]
  const sharedArtText = artText.value.trim()
  const sharedCta = cta.value.trim()
  const normalizedSchedules = schedules.value
    .filter(slot => slot.scheduledAt)
    .map(slot => ({
      id: slot.id,
      variantId: slot.variantId || null,
      platform: slot.platform || null,
      format: slot.format || null,
      scheduledAt: new Date(slot.scheduledAt).toISOString(),
      notes: slot.notes || null,
    }))
  const primaryScheduledAt = normalizedSchedules[0]?.scheduledAt
    || (scheduledAt.value ? new Date(scheduledAt.value).toISOString() : null)

  emit('save', {
    title: title.value.trim(),
    content: content.value,
    artText: sharedArtText || null,
    cta: sharedCta || null,
    hashtags: sharedHashtags,
    campaignId: campaignId.value === 'none' ? null : campaignId.value,
    assignedTo: assignedTo.value === 'none' ? null : assignedTo.value,
    scheduledAt: primaryScheduledAt,
    schedules: normalizedSchedules,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
    approvalPolicy: approvalPolicy.value,
    minimumApprovals: minimumApprovals.value,
    copyOwnerId: copyOwnerId.value === 'none' ? null : copyOwnerId.value,
    designOwnerId: designOwnerId.value === 'none' ? null : designOwnerId.value,
    publishOwnerId: publishOwnerId.value === 'none' ? null : publishOwnerId.value,
    productionPriority: productionPriority.value,
    productionDueAt: productionDueAt.value ? new Date(productionDueAt.value).toISOString() : null,
    variants: variants.value.map((variant) => {
      const prepared = ensureVariantDefaults(variant)
      return {
        ...prepared,
        format: publicationFormat.value,
        caption: customizeVariants.value
          ? (prepared.caption || content.value)
          : content.value,
        linkUrl: publicationLink.value || undefined,
        hashtags: customizeVariants.value
          ? (prepared.hashtags?.length ? prepared.hashtags : sharedHashtags)
          : sharedHashtags,
        platformConfig: {
          ...(prepared.platformConfig || {}),
          artText: customizeVariants.value
            ? String(prepared.platformConfig?.artText || sharedArtText || '')
            : sharedArtText,
          cta: customizeVariants.value
            ? String(prepared.platformConfig?.cta || sharedCta || '')
            : sharedCta,
        },
        assetIds: [...publicationAssetIds.value],
      }
    }),
    referenceAssetIds: referenceAssetIds.value,
  })
}
</script>

<template>
  <div v-if="formDataPending" class="space-y-4" aria-busy="true">
    <Skeleton class="h-10 w-full" />
    <Skeleton class="h-40 w-full" />
    <Skeleton class="h-10 w-2/3" />
  </div>
  <form v-else class="space-y-8" @submit.prevent="submit">
    <!-- Premium stepper with icons and progress bar -->
    <div class="relative">
      <div class="absolute left-0 right-0 top-5 z-0 mx-auto h-0.5 bg-muted" style="width: calc(100% - 8rem);">
        <div
          class="h-full bg-primary transition-all duration-500 ease-out"
          :style="{ width: `${stepProgress}%` }"
        />
      </div>
      <div class="relative z-10 flex items-start justify-between">
        <button
          v-for="item in steps"
          :key="item.step"
          type="button"
          class="group flex flex-col items-center gap-2"
          :class="item.step <= currentStep ? 'cursor-pointer' : 'cursor-default'"
          @click="goToStep(item.step)"
        >
          <div
            class="h-10 w-10 flex items-center justify-center rounded-full border-2 transition-all duration-300"
            :class="[
              currentStep === item.step
                ? 'border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25 scale-110'
                : currentStep > item.step
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-muted bg-background text-muted-foreground',
              item.step < currentStep ? 'group-hover:border-primary/70' : '',
            ]"
          >
            <Icon v-if="currentStep > item.step" name="lucide:check" class="h-4.5 w-4.5" />
            <Icon v-else :name="item.icon" class="h-4.5 w-4.5" />
          </div>
          <div class="text-center">
            <p
              class="text-xs font-medium transition-colors sm:text-sm"
              :class="currentStep >= item.step ? 'text-foreground' : 'text-muted-foreground'"
            >
              {{ item.title }}
            </p>
            <p class="hidden text-xs text-muted-foreground lg:block">
              {{ item.description }}
            </p>
          </div>
        </button>
      </div>
    </div>

    <!-- Step content with transitions -->
    <Transition
      :name="slideDirection === 'left' ? 'slide-left' : 'slide-right'"
      mode="out-in"
    >
      <!-- Step 1: Content -->
      <div v-if="currentStep === 1" :key="1" class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div class="space-y-6">
          <Card class="border-border/60 shadow-sm">
            <CardHeader class="pb-4">
              <div class="flex items-center gap-2">
                <div class="h-8 w-8 flex items-center justify-center rounded-lg bg-primary/10">
                  <Icon name="lucide:pen-line" class="h-4 w-4 text-primary" />
                </div>
                <div>
                  <CardTitle class="text-lg">
                    Detalhes do post
                  </CardTitle>
                  <CardDescription>
                    Escreva a legenda, adicione hashtags e configure o conteúdo base.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent class="space-y-5">
              <div class="space-y-2">
                <Label for="social-title" class="text-sm font-medium">
                  Título interno
                </Label>
                <Input
                  id="social-title"
                  v-model="title"
                  maxlength="180"
                  placeholder="Ex.: Campanha de inverno — lançamento"
                  class="h-11"
                />
                <p class="text-xs text-muted-foreground">
                  Usado apenas para organização interna.
                </p>
              </div>

              <div class="space-y-2">
                <Label for="social-content" class="text-sm font-medium">
                  Legenda da publicação
                </Label>
                <SocialPostComposer
                  v-model="content"
                  v-model:hashtags="hashtags"
                  :suggested-hashtags="suggestedHashtags"
                  @insert-link="showLinkField = true"
                />
              </div>

              <div v-if="showLinkField" class="space-y-2">
                <Label for="publication-link-step1">Link opcional</Label>
                <Input
                  id="publication-link-step1"
                  v-model="publicationLink"
                  type="url"
                  placeholder="https://..."
                  class="h-11"
                />
              </div>

              <div class="flex items-center justify-between gap-4 border rounded-xl bg-muted/20 px-4 py-3 transition-colors hover:bg-muted/30">
                <div class="min-w-0">
                  <p class="text-sm font-medium">
                    Personalizar post por rede
                  </p>
                  <p class="text-xs text-muted-foreground">
                    Adapte legenda, hashtags, CTA e texto da arte para cada canal.
                  </p>
                </div>
                <Switch
                  :checked="customizeVariants"
                  :disabled="!variants.length"
                  @update:checked="customizeVariants = $event"
                />
              </div>
            </CardContent>
          </Card>

          <!-- Collapsed sections for secondary fields -->
          <Card class="border-border/60 shadow-sm">
            <CardHeader class="pb-4">
              <div class="flex items-center gap-2">
                <div class="h-8 w-8 flex items-center justify-center rounded-lg bg-orange-500/10">
                  <Icon name="lucide:settings-2" class="h-4 w-4 text-orange-500" />
                </div>
                <div>
                  <CardTitle class="text-lg">
                    Configurações adicionais
                  </CardTitle>
                  <CardDescription>
                    Texto da arte, CTA, campanha e responsável.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent class="space-y-5">
              <div class="grid gap-4 md:grid-cols-2">
                <div class="space-y-2">
                  <Label for="social-art-text">Texto da arte</Label>
                  <Textarea
                    id="social-art-text"
                    v-model="artText"
                    class="min-h-24"
                    maxlength="2000"
                    placeholder="Texto que aparece na peça visual (opcional)"
                  />
                </div>
                <div class="space-y-2">
                  <Label for="social-cta">CTA</Label>
                  <Input
                    id="social-cta"
                    v-model="cta"
                    maxlength="240"
                    placeholder="Ex.: Saiba mais, Compre agora"
                    class="h-11"
                  />
                </div>
              </div>

              <div class="grid gap-4 md:grid-cols-2">
                <div class="space-y-2">
                  <Label>Campanha</Label>
                  <Select v-model="campaignId">
                    <SelectTrigger class="h-11">
                      <SelectValue placeholder="Vincular campanha" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        Sem campanha
                      </SelectItem>
                      <SelectItem
                        v-for="campaign in campaigns"
                        :key="campaign.id"
                        :value="campaign.id"
                      >
                        {{ campaign.name }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div v-if="!isClientExperience" class="space-y-2">
                  <Label>Responsável</Label>
                  <Select v-model="assignedTo">
                    <SelectTrigger class="h-11">
                      <SelectValue placeholder="Atribuir responsável" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        Sem responsável
                      </SelectItem>
                      <SelectItem
                        v-for="member in members"
                        :key="member.userId"
                        :value="member.userId"
                      >
                        {{ member.name }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div class="lg:sticky lg:top-6 lg:self-start space-y-4">
          <SocialPostPreviewPanel
            :caption="content"
            :hashtags="hashtags"
            :platform="previewAccount.platform"
            :account-name="previewAccount.name"
            :media-url="previewMedia.url"
            :media-type="previewMedia.type"
            :link-url="publicationLink || null"
          />
        </div>
      </div>

      <!-- Step 2: Networks -->
      <Card v-else-if="currentStep === 2" :key="2" class="border-border/60 shadow-sm">
        <CardHeader>
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="flex items-center gap-2">
              <div class="h-8 w-8 flex items-center justify-center rounded-lg bg-blue-500/10">
                <Icon name="lucide:share-2" class="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <CardTitle>Redes e formato</CardTitle>
                <CardDescription>
                  Selecione um canal, vários canais ou todos de uma vez.
                </CardDescription>
              </div>
            </div>
            <div class="flex gap-2">
              <Button type="button" variant="outline" size="sm" @click="refreshAccounts()">
                <Icon name="lucide:refresh-cw" class="mr-2 h-4 w-4" />
                Atualizar
              </Button>
              <Button
                v-if="accounts?.length"
                type="button"
                :variant="allAccountsSelected ? 'secondary' : 'outline'"
                size="sm"
                @click="toggleAllAccounts"
              >
                <Icon :name="allAccountsSelected ? 'lucide:x' : 'lucide:check-check'" class="mr-2 h-4 w-4" />
                {{ allAccountsSelected ? 'Limpar seleção' : 'Selecionar todos' }}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent class="space-y-6">
          <div v-if="accounts?.length" class="grid gap-3 sm:grid-cols-3">
            <button
              v-for="account in accounts"
              :key="account.id"
              type="button"
              class="group flex items-center gap-3 border rounded-xl p-4 text-left transition-all duration-200 hover:bg-muted/40 hover:shadow-sm"
              :class="accountSelected(account.id)
                ? 'border-primary bg-primary/5 ring-1 ring-primary shadow-sm'
                : 'border-border/60'"
              @click="toggleAccount(account)"
            >
              <span
                class="h-10 w-10 flex items-center justify-center rounded-full transition-colors"
                :class="accountSelected(account.id) ? 'bg-primary/15' : 'bg-muted'"
              >
                <Icon
                  :name="account.platform === 'linkedin' ? 'lucide:linkedin' : account.platform === 'instagram' ? 'lucide:instagram' : 'lucide:facebook'"
                  class="h-5 w-5"
                  :class="accountSelected(account.id) ? 'text-primary' : 'text-muted-foreground'"
                />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block font-medium">{{ platformLabel(account.platform) }}</span>
                <span class="block truncate text-xs text-muted-foreground">
                  {{ account.name }}
                </span>
              </span>
              <div
                class="h-5 w-5 flex items-center justify-center rounded-full transition-all duration-200"
                :class="accountSelected(account.id) ? 'bg-primary text-primary-foreground' : 'border border-muted-foreground/30'"
              >
                <Icon
                  v-if="accountSelected(account.id)"
                  name="lucide:check"
                  class="h-3 w-3"
                />
              </div>
            </button>
          </div>
          <Alert v-else>
            <Icon name="lucide:plug" class="h-4 w-4" />
            <AlertTitle>Nenhuma conta social conectada</AlertTitle>
            <AlertDescription>
              Conecte Meta ou LinkedIn antes de continuar.
              <Button type="button" variant="link" class="h-auto p-0" @click="navigateTo('/settings/integrations')">
                Abrir integrações
              </Button>
            </AlertDescription>
          </Alert>

          <Separator />

          <div class="grid gap-4 md:grid-cols-2">
            <div class="space-y-2">
              <Label>Formato da publicação</Label>
              <Select :model-value="publicationFormat" @update:model-value="changeFormat">
                <SelectTrigger class="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="static">
                    Post estático
                  </SelectItem>
                  <SelectItem value="carousel">
                    Carrossel
                  </SelectItem>
                  <SelectItem value="video">
                    Vídeo
                  </SelectItem>
                  <SelectItem value="story">
                    Stories
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-2">
              <Label for="publication-link">Link opcional</Label>
              <Input id="publication-link" v-model="publicationLink" type="url" placeholder="https://..." class="h-11" />
            </div>
          </div>

          <Alert v-if="hasFormatConflict" variant="destructive">
            <Icon name="lucide:triangle-alert" class="h-4 w-4" />
            <AlertTitle>
              {{ publicationFormat === 'story' ? 'Stories indisponível no LinkedIn' : 'Formato indisponível no LinkedIn' }}
            </AlertTitle>
            <AlertDescription>
              {{ publicationFormat === 'story'
                ? 'Stories funciona só no Facebook e Instagram. Desmarque o LinkedIn.'
                : 'Escolha post estático ou carrossel, ou desmarque o LinkedIn.' }}
            </AlertDescription>
          </Alert>
          <Alert v-else-if="publicationFormat === 'story'">
            <Icon name="lucide:smartphone" class="h-4 w-4" />
            <AlertTitle>Posicionamento: Stories</AlertTitle>
            <AlertDescription>
              Use uma imagem ou vídeo vertical (9:16). No Facebook, a Meta exige um upload novo da peça — não reutiliza o mesmo arquivo já publicado no feed.
            </AlertDescription>
          </Alert>

          <Separator />

          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="text-sm font-medium">
                Variantes por plataforma
              </p>
              <p class="text-xs text-muted-foreground">
                Opcional: adapte legenda, hashtags, CTA e texto da arte por rede.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              :variant="customizeVariants ? 'secondary' : 'outline'"
              :disabled="!variants.length"
              @click="customizeVariants = !customizeVariants"
            >
              <Icon :name="customizeVariants ? 'lucide:check' : 'lucide:sliders-horizontal'" class="mr-2 h-4 w-4" />
              {{ customizeVariants ? 'Adaptando por rede' : 'Adaptar por rede' }}
            </Button>
          </div>

          <div v-if="customizeVariants && variants.length" class="space-y-4">
            <Card
              v-for="variant in variants"
              :key="variant.accountId"
              class="border-dashed"
            >
              <CardHeader class="pb-3">
                <CardTitle class="text-base">
                  {{ platformLabel(variant.platform) }}
                </CardTitle>
              </CardHeader>
              <CardContent class="space-y-3">
                <div class="space-y-2">
                  <Label>Legenda</Label>
                  <Textarea
                    :model-value="variant.caption"
                    class="min-h-24"
                    @update:model-value="updateVariantField(variant.accountId, 'caption', String($event))"
                  />
                </div>
                <div class="grid gap-3 md:grid-cols-2">
                  <div class="space-y-2">
                    <Label>Hashtags</Label>
                    <Input
                      :model-value="variantHashtagsText(variant)"
                      placeholder="#marca"
                      @update:model-value="updateVariantField(variant.accountId, 'hashtagsText', String($event))"
                    />
                  </div>
                  <div class="space-y-2">
                    <Label>CTA</Label>
                    <Input
                      :model-value="String(variant.platformConfig?.cta || '')"
                      @update:model-value="updateVariantField(variant.accountId, 'cta', String($event))"
                    />
                  </div>
                </div>
                <div class="space-y-2">
                  <Label>Texto da arte</Label>
                  <Input
                    :model-value="String(variant.platformConfig?.artText || '')"
                    @update:model-value="updateVariantField(variant.accountId, 'artText', String($event))"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <!-- Step 3: Planning -->
      <div v-else-if="currentStep === 3" :key="3" class="space-y-6">
        <Card class="border-border/60 shadow-sm">
          <CardHeader>
            <div class="flex items-center gap-2">
              <div class="h-8 w-8 flex items-center justify-center rounded-lg bg-violet-500/10">
                <Icon name="lucide:image" class="h-4 w-4 text-violet-500" />
              </div>
              <div>
                <CardTitle>Peças finais</CardTitle>
                <CardDescription>
                  {{ publicationFormat === 'carousel' ? 'Selecione de 2 a 10 imagens na ordem desejada.' : publicationFormat === 'video' ? 'Selecione um vídeo.' : 'Selecione uma imagem.' }}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent class="space-y-5">
            <div
              class="relative min-h-32 overflow-hidden border-2 rounded-xl border-dashed transition-all"
              :class="[
                uploading || isPublicationDragOver
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-primary/5',
              ]"
              @dragenter="onPublicationDragEnter"
              @dragover="onPublicationDragOver"
              @dragleave="onPublicationDragLeave"
              @drop="onPublicationDrop"
            >
              <div
                v-if="isPublicationDragOver"
                class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-primary/10 backdrop-blur-[1px]"
                aria-hidden="true"
              >
                <div class="flex flex-col items-center gap-1.5 rounded-2xl bg-background/95 px-5 py-4 shadow-lg ring-1 ring-border">
                  <Icon name="lucide:upload-cloud" class="h-8 w-8 text-primary" />
                  <p class="text-sm font-semibold">
                    Solte para enviar a peça final
                  </p>
                  <p class="text-xs text-muted-foreground">
                    Imagens e vídeos (MP4/MOV)
                  </p>
                </div>
              </div>
              <button
                type="button"
                class="group min-h-32 w-full flex flex-col cursor-pointer items-center justify-center p-6 text-center disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="uploading"
                @click="openPublicationFilePicker"
              >
                <div
                  class="mb-3 h-12 w-12 flex items-center justify-center rounded-full bg-primary/10 transition-transform group-hover:scale-110"
                >
                  <Icon :name="uploading ? 'lucide:loader-circle' : 'lucide:upload-cloud'" class="h-6 w-6 text-primary" :class="{ 'animate-spin': uploading }" />
                </div>
                <span class="text-sm font-medium">{{ uploading ? 'Enviando...' : 'Arraste ou clique para enviar' }}</span>
                <span class="mt-1 text-xs text-muted-foreground">Imagens e vídeos de até 100 MB</span>
              </button>
              <input
                ref="publicationFileInput"
                type="file"
                multiple
                :accept="mediaFileAcceptAttr('publication')"
                class="hidden"
                :disabled="uploading"
                @change="uploadFromInput($event, 'publication')"
              >
            </div>
            <div class="grid grid-cols-2 gap-3 lg:grid-cols-6 sm:grid-cols-3">
              <button
                v-for="asset in compatiblePublicationAssets()"
                :key="asset.id"
                type="button"
                class="group relative aspect-square overflow-hidden border rounded-xl bg-muted transition-all duration-200 hover:shadow-md"
                :class="publicationAssetIds.includes(asset.id)
                  ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                  : 'hover:ring-1 hover:ring-border'"
                @click="toggleAsset(asset.id)"
              >
                <img
                  v-if="asset.mimeType?.startsWith('image/') || (asset as any).mime_type?.startsWith('image/')"
                  :src="asset.previewUrl || (asset as any).preview_url || ''"
                  :alt="asset.name"
                  class="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                >
                <div v-else class="h-full flex items-center justify-center">
                  <Icon name="lucide:file-video" class="h-8 w-8 text-muted-foreground" />
                </div>
                <span class="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-4 text-xs text-white">
                  {{ asset.name }}
                </span>
                <span
                  v-if="publicationAssetIds.includes(asset.id)"
                  class="absolute right-2 top-2 h-6 w-6 flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
                >
                  <Icon name="lucide:check" class="h-3.5 w-3.5" />
                </span>
              </button>
            </div>
          </CardContent>
        </Card>

        <Card class="border-border/60 shadow-sm">
          <CardHeader>
            <div class="flex items-center gap-2">
              <div class="h-8 w-8 flex items-center justify-center rounded-lg bg-emerald-500/10">
                <Icon name="lucide:calendar-clock" class="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <CardTitle>Referências e planejamento</CardTitle>
                <CardDescription>
                  Referências não serão publicadas; servem apenas para orientar a equipe e os aprovadores.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent class="space-y-6">
            <div
              class="relative min-h-24 overflow-hidden border-2 rounded-xl border-dashed transition-all"
              :class="[
                uploading || isReferenceDragOver
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-primary/5',
              ]"
              @dragenter="onReferenceDragEnter"
              @dragover="onReferenceDragOver"
              @dragleave="onReferenceDragLeave"
              @drop="onReferenceDrop"
            >
              <div
                v-if="isReferenceDragOver"
                class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-primary/10 backdrop-blur-[1px]"
                aria-hidden="true"
              >
                <div class="flex flex-col items-center gap-1.5 rounded-2xl bg-background/95 px-5 py-4 shadow-lg ring-1 ring-border">
                  <Icon name="lucide:paperclip" class="h-7 w-7 text-primary" />
                  <p class="text-sm font-semibold">
                    Solte para enviar a referência
                  </p>
                  <p class="text-xs text-muted-foreground">
                    Imagem, vídeo (MP4/MOV) ou PDF
                  </p>
                </div>
              </div>
              <button
                type="button"
                class="group min-h-24 w-full flex cursor-pointer items-center justify-center gap-3 p-4 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="uploading"
                @click="openReferenceFilePicker"
              >
                <Icon
                  :name="uploading ? 'lucide:loader-circle' : 'lucide:paperclip'"
                  class="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary"
                  :class="{ 'animate-spin text-primary': uploading }"
                />
                <span class="text-sm font-medium">{{ uploading ? 'Enviando...' : 'Arraste ou clique para adicionar referências' }}</span>
              </button>
              <input
                ref="referenceFileInput"
                type="file"
                multiple
                :accept="mediaFileAcceptAttr('reference')"
                class="hidden"
                :disabled="uploading"
                @change="uploadFromInput($event, 'reference')"
              >
            </div>
            <div v-if="referenceAssets.length" class="grid grid-cols-2 gap-3 lg:grid-cols-6 sm:grid-cols-4">
              <button
                v-for="asset in referenceAssets"
                :key="asset.id"
                type="button"
                class="group relative aspect-square overflow-hidden border rounded-xl bg-muted transition-all duration-200 hover:shadow-md"
                :class="referenceAssetIds.includes(asset.id)
                  ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                  : 'hover:ring-1 hover:ring-border'"
                @click="toggleReference(asset.id)"
              >
                <img
                  v-if="asset.mimeType?.startsWith('image/') || (asset as any).mime_type?.startsWith('image/')"
                  :src="asset.previewUrl || (asset as any).preview_url || ''"
                  :alt="asset.name"
                  class="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                >
                <div v-else class="h-full flex items-center justify-center">
                  <Icon name="lucide:file" class="h-8 w-8 text-muted-foreground" />
                </div>
                <span
                  v-if="referenceAssetIds.includes(asset.id)"
                  class="absolute right-2 top-2 h-6 w-6 flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
                >
                  <Icon name="lucide:check" class="h-3.5 w-3.5" />
                </span>
              </button>
            </div>

            <Separator />

            <ScheduleSlotsEditor
              v-model="schedules"
              :variants="variants"
            />

            <ProductionMetaFields
              v-if="!isClientExperience"
              v-model:copy-owner-id="copyOwnerId"
              v-model:design-owner-id="designOwnerId"
              v-model:publish-owner-id="publishOwnerId"
              v-model:production-priority="productionPriority"
              v-model:production-due-at="productionDueAt"
              :members="members || []"
            />

            <div v-if="!isClientExperience" class="space-y-2">
              <Label>Política de aprovação</Label>
              <Select v-model="approvalPolicy">
                <SelectTrigger class="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">
                    Uma aprovação
                  </SelectItem>
                  <SelectItem value="all">
                    Todos devem aprovar
                  </SelectItem>
                  <SelectItem value="minimum">
                    Quantidade mínima
                  </SelectItem>
                </SelectContent>
              </Select>
              <Input
                v-if="approvalPolicy === 'minimum'"
                v-model.number="minimumApprovals"
                type="number"
                min="1"
                max="100"
                aria-label="Mínimo de aprovações"
              />
            </div>
            <div v-else class="border rounded-lg border-dashed p-4 text-sm text-muted-foreground space-y-2">
              Sem fluxo de aprovação — você agenda ou publica direto.
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Step 4: Review -->
      <Card v-else :key="4" class="border-border/60 shadow-sm">
        <CardHeader>
          <div class="flex items-center gap-2">
            <div class="h-8 w-8 flex items-center justify-center rounded-lg bg-green-500/10">
              <Icon name="lucide:check-circle-2" class="h-4 w-4 text-green-500" />
            </div>
            <div>
              <CardTitle>Revise antes de salvar</CardTitle>
              <CardDescription>
                Confira canais, mídia e planejamento. O conteúdo será salvo inicialmente como rascunho.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent class="space-y-6">
          <div class="border rounded-xl bg-muted/20 p-5">
            <p class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Título interno
            </p>
            <p class="mt-1.5 text-lg font-semibold">
              {{ title }}
            </p>
            <p class="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {{ composedCaptionPreview || 'Sem legenda' }}
            </p>
            <p v-if="artText" class="mt-2 text-sm">
              <span class="text-muted-foreground">Arte:</span> {{ artText }}
            </p>
            <p v-if="cta" class="mt-1 text-sm">
              <span class="text-muted-foreground">CTA:</span> {{ cta }}
            </p>
            <div class="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">
                {{ selectedCampaignName }}
              </Badge>
              <Badge v-if="!isClientExperience" variant="outline">
                {{ selectedAssigneeName }}
              </Badge>
              <Badge v-if="customizeVariants" variant="secondary">
                Variantes por rede
              </Badge>
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-3">
            <div class="border rounded-xl bg-muted/10 p-4 transition-colors hover:bg-muted/20">
              <p class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Canais
              </p>
              <div class="mt-2 flex flex-wrap gap-1">
                <Badge v-for="variant in variants" :key="variant.accountId" variant="secondary">
                  {{ platformLabel(variant.platform) }}
                </Badge>
              </div>
            </div>
            <div class="border rounded-xl bg-muted/10 p-4 transition-colors hover:bg-muted/20">
              <p class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Formato
              </p>
              <p class="mt-2 font-medium">
                {{ formatLabel }}
              </p>
              <p class="text-xs text-muted-foreground">
                {{ publicationAssetIds.length }} peça(s)
              </p>
            </div>
            <div class="border rounded-xl bg-muted/10 p-4 transition-colors hover:bg-muted/20">
              <p class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {{ isClientExperience ? 'Agenda' : 'Aprovação' }}
              </p>
              <p class="mt-2 font-medium">
                {{ isClientExperience ? (formatScheduledDate() || 'Sem horário') : approvalLabel }}
              </p>
              <p v-if="!isClientExperience" class="text-xs text-muted-foreground">
                {{ formatScheduledDate() }}
              </p>
              <p v-else class="text-xs text-muted-foreground">
                Publique agora ou agende quando quiser
              </p>
            </div>
          </div>

          <div v-if="publicationAssetIds.length" class="grid grid-cols-2 gap-3 lg:grid-cols-6 sm:grid-cols-4">
            <div
              v-for="assetId in publicationAssetIds"
              :key="assetId"
              class="aspect-square overflow-hidden border rounded-xl bg-muted"
            >
              <img
                v-if="publicationAssetById(assetId)?.mime_type?.startsWith('image/') || publicationAssetById(assetId)?.mimeType?.startsWith('image/')"
                :src="publicationAssetById(assetId)?.preview_url || publicationAssetById(assetId)?.previewUrl"
                alt="Prévia da peça"
                class="h-full w-full object-cover"
              >
              <div v-else class="h-full flex items-center justify-center">
                <Icon name="lucide:play-circle" class="h-8 w-8 text-muted-foreground" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Transition>

    <!-- Error alert -->
    <Alert v-if="formError" variant="destructive">
      <Icon name="lucide:circle-alert" class="h-4 w-4" />
      <AlertTitle>Revise esta etapa</AlertTitle>
      <AlertDescription>{{ formError }}</AlertDescription>
    </Alert>

    <!-- Premium sticky bottom bar -->
    <div class="sticky bottom-4 z-20 flex items-center justify-between gap-3 border rounded-2xl bg-background/95 p-3 shadow-lg ring-1 ring-border/50 backdrop-blur-md">
      <div class="hidden items-center gap-3 sm:flex">
        <div class="flex gap-1">
          <div
            v-for="item in steps"
            :key="item.step"
            class="h-1.5 w-6 rounded-full transition-all duration-300"
            :class="currentStep >= item.step ? 'bg-primary' : 'bg-muted'"
          />
        </div>
        <p class="text-xs text-muted-foreground">
          Etapa {{ currentStep }} de {{ steps.length }}
        </p>
      </div>
      <div class="ml-auto flex gap-2">
        <Button
          v-if="currentStep === 1"
          type="button"
          variant="ghost"
          @click="navigateTo('/marketing/content')"
        >
          Cancelar
        </Button>
        <Button v-else type="button" variant="outline" @click="previousStep">
          <Icon name="lucide:arrow-left" class="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <Button v-if="currentStep < 4" type="button" @click="nextStep">
          Continuar
          <Icon name="lucide:arrow-right" class="ml-2 h-4 w-4" />
        </Button>
        <Button v-else type="submit" :disabled="saving" class="min-w-32">
          <Icon :name="saving ? 'lucide:loader-circle' : 'lucide:save'" class="mr-2 h-4 w-4" :class="{ 'animate-spin': saving }" />
          {{ saving ? 'Salvando...' : 'Salvar rascunho' }}
        </Button>
      </div>
    </div>
  </form>
</template>

<style scoped>
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
  transition: all 0.25s ease-out;
}

.slide-left-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
.slide-left-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

.slide-right-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}
.slide-right-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
