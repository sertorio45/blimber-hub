<script setup lang="ts">
import type { ApprovalChangeCategory, ApprovalDecision } from '~/types/marketing-social'
import ApprovalMediaPreview from '@/components/marketing/social/ApprovalMediaPreview.vue'
import ApprovalStatusBadge from '@/components/marketing/social/ApprovalStatusBadge.vue'
import ApprovalVersionCompare from '@/components/marketing/social/ApprovalVersionCompare.vue'
import { buildCaptionWithHashtags } from '~/utils/social-hashtags'
import {
  APPROVAL_CHANGE_CATEGORY_LABELS,
  APPROVAL_STAGE_LABELS,
} from '~/types/marketing-social'
import { uniqueApprovalPreviewAssets, platformIcon } from '@/utils/marketing-social-preview'
import { useWorkspace } from '~/composables/useWorkspace'
import { toast } from 'vue-sonner'

const props = defineProps<{
  open: boolean
  requestId: string | null
  tenantId?: string | null
  organizationId?: string | null
  clientMode?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  decided: [payload?: { id: string, status: string }]
}>()

const social = useMarketingSocial()
const { can } = useWorkspace()

const detail = ref<any>(null)
const loading = ref(false)
const saving = ref(false)
const tab = ref<'review' | 'compare' | 'history'>('review')
const threadComment = ref('')
const decisionComment = ref('')
const commentVisibility = ref<'shared' | 'internal'>('shared')
const changeCategory = ref<ApprovalChangeCategory>('art')
const decisionMode = ref<ApprovalDecision | null>(null)
const showDecisionForm = ref(false)
const annotateMode = ref(false)
const confirmCancelOpen = ref(false)
const confirmBypassOpen = ref(false)
const bypassJustification = ref('')
const pendingAnchor = ref<{
  anchorType: 'image' | 'carousel' | 'video'
  xPercent: number | null
  yPercent: number | null
  slideIndex: number | null
  mediaTimeMs: number | null
} | null>(null)
const lastReviewLinkUrl = ref<string | null>(null)
const lastReviewLinkId = ref<string | null>(null)

const openProxy = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
})

const canApprove = computed(() =>
  can('marketing.social.approve')
  || can('marketing.social.approval.internal')
  || can('marketing.social.approval.client'),
)
const canBypass = computed(() => can('marketing.social.approval.bypass') && !props.clientMode)
const canCommentInternal = computed(() =>
  !props.clientMode && (
    can('agency.clients.read')
    || can('marketing.social.approval.internal')
    || can('marketing.social.manage')
  ),
)
const canSchedule = computed(() =>
  !props.clientMode && (can('marketing.social.schedule') || can('marketing.social.publish')),
)
const canEdit = computed(() =>
  !props.clientMode && (detail.value?.can_edit || can('marketing.social.update') || can('marketing.social.manage')),
)
const canCancel = computed(() =>
  !props.clientMode
  && detail.value?.can_cancel
  && (can('marketing.social.manage') || can('marketing.social.workflow.manage')),
)
const canCreateReviewLink = computed(() =>
  !props.clientMode
  && detail.value?.status === 'pending'
  && (can('marketing.social.review_link.create') || can('marketing.social.manage')),
)

const commentPins = computed(() =>
  (detail.value?.comments || [])
    .filter((item: any) => item.anchor_type && item.anchor_type !== 'none' && item.x_percent != null && item.y_percent != null)
    .map((item: any) => ({
      id: item.id,
      xPercent: Number(item.x_percent),
      yPercent: Number(item.y_percent),
      slideIndex: item.slide_index,
      mediaTimeMs: item.media_time_ms,
      body: item.body,
    })),
)

const assets = computed(() => {
  if (!detail.value?.version)
    return []
  return uniqueApprovalPreviewAssets({
    content_versions: { snapshot: detail.value.version.snapshot },
  })
})

const variants = computed(() => detail.value?.version?.snapshot?.variants || [])
const formatHint = computed(() => variants.value[0]?.format || null)

