<script setup lang="ts">
import ApprovalReviewSheet from '@/components/marketing/social/ApprovalReviewSheet.vue'
import ApprovalMediaPreview from '@/components/marketing/social/ApprovalMediaPreview.vue'
import ApprovalStatusBadge from '@/components/marketing/social/ApprovalStatusBadge.vue'
import {
  APPROVAL_STAGE_LABELS,
} from '~/types/marketing-social'
import { uniqueApprovalPreviewAssets, platformIcon } from '@/utils/marketing-social-preview'
import {
  approvalStatusAccentClass,
} from '~/utils/marketing-approval-status'
import { useMarketingAudience } from '~/composables/marketing/useMarketingAudience'
import { useWorkspace } from '~/composables/useWorkspace'
import { toast } from 'vue-sonner'

definePageMeta({
  middleware: ['auth'],
  title: 'Aprovações',
})

const route = useRoute()
const social = useMarketingSocial()
const {
  can,
  isAgencyWorkspace,
  organization,
  managedTenants,
  organizationRelationshipType,
} = useWorkspace()
const { isClientExperience } = useMarketingAudience()

const isClientPortal = computed(() =>
  isClientExperience.value
  || (
    !can('agency.clients.read')
    && (organizationRelationshipType.value === 'managed' || !isAgencyWorkspace.value)
  ),
)

const isAgencyBoard = computed(() =>
  isAgencyWorkspace.value && can('agency.clients.read'),
)

const filters = reactive({
  bucket: 'assigned' as string,
  clientTenantId: 'all' as string,
  platform: 'all' as string,
  format: 'all' as string,
  responsibleId: 'all' as string,
  search: '',
  from: '',
  to: '',
})

const reviewOpen = ref(false)
const activeId = ref<string | null>(null)
const activeTenantId = ref<string | null>(null)
const selectedIds = ref<string[]>([])
const batchSaving = ref(false)
const confirmBulkOpen = ref(false)

const listQuery = computed(() => {
  const q: Record<string, unknown> = {
    groupBy: 'month',
  }

  if (isAgencyBoard.value && organization.value?.id) {
    q.organizationId = organization.value.id
    if (filters.clientTenantId !== 'all')
      q.tenantIdFilter = filters.clientTenantId
  }

  switch (filters.bucket) {
    case 'assigned':
      q.assignedToMe = true
      q.status = 'pending'
      break
    case 'internal':
      q.status = 'pending'
      q.stage = 'internal'
      break
    case 'client':
      q.status = 'pending'
      q.stage = 'client'
      break
    case 'changes':
      q.status = 'changes_requested'
      break
    case 'approved':
      q.status = 'approved'
      break
    case 'rejected':
      q.status = 'rejected'
      break
    case 'overdue':
      q.status = 'overdue'
      break
    default:
      q.status = 'all'
  }

  if (filters.platform !== 'all')
    q.platform = filters.platform
  if (filters.format !== 'all')
    q.format = filters.format
  if (filters.responsibleId !== 'all')
    q.responsibleId = filters.responsibleId
  if (filters.search.trim())
    q.search = filters.search.trim()
  if (filters.from)
    q.from = new Date(filters.from).toISOString()
  if (filters.to)
    q.to = new Date(`${filters.to}T23:59:59`).toISOString()

  // Client portal: assigned + tenant client-stage they can decide.
  if (isClientPortal.value) {
    const statusByBucket: Record<string, string> = {
      assigned: 'pending',
      approved: 'approved',
      changes: 'changes_requested',
      rejected: 'rejected',
      all: 'all',
    }
    return {
      inbox: 'client',
      status: statusByBucket[filters.bucket] || 'pending',
      search: filters.search.trim() || undefined,
      platform: filters.platform !== 'all' ? filters.platform : undefined,
      format: filters.format !== 'all' ? filters.format : undefined,
    }
  }

  return q
})

const { data: listResponse, pending, showSkeleton, refresh } = useMarketingFetch({
  key: () => `approvals-board-${JSON.stringify(listQuery.value)}-${social.tenantId.value}-${organization.value?.id || ''}`,
  handler: () => social.listApprovals(listQuery.value),
  default: () => ({ data: [] as any[], meta: {} as Record<string, unknown> }),
  watch: [listQuery, () => social.tenantId.value, () => organization.value?.id],
  enabled: () => Boolean(social.tenantId.value),
})

