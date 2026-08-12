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
import {
  buildCaptionWithHashtags,
  formatHashtagsInline,
  parseHashtags,
} from '~/utils/social-hashtags'

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
const steps = [
  { step: 1, title: 'Conteúdo', description: 'Título e legenda' },
  { step: 2, title: 'Redes', description: 'Canais e formato' },
  { step: 3, title: 'Planejamento', description: 'Mídia e agenda' },
  { step: 4, title: 'Revisão', description: 'Conferir e salvar' },
]

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

async function uploadFiles(event: Event, purpose: MediaAssetPurpose) {
  const input = event.target as HTMLInputElement
  if (!input.files?.length)
    return
  uploading.value = true
  try {
    for (const file of Array.from(input.files))
      await social.uploadAsset(file, purpose)
    await refreshAssets()
    input.value = ''
  }
  finally {
    uploading.value = false
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
  currentStep.value = Math.min(4, currentStep.value + 1)
}

function previousStep() {
  formError.value = ''
  currentStep.value = Math.max(1, currentStep.value - 1)
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
  <form v-else class="space-y-6" @submit.prevent="submit">
    <Stepper :model-value="currentStep" class="w-full items-start gap-0">
      <StepperItem
        v-for="item in steps"
        :key="item.step"
        :step="item.step"
        class="relative flex flex-1 flex-col items-center"
      >
        <StepperIndicator class="z-10 border bg-background">
          <Icon v-if="currentStep > item.step" name="lucide:check" class="h-4 w-4" />
          <span v-else>{{ item.step }}</span>
        </StepperIndicator>
        <StepperTitle class="mt-2 text-center text-xs sm:text-sm">
          {{ item.title }}
        </StepperTitle>
        <StepperDescription class="hidden text-center lg:block">
          {{ item.description }}
        </StepperDescription>
        <StepperSeparator
          v-if="item.step < steps.length"
          class="absolute left-1/2 top-4 h-0.5 w-full bg-muted group-data-[state=completed]:bg-primary"
        />
      </StepperItem>
    </Stepper>

    <div v-if="currentStep === 1" class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card class="border-muted/80 shadow-sm">
        <CardHeader class="pb-4">
          <CardTitle class="text-lg">
            Detalhes do post
          </CardTitle>
          <CardDescription>
            Escreva a legenda, adicione hashtags e configure o conteúdo base da publicação.
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-5">
          <div class="space-y-2">
            <Label for="social-title">Título interno</Label>
            <Input
              id="social-title"
              v-model="title"
              maxlength="180"
              placeholder="Ex.: Campanha de inverno — lançamento"
            />
            <p class="text-xs text-muted-foreground">
              Usado apenas para organização interna.
            </p>
          </div>

          <div class="space-y-2">
            <Label for="social-content">Legenda da publicação</Label>
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
            />
          </div>

          <div class="flex items-center justify-between gap-4 border rounded-xl bg-muted/20 px-4 py-3">
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
              />
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div class="space-y-2">
              <Label>Campanha</Label>
              <Select v-model="campaignId">
                <SelectTrigger>
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
                <SelectTrigger>
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

      <div class="lg:sticky lg:top-6 lg:self-start">
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

    <Card v-else-if="currentStep === 2">
      <CardHeader>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Redes e formato</CardTitle>
            <CardDescription>
              Selecione um canal, vários canais ou todos de uma vez.
            </CardDescription>
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
            class="flex items-center gap-3 border rounded-xl p-4 text-left transition-colors hover:bg-muted/40"
            :class="{ 'border-primary bg-primary/5 ring-1 ring-primary': accountSelected(account.id) }"
            @click="toggleAccount(account)"
          >
            <span class="h-10 w-10 flex items-center justify-center rounded-full bg-muted">
              <Icon
                :name="account.platform === 'linkedin' ? 'lucide:linkedin' : account.platform === 'instagram' ? 'lucide:instagram' : 'lucide:facebook'"
                class="h-5 w-5"
              />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block font-medium">{{ platformLabel(account.platform) }}</span>
              <span class="block truncate text-xs text-muted-foreground">
                {{ account.name }}
              </span>
            </span>
            <Icon
              :name="accountSelected(account.id) ? 'lucide:circle-check' : 'lucide:circle'"
              class="h-5 w-5"
              :class="accountSelected(account.id) ? 'text-primary' : 'text-muted-foreground'"
            />
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
              <SelectTrigger><SelectValue /></SelectTrigger>
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
            <Input id="publication-link" v-model="publicationLink" type="url" placeholder="https://..." />
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

    <div v-else-if="currentStep === 3" class="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Peças finais</CardTitle>
          <CardDescription>
            {{ publicationFormat === 'carousel' ? 'Selecione de 2 a 10 imagens na ordem desejada.' : publicationFormat === 'video' ? 'Selecione um vídeo.' : 'Selecione uma imagem.' }}
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-5">
          <label class="min-h-28 flex flex-col cursor-pointer items-center justify-center border rounded-xl border-dashed p-5 text-center hover:bg-muted/40">
            <Icon name="lucide:upload-cloud" class="mb-2 h-6 w-6 text-primary" />
            <span class="text-sm font-medium">{{ uploading ? 'Enviando...' : 'Enviar novas peças' }}</span>
            <span class="mt-1 text-xs text-muted-foreground">Imagens e vídeos de até 100 MB</span>
            <input
              type="file"
              multiple
              accept="image/*,video/mp4,video/quicktime"
              class="hidden"
              :disabled="uploading"
              @change="uploadFiles($event, 'publication')"
            >
          </label>
          <div class="grid grid-cols-2 gap-3 lg:grid-cols-6 sm:grid-cols-3">
            <button
              v-for="asset in compatiblePublicationAssets()"
              :key="asset.id"
              type="button"
              class="relative aspect-square overflow-hidden border rounded-xl bg-muted"
              :class="{ 'ring-2 ring-primary': publicationAssetIds.includes(asset.id) }"
              @click="toggleAsset(asset.id)"
            >
              <img
                v-if="asset.mimeType?.startsWith('image/') || (asset as any).mime_type?.startsWith('image/')"
                :src="asset.previewUrl || (asset as any).preview_url || ''"
                :alt="asset.name"
                class="h-full w-full object-cover"
              >
              <div v-else class="h-full flex items-center justify-center">
                <Icon name="lucide:file-video" class="h-8 w-8 text-muted-foreground" />
              </div>
              <span class="absolute inset-x-0 bottom-0 truncate bg-background/90 px-2 py-1 text-xs">
                {{ asset.name }}
              </span>
              <span
                v-if="publicationAssetIds.includes(asset.id)"
                class="absolute right-2 top-2 h-6 w-6 flex items-center justify-center rounded-full bg-primary text-primary-foreground"
              >
                <Icon name="lucide:check" class="h-3.5 w-3.5" />
              </span>
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Referências e planejamento</CardTitle>
          <CardDescription>
            Referências não serão publicadas; servem apenas para orientar a equipe e os aprovadores.
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-6">
          <label class="min-h-24 flex cursor-pointer items-center justify-center gap-3 border rounded-xl border-dashed p-4 hover:bg-muted/40">
            <Icon name="lucide:paperclip" class="h-5 w-5 text-muted-foreground" />
            <span class="text-sm font-medium">{{ uploading ? 'Enviando...' : 'Adicionar referências' }}</span>
            <input
              type="file"
              multiple
              accept="image/*,video/mp4,video/quicktime,application/pdf"
              class="hidden"
              :disabled="uploading"
              @change="uploadFiles($event, 'reference')"
            >
          </label>
          <div v-if="referenceAssets.length" class="grid grid-cols-2 gap-3 lg:grid-cols-6 sm:grid-cols-4">
            <button
              v-for="asset in referenceAssets"
              :key="asset.id"
              type="button"
              class="relative aspect-square overflow-hidden border rounded-xl bg-muted"
              :class="{ 'ring-2 ring-primary': referenceAssetIds.includes(asset.id) }"
              @click="toggleReference(asset.id)"
            >
              <img
                v-if="asset.mimeType?.startsWith('image/') || (asset as any).mime_type?.startsWith('image/')"
                :src="asset.previewUrl || (asset as any).preview_url || ''"
                :alt="asset.name"
                class="h-full w-full object-cover"
              >
              <div v-else class="h-full flex items-center justify-center">
                <Icon name="lucide:file" class="h-8 w-8 text-muted-foreground" />
              </div>
              <span
                v-if="referenceAssetIds.includes(asset.id)"
                class="absolute right-2 top-2 h-6 w-6 flex items-center justify-center rounded-full bg-primary text-primary-foreground"
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
              <SelectTrigger><SelectValue /></SelectTrigger>
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

    <Card v-else>
      <CardHeader>
        <CardTitle>Revise antes de salvar</CardTitle>
        <CardDescription>
          Confira canais, mídia e planejamento. O conteúdo será salvo inicialmente como rascunho.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <div class="border rounded-xl p-4">
          <p class="text-xs text-muted-foreground">
            Título interno
          </p>
          <p class="mt-1 font-semibold">
            {{ title }}
          </p>
          <p class="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
            {{ composedCaptionPreview || 'Sem legenda' }}
          </p>
          <p v-if="artText" class="mt-2 text-sm">
            <span class="text-muted-foreground">Arte:</span> {{ artText }}
          </p>
          <p v-if="cta" class="mt-1 text-sm">
            <span class="text-muted-foreground">CTA:</span> {{ cta }}
          </p>
          <div class="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
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
          <div class="border rounded-xl p-4">
            <p class="text-xs text-muted-foreground">
              Canais
            </p>
            <div class="mt-2 flex flex-wrap gap-1">
              <Badge v-for="variant in variants" :key="variant.accountId" variant="secondary">
                {{ platformLabel(variant.platform) }}
              </Badge>
            </div>
          </div>
          <div class="border rounded-xl p-4">
            <p class="text-xs text-muted-foreground">
              Formato
            </p>
            <p class="mt-2 font-medium">
              {{ formatLabel }}
            </p>
            <p class="text-xs text-muted-foreground">
              {{ publicationAssetIds.length }} peça(s)
            </p>
          </div>
          <div class="border rounded-xl p-4">
            <p class="text-xs text-muted-foreground">
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

        <div class="grid grid-cols-2 gap-3 lg:grid-cols-6 sm:grid-cols-4">
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

    <Alert v-if="formError" variant="destructive">
      <Icon name="lucide:circle-alert" class="h-4 w-4" />
      <AlertTitle>Revise esta etapa</AlertTitle>
      <AlertDescription>{{ formError }}</AlertDescription>
    </Alert>

    <div class="sticky bottom-4 z-20 flex items-center justify-between gap-3 border rounded-xl bg-background/95 p-3 shadow-lg backdrop-blur">
      <p class="hidden text-xs text-muted-foreground sm:block">
        Etapa {{ currentStep }} de {{ steps.length }}
      </p>
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
        <Button v-else type="submit" :disabled="saving">
          <Icon :name="saving ? 'lucide:loader-circle' : 'lucide:save'" class="mr-2 h-4 w-4" :class="{ 'animate-spin': saving }" />
          {{ saving ? 'Salvando...' : 'Salvar rascunho' }}
        </Button>
      </div>
    </div>
  </form>
</template>