const clientChangeCategories: Partial<Record<ApprovalChangeCategory, string>> = {
  art: 'Imagem',
  copy: 'Texto',
  other: 'Texto e imagem',
}

const changeCategoryOptions = computed(() => {
  if (props.clientMode)
    return clientChangeCategories
  return APPROVAL_CHANGE_CATEGORY_LABELS
})

const lastRevisionReason = computed(() => detail.value?.revision_reason || null)

const errorMessages: Record<string, { title: string, description: string }> = {
  cancelled: {
    title: 'Solicitação cancelada',
    description: 'Esta rodada de aprovação foi cancelada e não aceita novas decisões.',
  },
  superseded: {
    title: 'Versão substituída',
    description: 'Uma nova versão foi enviada. Esta solicitação não é mais a versão atual.',
  },
  media_unavailable: {
    title: 'Mídia indisponível',
    description: 'Algumas peças desta versão não puderam ser carregadas.',
  },
  version_missing: {
    title: 'Versão ausente',
    description: 'Não foi possível carregar o snapshot desta aprovação.',
  },
  no_channels: {
    title: 'Sem canais',
    description: 'Esta versão não tem redes sociais selecionadas.',
  },
  integration_removed: {
    title: 'Integração removida',
    description: 'Uma das contas conectadas foi desativada ou removida. Reconecte antes de publicar.',
  },
  forbidden: {
    title: 'Sem permissão',
    description: 'Você não tem permissão para decidir nesta solicitação.',
  },
}

const visibleDecisions = computed(() => detail.value?.decisions || [])

const decisionFormTitle = computed(() => {
  if (decisionMode.value === 'approved')
    return 'Confirmar aprovação'
  if (decisionMode.value === 'rejected')
    return 'Confirmar reprovação'
  return 'Pedir alterações'
})

async function loadDetail() {
  if (!props.requestId)
    return
  loading.value = true
  detail.value = null
  try {
    detail.value = await social.getApproval(props.requestId, {
      tenant_id: props.tenantId || undefined,
      organizationId: props.organizationId || undefined,
    })
    tab.value = 'review'
    showDecisionForm.value = false
    decisionMode.value = null
    threadComment.value = ''
    decisionComment.value = ''
    changeCategory.value = 'art'
  }
  catch (error: any) {
    const status = error?.statusCode || error?.status
    if (status === 403) {
      detail.value = { error_state: 'forbidden', title: 'Aprovação', status: 'pending' }
      return
    }
    toast.error(error?.data?.statusMessage || 'Não foi possível abrir a aprovação')
    openProxy.value = false
  }
  finally {
    loading.value = false
  }
}

watch(() => [props.open, props.requestId], ([isOpen]) => {
  if (isOpen && props.requestId)
    loadDetail()
})

function startDecision(decision: ApprovalDecision) {
  decisionMode.value = decision
  decisionComment.value = ''
  changeCategory.value = props.clientMode && decision === 'changes_requested' ? 'other' : 'art'
  showDecisionForm.value = true
  if (decision === 'changes_requested' && props.clientMode)
    annotateMode.value = true
}

async function submitDecision() {
  if (!detail.value?.id || !decisionMode.value)
    return
  if ((decisionMode.value === 'changes_requested' || decisionMode.value === 'rejected') && !decisionComment.value.trim()) {
    toast.error('Descreva o motivo')
    return
  }
  if (decisionMode.value === 'changes_requested' && !changeCategory.value) {
    toast.error('Selecione a categoria da alteração')
    return
  }
  saving.value = true
  try {
    await social.decide(detail.value.id, decisionMode.value, decisionComment.value, {
      changeCategory: decisionMode.value === 'changes_requested' ? changeCategory.value : null,
      tenantId: detail.value.tenant_id,
    })
    const nextStatus = decisionMode.value === 'approved'
      ? 'approved'
      : decisionMode.value === 'rejected' ? 'rejected' : 'changes_requested'
    toast.success(
      decisionMode.value === 'approved'
        ? 'Aprovado'
        : decisionMode.value === 'rejected' ? 'Reprovado' : 'Alterações solicitadas',
    )
    emit('decided', { id: detail.value.id, status: nextStatus })
    openProxy.value = false
  }
  catch (error: any) {
    const code = error?.data?.data?.code || error?.data?.code
    if (error?.statusCode === 409 || code === 'approval_conflict') {
      toast.error(error?.data?.statusMessage || 'Outra pessoa já decidiu. Atualizando…')
      await loadDetail()
      emit('decided', { id: detail.value?.id, status: detail.value?.status })
    }
    else if (error?.statusCode === 403) {
      toast.error('Você não tem permissão para esta ação')
    }
    else {
      toast.error(error?.data?.statusMessage || 'Erro ao registrar a decisão')
    }
  }
  finally {
    saving.value = false
  }
}