const items = computed(() => listResponse.value?.data || [])
const monthGroups = computed(() => listResponse.value?.meta?.groups || [])
const pendingSelectable = computed(() =>
  items.value.filter((item: any) => item.status === 'pending' && item.can_decide !== false),
)
const allPendingSelected = computed(() =>
  pendingSelectable.value.length > 0
  && pendingSelectable.value.every((item: any) => selectedIds.value.includes(item.id)),
)

const hasActiveSecondaryFilters = computed(() =>
  filters.platform !== 'all'
  || filters.format !== 'all'
  || filters.responsibleId !== 'all'
  || filters.clientTenantId !== 'all'
  || Boolean(filters.search.trim())
  || Boolean(filters.from)
  || Boolean(filters.to),
)

watch(items, () => {
  const valid = new Set(items.value.map((item: any) => item.id))
  selectedIds.value = selectedIds.value.filter(id => valid.has(id))
})

function toggleSelected(id: string, event?: Event) {
  event?.stopPropagation()
  if (selectedIds.value.includes(id))
    selectedIds.value = selectedIds.value.filter(value => value !== id)
  else
    selectedIds.value = [...selectedIds.value, id]
}

function toggleSelectAllPending() {
  if (allPendingSelected.value)
    selectedIds.value = []
  else
    selectedIds.value = pendingSelectable.value.map((item: any) => item.id)
}

function requestBulkApprove() {
  if (!selectedIds.value.length)
    return
  confirmBulkOpen.value = true
}

async function approveSelected() {
  if (!selectedIds.value.length)
    return
  batchSaving.value = true
  try {
    const response = await social.batchDecide(
      selectedIds.value.map(requestId => ({
        requestId,
        decision: 'approved' as const,
      })),
    )
    const data = response.data
    if (data.failed) {
      toast.message(`${data.succeeded} aprovados, ${data.failed} com falha`)
    }
    else {
      toast.success(`${data.succeeded} conteúdos aprovados`)
    }
    selectedIds.value = []
    confirmBulkOpen.value = false
    await refresh()
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || 'Não foi possível aprovar o lote')
  }
  finally {
    batchSaving.value = false
  }
}

/** Assignees with human-readable labels from role_name when available. */
const responsibleOptions = computed(() => {
  const map = new Map<string, string>()
  for (const item of items.value) {
    for (const approver of item.raw?.approval_request_approvers || []) {
      if (!approver?.user_id)
        continue
      const label = approver.role_name || approver.role_slug || 'Aprovador'
      if (!map.has(approver.user_id))
        map.set(approver.user_id, label)
    }
  }
  return [...map.entries()].map(([id, label]) => ({ id, label }))
})

function openItem(item: any) {
  activeId.value = item.id
  activeTenantId.value = item.tenant_id
  reviewOpen.value = true
}

function onDecided(payload?: { id: string, status: string }) {
  if (payload?.id && listResponse.value?.data) {
    const row = listResponse.value.data.find((item: any) => item.id === payload.id)
    if (row)
      row.status = payload.status
  }
  refresh()
}

function clearSecondaryFilters() {
  filters.clientTenantId = 'all'
  filters.platform = 'all'
  filters.format = 'all'
  filters.responsibleId = 'all'
  filters.search = ''
  filters.from = ''
  filters.to = ''
}

onMounted(() => {
  const requestId = typeof route.query.request === 'string' ? route.query.request : null
  if (requestId) {
    activeId.value = requestId
    reviewOpen.value = true
  }
})

function waitingLabel(ms: number | null | undefined) {
  if (ms == null)
    return '—'
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1)
    return '<1h'
  if (hours < 24)
    return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

function nextAction(item: any) {
  if (item.status === 'pending') {
    if (item.can_decide === false)
      return 'Aguardando outro aprovador'
    return item.stage === 'internal' ? 'Revisar internamente' : 'Aprovar ou solicitar ajustes'
  }
  if (item.status === 'changes_requested')
    return isClientPortal.value ? 'Aguardando nova versão da agência' : 'Aguardando nova versão'
  if (item.status === 'approved')
    return isClientPortal.value ? 'Pronto para publicação' : 'Agendar / publicar'
  if (item.status === 'rejected')
    return 'Reprovado — arquivar ou refazer'
  return '—'
}