async function sendComment() {
  if (!detail.value?.post_id || !threadComment.value.trim())
    return
  saving.value = true
  try {
    await social.addComment(detail.value.post_id, threadComment.value, {
      versionId: detail.value.version_id,
      visibility: props.clientMode ? 'shared' : commentVisibility.value,
      tenantId: detail.value.tenant_id,
      anchorType: pendingAnchor.value?.anchorType || 'none',
      xPercent: pendingAnchor.value?.xPercent ?? null,
      yPercent: pendingAnchor.value?.yPercent ?? null,
      slideIndex: pendingAnchor.value?.slideIndex ?? null,
      mediaTimeMs: pendingAnchor.value?.mediaTimeMs ?? null,
    })
    toast.success('Comentário enviado')
    threadComment.value = ''
    pendingAnchor.value = null
    annotateMode.value = false
    await loadDetail()
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || 'Não foi possível comentar')
  }
  finally {
    saving.value = false
  }
}

function onMediaPin(payload: {
  anchorType: 'image' | 'carousel' | 'video'
  xPercent: number | null
  yPercent: number | null
  slideIndex: number | null
  mediaTimeMs: number | null
}) {
  pendingAnchor.value = payload
  annotateMode.value = false
  toast.message(
    payload.anchorType === 'video'
      ? `Marcação em ${Math.floor((payload.mediaTimeMs || 0) / 1000)}s — escreva o comentário`
      : 'Marcação na arte — escreva o comentário',
  )
}

async function generateMagicLink() {
  if (!detail.value?.id)
    return
  saving.value = true
  try {
    const response = await social.createReviewLink(detail.value.id, {
      tenantId: detail.value.tenant_id,
      expiresInHours: 168,
      afterDecision: 'read_only',
    })
    lastReviewLinkUrl.value = response.data.url
    lastReviewLinkId.value = response.data.id
    await navigator.clipboard.writeText(response.data.url)
    toast.success('Link mágico copiado')
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || 'Não foi possível gerar o link')
  }
  finally {
    saving.value = false
  }
}

async function revokeMagicLink() {
  if (!lastReviewLinkId.value || !detail.value)
    return
  saving.value = true
  try {
    await social.revokeReviewLink(lastReviewLinkId.value, { tenantId: detail.value.tenant_id })
    lastReviewLinkUrl.value = null
    lastReviewLinkId.value = null
    toast.success('Link revogado')
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || 'Não foi possível revogar')
  }
  finally {
    saving.value = false
  }
}

async function scheduleApproved() {
  if (!detail.value?.post_id)
    return
  saving.value = true
  try {
    await social.schedulePost(detail.value.post_id, detail.value.scheduled_at, { publishNow: false })
    toast.success('Publicação agendada')
    emit('decided', { id: detail.value.id, status: 'approved' })
    openProxy.value = false
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || 'Não foi possível agendar')
  }
  finally {
    saving.value = false
  }
}

function openBypassDialog() {
  bypassJustification.value = ''
  confirmBypassOpen.value = true
}

async function runBypass() {
  if (!detail.value?.post_id || !bypassJustification.value.trim()) {
    toast.error('Informe a justificativa do bypass')
    return
  }
  saving.value = true
  try {
    await social.bypassApproval(detail.value.post_id, bypassJustification.value.trim())
    toast.success('Aprovação ignorada com auditoria')
    confirmBypassOpen.value = false
    emit('decided', { id: detail.value.id, status: 'approved' })
    openProxy.value = false
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || 'Bypass não permitido')
  }
  finally {
    saving.value = false
  }
}