const emptyCopy = computed(() => {
  const bucket = filters.bucket
  if (isClientPortal.value) {
    if (bucket === 'approved') {
      return {
        title: 'Nenhuma peça aprovada ainda',
        description: 'Quando você aprovar conteúdos, eles aparecerão neste histórico.',
      }
    }
    if (bucket === 'changes') {
      return {
        title: 'Nenhum ajuste em andamento',
        description: 'Peças com alterações solicitadas aparecem aqui até a nova versão chegar.',
      }
    }
    if (bucket === 'rejected') {
      return {
        title: 'Nenhuma reprovação',
        description: 'Conteúdos reprovados ficam registrados neste filtro.',
      }
    }
    if (hasActiveSecondaryFilters.value) {
      return {
        title: 'Nenhum resultado',
        description: 'Tente limpar a busca ou os filtros para ver mais peças.',
      }
    }
    return {
      title: 'Nada para aprovar agora',
      description: 'Quando a agência enviar peças, elas aparecerão aqui para revisão.',
    }
  }

  if (bucket === 'assigned') {
    return {
      title: 'Nada atribuído a você',
      description: 'Solicitações em que você é aprovador aparecerão neste filtro.',
    }
  }
  if (bucket === 'overdue') {
    return {
      title: 'Nenhum atraso',
      description: 'Ótimo — não há aprovações pendentes além do prazo.',
    }
  }
  if (hasActiveSecondaryFilters.value) {
    return {
      title: 'Nenhuma aprovação neste filtro',
      description: 'Ajuste ou limpe os filtros para ver outras solicitações.',
    }
  }
  return {
    title: 'Nenhuma aprovação neste filtro',
    description: 'Aguarde novos envios da produção ou mude o filtro de status.',
  }
})

const agencyBuckets = [
  { value: 'assigned', label: 'Atribuídos a mim' },
  { value: 'internal', label: 'Revisão interna' },
  { value: 'client', label: 'Aguardando cliente' },
  { value: 'changes', label: 'Alterações' },
  { value: 'approved', label: 'Aprovados' },
  { value: 'rejected', label: 'Reprovados' },
  { value: 'overdue', label: 'Atrasados' },
  { value: 'all', label: 'Todos' },
]

const clientBuckets = [
  { value: 'assigned', label: 'Pendentes' },
  { value: 'changes', label: 'Em ajuste' },
  { value: 'approved', label: 'Aprovados' },
  { value: 'rejected', label: 'Reprovados' },
  { value: 'all', label: 'Histórico' },
]

const showBulkBar = computed(() => pendingSelectable.value.length > 0)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">
          {{ isClientPortal ? 'Aprovar conteúdos' : 'Aprovações' }}
        </h1>
        <p class="mt-1 text-muted-foreground">
          {{ isClientPortal
            ? 'Revise a peça enviada, aprove ou peça ajustes — poucos cliques.'
            : 'Gargalos por cliente, etapa e prazo. Sempre na versão correta.' }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Badge
          v-if="!pending && items.length"
          variant="outline"
          class="hidden sm:inline-flex"
        >
          {{ items.length }} {{ items.length === 1 ? 'item' : 'itens' }}
        </Badge>
        <Button variant="outline" size="sm" :disabled="pending" @click="refresh()">
          <Icon name="lucide:refresh-cw" class="mr-1.5 h-3.5 w-3.5" :class="{ 'animate-spin': pending && !showSkeleton }" />
          Atualizar
        </Button>
      </div>
    </div>

    <!-- Status buckets -->
    <div class="flex flex-col gap-3">
      <div class="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filtros de status">
        <Button
          v-for="bucket in (isClientPortal ? clientBuckets : agencyBuckets)"
          :key="bucket.value"
          size="sm"
          :variant="filters.bucket === bucket.value ? 'default' : 'outline'"
          class="shrink-0"
          role="tab"
          :aria-selected="filters.bucket === bucket.value"
          @click="filters.bucket = bucket.value"
        >
          {{ bucket.label }}
        </Button>
      </div>

      <!-- Shared search + filters -->
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div class="relative sm:col-span-2 lg:col-span-2">
          <Icon
            name="lucide:search"
            class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            v-model="filters.search"
            class="pl-9"
            :placeholder="isClientPortal ? 'Buscar por título…' : 'Buscar título ou cliente…'"
            aria-label="Buscar aprovações"
          />
        </div>

        <Select v-model="filters.platform">
          <SelectTrigger>
            <SelectValue placeholder="Rede" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              Todas as redes
            </SelectItem>
            <SelectItem value="instagram">
              Instagram
            </SelectItem>
            <SelectItem value="facebook">
              Facebook
            </SelectItem>
            <SelectItem value="linkedin">
              LinkedIn
            </SelectItem>
          </SelectContent>
        </Select>

        <Select v-model="filters.format">
          <SelectTrigger>
            <SelectValue placeholder="Formato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              Todos os formatos
            </SelectItem>
            <SelectItem value="static">
              Estático
            </SelectItem>
            <SelectItem value="carousel">
              Carrossel
            </SelectItem>
            <SelectItem value="video">
              Vídeo / Reel
            </SelectItem>
            <SelectItem value="story">
              Story
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div
        v-if="!isClientPortal"
        class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Select v-if="isAgencyBoard" v-model="filters.clientTenantId">
          <SelectTrigger>
            <SelectValue placeholder="Cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              Todos os clientes
            </SelectItem>
            <SelectItem
              v-for="tenant in managedTenants"
              :key="tenant.id"
              :value="tenant.id"
            >
              {{ tenant.name }}
            </SelectItem>
          </SelectContent>
        </Select>

        <Select v-if="responsibleOptions.length" v-model="filters.responsibleId">
          <SelectTrigger>
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              Qualquer responsável
            </SelectItem>
            <SelectItem
              v-for="option in responsibleOptions"
              :key="option.id"
              :value="option.id"
            >
              {{ option.label }}
            </SelectItem>
          </SelectContent>
        </Select>

        <div class="space-y-1">
          <Label class="text-xs">
            De
          </Label>
          <Input v-model="filters.from" type="date" />
        </div>
        <div class="space-y-1">
          <Label class="text-xs">
            Até
          </Label>
          <Input v-model="filters.to" type="date" />
        </div>
      </div>

      <div v-if="hasActiveSecondaryFilters" class="flex justify-end">
        <Button variant="ghost" size="sm" @click="clearSecondaryFilters">
          <Icon name="lucide:x" class="mr-1 h-3.5 w-3.5" />
          Limpar filtros
        </Button>
      </div>
    </div>

    <!-- Loading -->
    <MarketingPageSkeleton v-if="showSkeleton" variant="grid" :cards="6" content-only />

    <template v-else>
      <!-- Soft refresh -->
      <div
        v-if="pending"
        class="flex items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground"
      >
        <Icon name="lucide:loader-2" class="h-4 w-4 animate-spin" />
        Atualizando lista…
      </div>

      <!-- Empty -->
      <div
        v-else-if="!items.length"
        class="rounded-xl border border-dashed bg-muted/20 p-12 text-center"
      >
        <Icon
          :name="filters.bucket === 'approved' ? 'lucide:badge-check' : filters.bucket === 'overdue' ? 'lucide:alarm-clock' : 'lucide:inbox'"
          class="mx-auto h-10 w-10 text-muted-foreground"
        />
        <p class="mt-3 font-medium">
          {{ emptyCopy.title }}
        </p>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ emptyCopy.description }}
        </p>
        <Button
          v-if="hasActiveSecondaryFilters"
          variant="outline"
          size="sm"
          class="mt-4"
          @click="clearSecondaryFilters"
        >
          Limpar filtros
        </Button>
      </div>

      <template v-if="items.length">
        <!-- Bulk bar (agency + client) -->
        <div
          v-if="showBulkBar"
          class="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80"
        >
          <label class="flex items-center gap-2 text-sm">
            <Checkbox
              :checked="allPendingSelected"
              @update:checked="toggleSelectAllPending"
            />
            Selecionar pendentes ({{ pendingSelectable.length }})
          </label>
          <Button
            size="sm"
            class="min-h-11"
            :disabled="!selectedIds.length || batchSaving"
            @click="requestBulkApprove"
          >
            <Icon
              :name="batchSaving ? 'lucide:loader-2' : 'lucide:check'"
              class="mr-1 h-4 w-4"
              :class="{ 'animate-spin': batchSaving }"
            />
            Aprovar selecionados ({{ selectedIds.length }})
          </Button>
        </div>

        <div
          v-if="monthGroups.length > 1"
          class="flex flex-wrap gap-2"
        >
          <Badge
            v-for="group in monthGroups"
            :key="group.key"
            variant="outline"
          >
            {{ group.label }} · {{ group.ids.length }}
          </Badge>
        </div>

        <!-- Cards -->
        <div
          class="grid gap-4"
          :class="[
            isClientPortal ? 'sm:grid-cols-1 lg:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3',
            pending ? 'opacity-60' : '',
          ]"
        >
          <div
            v-for="item in items"
            :key="item.id"
            class="relative overflow-hidden rounded-xl border border-l-4 bg-card text-left transition hover:border-primary/30 hover:shadow-sm focus-within:ring-2 focus-within:ring-ring"
            :class="approvalStatusAccentClass(item.status, item.overdue)"
          >
            <div
              v-if="item.status === 'pending' && item.can_decide !== false"
              class="absolute left-3 top-3 z-10"
              @click.stop
            >
              <Checkbox
                :checked="selectedIds.includes(item.id)"
                :aria-label="`Selecionar ${item.title}`"
                @update:checked="toggleSelected(item.id)"
              />
            </div>
            <button
              type="button"
              class="w-full text-left outline-none"
              @click="openItem(item)"
            >
              <div :class="isClientPortal ? 'aspect-[4/3]' : 'aspect-square'">
                <ApprovalMediaPreview
                  :assets="uniqueApprovalPreviewAssets(item.raw || item)"
                  :format="item.formats?.[0]"
                />
              </div>
              <div class="space-y-2.5 p-4">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p v-if="!isClientPortal && item.client?.name" class="truncate text-xs text-muted-foreground">
                      {{ item.client.name }}
                    </p>
                    <h3 class="truncate font-semibold leading-snug">
                      {{ item.title }}
                    </h3>
                  </div>
                  <ApprovalStatusBadge
                    :status="item.status"
                    :overdue="Boolean(item.overdue)"
                    class="shrink-0"
                  />
                </div>

                <div class="flex flex-wrap gap-1.5">
                  <Badge
                    v-for="platform in item.platforms || []"
                    :key="platform"
                    variant="outline"
                    class="gap-1 capitalize"
                  >
                    <Icon :name="platformIcon(platform)" class="h-3 w-3" />
                    {{ platform }}
                  </Badge>
                  <Badge v-if="!isClientPortal && item.stage" variant="secondary">
                    {{ APPROVAL_STAGE_LABELS[item.stage as 'internal' | 'client'] }}
                  </Badge>
                  <Badge v-if="item.version_number" variant="outline">
                    v{{ item.version_number }}
                  </Badge>
                </div>

                <dl class="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    <dt>Prazo</dt>
                    <dd class="font-medium text-foreground" :class="{ 'text-destructive': item.overdue }">
                      {{ item.due_at ? new Date(item.due_at).toLocaleDateString('pt-BR') : '—' }}
                    </dd>
                  </div>
                  <div>
                    <dt>Aguardando</dt>
                    <dd class="font-medium text-foreground">
                      {{ waitingLabel(item.waiting_ms) }}
                    </dd>
                  </div>
                </dl>

                <p class="text-xs font-medium text-primary">
                  {{ nextAction(item) }}
                </p>
              </div>
            </button>
          </div>
        </div>
      </template>
    </template>

    <!-- Quick links for client portal -->
    <div
      v-if="isClientPortal"
      class="grid gap-3 sm:grid-cols-2"
    >
      <Button variant="outline" class="h-auto justify-start p-4" @click="navigateTo('/marketing/calendar')">
        <Icon name="lucide:calendar-days" class="mr-3 h-5 w-5" />
        <span class="text-left">
          <span class="block font-medium">Calendário aprovado</span>
          <span class="block text-xs text-muted-foreground">Veja o que está agendado</span>
        </span>
      </Button>
      <Button variant="outline" class="h-auto justify-start p-4" @click="navigateTo('/marketing/content?status=published')">
        <Icon name="lucide:circle-check" class="mr-3 h-5 w-5" />
        <span class="text-left">
          <span class="block font-medium">Conteúdo publicado</span>
          <span class="block text-xs text-muted-foreground">Peças já no ar</span>
        </span>
      </Button>
    </div>

    <ApprovalReviewSheet
      v-model:open="reviewOpen"
      :request-id="activeId"
      :tenant-id="activeTenantId"
      :organization-id="isAgencyBoard ? organization?.id : null"
      :client-mode="isClientPortal"
      @decided="onDecided"
    />

    <AlertDialog v-model:open="confirmBulkOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Aprovar {{ selectedIds.length }} {{ selectedIds.length === 1 ? 'peça' : 'peças' }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            As peças selecionadas serão aprovadas. Pedir alterações e reprovar continuam peça a peça.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="batchSaving">
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            class="min-h-11"
            :disabled="batchSaving || !selectedIds.length"
            @click.prevent="approveSelected"
          >
            <Icon
              v-if="batchSaving"
              name="lucide:loader-2"
              class="mr-2 h-4 w-4 animate-spin"
            />
            Aprovar {{ selectedIds.length }} {{ selectedIds.length === 1 ? 'peça' : 'peças' }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