async function cancelRequest() {
  if (!detail.value?.post_id)
    return
  saving.value = true
  try {
    await social.cancelApproval(detail.value.post_id, null, { tenantId: detail.value.tenant_id })
    toast.success('Solicitação cancelada')
    confirmCancelOpen.value = false
    emit('decided', { id: detail.value.id, status: 'cancelled' })
    openProxy.value = false
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || 'Não foi possível cancelar')
  }
  finally {
    saving.value = false
  }
}

function openEditor() {
  if (!detail.value?.post_id)
    return
  openProxy.value = false
  navigateTo(`/marketing/content/${detail.value.post_id}`)
}

function waitingLabel(ms: number | null) {
  if (ms == null)
    return '—'
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 24)
    return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

const showStickyActions = computed(() => {
  if (!detail.value || showDecisionForm.value)
    return false
  if (detail.value.error_state && detail.value.error_state !== 'media_unavailable')
    return false
  return detail.value.status === 'pending'
    || detail.value.status === 'changes_requested'
    || detail.value.status === 'approved'
})

const canDecideNow = computed(() =>
  canApprove.value
  && detail.value?.can_decide
  && detail.value?.status === 'pending'
  && !saving.value,
)
</script>

<template>
  <Sheet v-model:open="openProxy">
    <SheetContent
      side="right"
      class="flex h-dvh w-full flex-col gap-0 p-0 sm:max-w-xl md:max-w-2xl lg:max-w-3xl"
      :aria-label="detail?.title || 'Revisão de conteúdo'"
    >
      <div class="border-b px-4 py-4 sm:px-6">
        <SheetHeader class="space-y-1 text-left">
          <SheetTitle class="pr-8 text-lg leading-snug">
            {{ detail?.title || 'Revisão' }}
          </SheetTitle>
          <SheetDescription>
            <template v-if="detail && !detail.error_state">
              <span v-if="!clientMode && detail.client?.name">{{ detail.client.name }} · </span>
              Versão {{ detail.version_number || '—' }}
              <span v-if="detail.stage"> · {{ APPROVAL_STAGE_LABELS[detail.stage as 'internal' | 'client'] }}</span>
            </template>
            <template v-else>
              Carregando a versão em aprovação…
            </template>
          </SheetDescription>
        </SheetHeader>
      </div>

      <div class="flex-1 overflow-y-auto px-4 py-4 sm:px-6" :class="showStickyActions ? 'pb-36' : 'pb-6'">
        <div v-if="loading" class="space-y-4">
          <Skeleton class="h-64 w-full rounded-xl" />
          <Skeleton class="h-24 w-full rounded-xl" />
        </div>

        <template v-else-if="detail">
          <Alert
            v-if="detail.error_state && errorMessages[detail.error_state]"
            class="mb-4"
            variant="destructive"
          >
            <AlertTitle>{{ errorMessages[detail.error_state].title }}</AlertTitle>
            <AlertDescription>{{ errorMessages[detail.error_state].description }}</AlertDescription>
          </Alert>

          <template v-if="detail.error_state !== 'forbidden'">
            <div class="mb-4 flex flex-wrap items-center gap-2">
              <ApprovalStatusBadge
                :status="detail.status"
                :overdue="Boolean(detail.overdue)"
              />
              <Badge variant="outline">
                Aguardando {{ waitingLabel(detail.waiting_ms) }}
              </Badge>
              <Badge variant="outline">
                v{{ detail.version_number || '—' }}
              </Badge>
              <Badge v-if="!clientMode && detail.stage" variant="secondary">
                {{ APPROVAL_STAGE_LABELS[detail.stage as 'internal' | 'client'] }}
              </Badge>
            </div>

            <Alert
              v-if="detail.status === 'pending' && !detail.can_decide && !clientMode"
              class="mb-4"
            >
              <AlertTitle>Somente leitura</AlertTitle>
              <AlertDescription>
                Você não é aprovador desta rodada — pode comentar, mas não registrar decisão.
              </AlertDescription>
            </Alert>

            <Tabs v-model="tab" class="w-full">
              <TabsList
                class="grid w-full"
                :class="(!clientMode || detail.previous_version) ? 'grid-cols-3' : 'grid-cols-2'"
              >
                <TabsTrigger value="review">
                  Peça
                </TabsTrigger>
                <TabsTrigger v-if="!clientMode || detail.previous_version" value="compare">
                  Comparar
                </TabsTrigger>
                <TabsTrigger value="history">
                  Histórico
                </TabsTrigger>
              </TabsList>

              <TabsContent value="review" class="mt-4 space-y-5">
                <div class="flex flex-wrap gap-2">
                  <Button
                    v-if="can('marketing.social.comment')"
                    size="sm"
                    variant="outline"
                    class="min-h-11"
                    :disabled="saving"
                    @click="annotateMode = !annotateMode"
                  >
                    <Icon name="lucide:map-pin" class="mr-1 h-4 w-4" />
                    {{ annotateMode ? 'Cancelar marcação' : 'Marcar na imagem' }}
                  </Button>
                  <Button
                    v-if="canCreateReviewLink"
                    size="sm"
                    variant="outline"
                    :disabled="saving"
                    @click="generateMagicLink"
                  >
                    <Icon name="lucide:link" class="mr-1 h-4 w-4" />
                    Gerar link mágico
                  </Button>
                  <Button
                    v-if="lastReviewLinkId && can('marketing.social.review_link.revoke')"
                    size="sm"
                    variant="ghost"
                    :disabled="saving"
                    @click="revokeMagicLink"
                  >
                    Revogar link
                  </Button>
                </div>
                <p v-if="lastReviewLinkUrl" class="break-all rounded-lg border bg-muted/40 px-3 py-2 text-xs">
                  {{ lastReviewLinkUrl }}
                </p>

                <ApprovalMediaPreview
                  :assets="assets"
                  :format="formatHint"
                  :annotate="annotateMode"
                  :pins="commentPins"
                  @pin="onMediaPin"
                />
                <p
                  v-if="pendingAnchor"
                  class="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary"
                >
                  Marcação pendente
                  <span v-if="pendingAnchor.anchorType === 'video'">
                    · {{ Math.floor((pendingAnchor.mediaTimeMs || 0) / 1000) }}s
                  </span>
                  <span v-else-if="pendingAnchor.xPercent != null">
                    · {{ Math.round(pendingAnchor.xPercent) }}%, {{ Math.round(pendingAnchor.yPercent || 0) }}%
                  </span>
                </p>

                <div class="space-y-3">
                  <div
                    v-for="variant in variants"
                    :key="variant.id || variant.platform"
                    class="rounded-xl border p-4"
                  >
                    <div class="mb-2 flex items-center gap-2 text-sm font-medium">
                      <Icon :name="platformIcon(variant.platform)" class="h-4 w-4" />
                      {{ variant.platform }}
                      <Badge v-if="variant.format" variant="outline" class="ml-auto">
                        {{ variant.format }}
                      </Badge>
                    </div>
                    <p class="whitespace-pre-wrap text-sm leading-relaxed">
                      {{ buildCaptionWithHashtags(variant.caption, variant.hashtags) || 'Sem legenda' }}
                    </p>
                    <p v-if="variant.cta || variant.call_to_action" class="mt-2 text-xs">
                      <span class="text-muted-foreground">CTA:</span>
                      {{ variant.cta || variant.call_to_action }}
                    </p>
                    <p v-if="variant.link_url" class="mt-2 break-all text-xs text-primary">
                      {{ variant.link_url }}
                    </p>
                  </div>
                </div>

                <div class="grid gap-3 text-sm sm:grid-cols-2">
                  <div class="rounded-lg border p-3">
                    <p class="text-xs text-muted-foreground">
                      Data prevista
                    </p>
                    <p class="font-medium">
                      {{ detail.scheduled_at ? new Date(detail.scheduled_at).toLocaleString('pt-BR') : 'Não definida' }}
                    </p>
                  </div>
                  <div class="rounded-lg border p-3">
                    <p class="text-xs text-muted-foreground">
                      Prazo da aprovação
                    </p>
                    <p class="font-medium">
                      {{ detail.due_at ? new Date(detail.due_at).toLocaleString('pt-BR') : 'Sem prazo' }}
                    </p>
                  </div>
                </div>

                <div v-if="(detail.accounts || []).length" class="space-y-2">
                  <h4 class="text-sm font-semibold">
                    Contas selecionadas
                  </h4>
                  <div class="flex flex-wrap gap-2">
                    <Badge
                      v-for="(account, idx) in detail.accounts"
                      :key="account.id || `${account.platform}-${idx}`"
                      variant="secondary"
                      class="gap-1"
                    >
                      <Icon :name="platformIcon(account.platform)" class="h-3 w-3" />
                      {{ account.name || account.username || account.platform }}
                    </Badge>
                  </div>
                </div>

                <div class="space-y-2">
                  <h4 class="text-sm font-semibold">
                    {{ clientMode ? 'Decisões' : 'Aprovadores e decisões' }}
                  </h4>
                  <div v-if="!clientMode" class="flex flex-wrap gap-2">
                    <Badge
                      v-for="approver in detail.raw?.approval_request_approvers || []"
                      :key="approver.user_id"
                      variant="secondary"
                    >
                      {{ approver.role_name || 'Aprovador' }}
                    </Badge>
                  </div>
                  <div
                    v-for="decision in visibleDecisions"
                    :key="`${decision.approver_id}-${decision.created_at}`"
                    class="rounded-lg border p-3 text-sm"
                  >
                    <div class="flex flex-wrap items-center gap-2">
                      <ApprovalStatusBadge
                        :status="decision.decision"
                        :show-icon="true"
                      />
                      <span
                        v-if="decision.change_category"
                        class="text-xs text-muted-foreground"
                      >
                        {{ APPROVAL_CHANGE_CATEGORY_LABELS[decision.change_category as ApprovalChangeCategory] || decision.change_category }}
                      </span>
                    </div>
                    <p v-if="decision.comment" class="mt-2 text-muted-foreground">
                      {{ decision.comment }}
                    </p>
                    <p class="mt-1 text-xs text-muted-foreground">
                      {{ new Date(decision.created_at).toLocaleString('pt-BR') }}
                    </p>
                  </div>
                  <p
                    v-if="!visibleDecisions.length"
                    class="text-sm text-muted-foreground"
                  >
                    Nenhuma decisão registrada ainda.
                  </p>
                </div>

                <div class="space-y-3">
                  <h4 class="text-sm font-semibold">
                    Comentários
                  </h4>
                  <div
                    v-for="item in detail.comments || []"
                    :key="item.id"
                    class="rounded-lg border p-3 text-sm"
                  >
                    <div class="mb-1 flex items-center gap-2">
                      <Badge v-if="item.visibility === 'internal' && !clientMode" variant="outline">
                        Interno
                      </Badge>
                      <Badge v-if="item.anchor_type && item.anchor_type !== 'none'" variant="secondary">
                        <template v-if="item.anchor_type === 'video'">
                          {{ Math.floor((item.media_time_ms || 0) / 1000) }}s
                        </template>
                        <template v-else>
                          Marcação
                        </template>
                      </Badge>
                      <span class="text-xs text-muted-foreground">
                        {{ new Date(item.created_at).toLocaleString('pt-BR') }}
                      </span>
                    </div>
                    <p class="whitespace-pre-wrap leading-relaxed">
                      {{ item.body }}
                    </p>
                  </div>
                  <p v-if="!(detail.comments || []).length" class="text-sm text-muted-foreground">
                    Nenhum comentário ainda.
                  </p>

                  <div v-if="can('marketing.social.comment')" class="space-y-2 rounded-xl border p-3">
                    <Textarea v-model="threadComment" class="min-h-20 text-base sm:text-sm" placeholder="Escreva um comentário…" />
                    <div class="flex flex-wrap items-center gap-2">
                      <Select
                        v-if="canCommentInternal"
                        v-model="commentVisibility"
                      >
                        <SelectTrigger class="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="shared">
                            Compartilhado com cliente
                          </SelectItem>
                          <SelectItem value="internal">
                            Interno (agência)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" class="min-h-11" :disabled="saving || !threadComment.trim()" @click="sendComment">
                        Comentar
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="compare" class="mt-4">
                <ApprovalVersionCompare
                  :current-snapshot="detail.version?.snapshot"
                  :previous-snapshot="detail.previous_version?.snapshot || null"
                  :current-version-number="detail.version?.number || null"
                  :previous-version-number="detail.previous_version?.number || null"
                  :created-at="detail.version?.created_at"
                  :author-id="detail.version?.created_by"
                  :revision-reason="lastRevisionReason"
                />
              </TabsContent>

              <TabsContent value="history" class="mt-4 space-y-3">
                <div
                  v-for="event in detail.timeline || []"
                  :key="event.id"
                  class="flex gap-3 border-b pb-3 text-sm last:border-0"
                >
                  <div class="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <div>
                    <p class="font-medium">
                      {{ event.summary }}
                    </p>
                    <p class="text-xs text-muted-foreground">
                      {{ new Date(event.created_at).toLocaleString('pt-BR') }}
                    </p>
                  </div>
                </div>
                <p v-if="!(detail.timeline || []).length" class="text-sm text-muted-foreground">
                  Sem eventos ainda.
                </p>

                <div v-if="(detail.versions || []).length" class="space-y-2 pt-2">
                  <h4 class="text-sm font-semibold">
                    Histórico de versões
                  </h4>
                  <div
                    v-for="version in detail.versions"
                    :key="version.id"
                    class="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                  >
                    <span>v{{ version.number }}</span>
                    <Badge v-if="version.is_current_approval" variant="default">
                      Em aprovação
                    </Badge>
                    <span v-else class="text-xs text-muted-foreground">
                      {{ new Date(version.created_at).toLocaleDateString('pt-BR') }}
                    </span>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div v-if="showDecisionForm && decisionMode" class="mt-6 space-y-3 rounded-xl border bg-muted/20 p-4">
              <h4 class="font-semibold">
                {{ decisionFormTitle }}
              </h4>
              <Alert v-if="decisionMode === 'rejected'" variant="destructive">
                <AlertTitle>Ação irreversível nesta rodada</AlertTitle>
                <AlertDescription>
                  A peça será marcada como reprovada. Descreva o motivo para a equipe.
                </AlertDescription>
              </Alert>
              <div v-if="decisionMode === 'changes_requested'" class="space-y-2">
                <Label>O que precisa mudar</Label>
                <Select v-model="changeCategory">
                  <SelectTrigger class="min-h-11">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      v-for="(label, key) in changeCategoryOptions"
                      :key="key"
                      :value="key"
                    >
                      {{ label }}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p v-if="clientMode" class="text-xs text-muted-foreground">
                  Descreva o texto e, se quiser, marque um ponto na imagem acima.
                </p>
              </div>
              <div class="space-y-2">
                <Label>
                  {{ decisionMode === 'approved' ? 'Comentário opcional' : 'Motivo obrigatório' }}
                </Label>
                <Textarea
                  v-model="decisionComment"
                  class="min-h-28 text-base sm:text-sm"
                  :placeholder="decisionMode === 'approved' ? 'Opcional…' : 'Descreva o motivo…'"
                  :disabled="saving"
                />
              </div>
              <div class="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  class="min-h-11"
                  :disabled="saving"
                  @click="showDecisionForm = false"
                >
                  Voltar
                </Button>
                <Button
                  :variant="decisionMode === 'approved' ? 'default' : 'destructive'"
                  class="min-h-11 sm:flex-1"
                  :disabled="saving"
                  @click="submitDecision"
                >
                  <Icon
                    v-if="saving"
                    name="lucide:loader-2"
                    class="mr-2 h-4 w-4 animate-spin"
                  />
                  <Icon
                    v-else-if="decisionMode === 'approved'"
                    name="lucide:check"
                    class="mr-2 h-4 w-4"
                  />
                  Confirmar
                </Button>
              </div>
            </div>
          </template>
        </template>
      </div>

      <!-- Sticky actions (mobile + desktop) -->
      <div
        v-if="showStickyActions && detail?.error_state !== 'forbidden'"
        class="shrink-0 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6"
      >
        <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            v-if="canDecideNow"
            class="min-h-11 w-full sm:order-1 sm:w-auto sm:min-w-32"
            :disabled="saving"
            @click="startDecision('approved')"
          >
            <Icon name="lucide:check" class="mr-1.5 h-4 w-4" />
            Aprovar
          </Button>
          <Button
            v-if="canDecideNow"
            variant="outline"
            class="min-h-11 w-full sm:order-2 sm:w-auto"
            :disabled="saving"
            @click="startDecision('changes_requested')"
          >
            <Icon name="lucide:message-square-warning" class="mr-1.5 h-4 w-4" />
            Pedir alterações
          </Button>
          <Button
            v-if="canDecideNow"
            variant="ghost"
            class="min-h-11 w-full text-destructive hover:bg-destructive/10 hover:text-destructive sm:order-3 sm:w-auto"
            :disabled="saving"
            @click="startDecision('rejected')"
          >
            <Icon name="lucide:x" class="mr-1.5 h-4 w-4" />
            Reprovar
          </Button>
          <Button
            v-if="canEdit && (detail.status === 'changes_requested' || detail.status === 'pending')"
            variant="secondary"
            class="min-h-11 w-full sm:order-4 sm:w-auto"
            :disabled="saving"
            @click="openEditor"
          >
            <Icon name="lucide:pencil" class="mr-1.5 h-4 w-4" />
            {{ detail.status === 'changes_requested' ? 'Editar e nova versão' : 'Editar peça' }}
          </Button>
          <Button
            v-if="canSchedule && detail.post?.editorial_status === 'approved'"
            variant="secondary"
            class="min-h-11 w-full sm:order-5 sm:w-auto"
            :disabled="saving"
            @click="scheduleApproved"
          >
            <Icon name="lucide:calendar-clock" class="mr-1.5 h-4 w-4" />
            Agendar
          </Button>
          <Button
            v-if="canCancel"
            variant="ghost"
            class="min-h-11 w-full sm:order-6 sm:w-auto"
            :disabled="saving"
            @click="confirmCancelOpen = true"
          >
            Cancelar solicitação
          </Button>
          <Button
            v-if="canBypass && detail.status === 'pending'"
            variant="ghost"
            class="min-h-11 w-full sm:order-7 sm:w-auto"
            :disabled="saving"
            @click="openBypassDialog"
          >
            Avançar (bypass)
          </Button>
        </div>
      </div>
    </SheetContent>
  </Sheet>

  <AlertDialog v-model:open="confirmCancelOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Cancelar solicitação?</AlertDialogTitle>
        <AlertDialogDescription>
          A rodada de aprovação será encerrada. A peça volta para edição sem decisão registrada.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="saving">
          Manter
        </AlertDialogCancel>
        <AlertDialogAction
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          :disabled="saving"
          @click.prevent="cancelRequest"
        >
          Cancelar solicitação
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <AlertDialog v-model:open="confirmBypassOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Avançar sem aprovação?</AlertDialogTitle>
        <AlertDialogDescription>
          O bypass fica registrado na auditoria. Justifique o motivo para a equipe.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div class="space-y-2 py-2">
        <Label for="bypass-justification">
          Justificativa
        </Label>
        <Textarea
          id="bypass-justification"
          v-model="bypassJustification"
          class="min-h-24"
          placeholder="Ex.: urgência comercial com alinhamento verbal do cliente"
          :disabled="saving"
        />
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="saving">
          Voltar
        </AlertDialogCancel>
        <AlertDialogAction
          :disabled="saving || !bypassJustification.trim()"
          @click.prevent="runBypass"
        >
          Confirmar bypass
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
