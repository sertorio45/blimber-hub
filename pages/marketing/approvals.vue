<script setup lang="ts">
import ApprovalReviewSheet from '@/components/marketing/social/ApprovalReviewSheet.vue'
import ApprovalMediaPreview from '@/components/marketing/social/ApprovalMediaPreview.vue'
import {
  APPROVAL_REQUEST_STATUS_LABELS,
  APPROVAL_STAGE_LABELS,
} from '~/types/marketing-social'
import { uniqueApprovalPreviewAssets, platformIcon } from '@/utils/marketing-social-preview'
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

  // Client portal: assigned + tenant client-stage they can decide. No agency filters.
  if (isClientPortal.value) {
    const status = filters.bucket === 'approved'
      ? 'approved'
      : filters.bucket === 'all'
        ? 'all'
        : 'pending'
    return {
      inbox: 'client',
      status,
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

/** Unique assignees seen in the current board — used for the responsável filter. */
const responsibleOptions = computed(() => {
  const ids = new Set<string>()
  for (const item of items.value) {
    for (const id of item.approver_ids || [])
      ids.add(id)
    if (item.assigned_to)
      ids.add(item.assigned_to)
  }
  return [...ids]
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

function statusLabel(status: string) {
  return APPROVAL_REQUEST_STATUS_LABELS[status] || status
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
  if (item.status === 'pending')
    return item.stage === 'internal' ? 'Revisar internamente' : 'Aprovar ou solicitar ajustes'
  if (item.status === 'changes_requested')
    return 'Aguardando nova versão'
  if (item.status === 'approved')
    return 'Agendar / publicar'
  return '—'
}

const emptyCopy = computed(() => {
  if (isClientPortal.value) {
    return {
      title: 'Nada para aprovar agora',
      description: 'Quando a agência enviar peças, elas aparecerão aqui em cards grandes.',
    }
  }
  return {
    title: 'Nenhuma aprovação neste filtro',
    description: 'Ajuste os filtros ou aguarde novos envios da produção.',
  }
})

const agencyBuckets = [
  { value: 'assigned', label: 'Atribuídos a mim' },
  { value: 'internal', label: 'Revisão interna' },
  { value: 'client', label: 'Aguardando cliente' },
  { value: 'changes', label: 'Alterações solicitadas' },
  { value: 'approved', label: 'Aprovados' },
  { value: 'overdue', label: 'Atrasados' },
  { value: 'all', label: 'Todos' },
]

const clientBuckets = [
  { value: 'assigned', label: 'Pendentes' },
  { value: 'approved', label: 'Aprovados' },
  { value: 'all', label: 'Histórico' },
]
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
            ? 'Revise a peça exata enviada para você — poucos cliques.'
            : 'Gargalos por cliente, etapa e prazo. Sempre na versão correta.' }}
        </p>
      </div>
      <Button variant="outline" size="sm" :disabled="pending" @click="refresh()">
        Atualizar
      </Button>
    </div>

    <!-- Filters -->
    <div class="flex flex-col gap-3">
      <div class="flex gap-2 overflow-x-auto pb-1">
        <Button
          v-for="bucket in (isClientPortal ? clientBuckets : agencyBuckets)"
          :key="bucket.value"
          size="sm"
          :variant="filters.bucket === bucket.value ? 'default' : 'outline'"
          class="shrink-0"
          @click="filters.bucket = bucket.value"
        >
          {{ bucket.label }}
        </Button>
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

        <Select v-model="filters.responsibleId">
          <SelectTrigger>
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              Qualquer responsável
            </SelectItem>
            <SelectItem
              v-for="id in responsibleOptions"
              :key="id"
              :value="id"
            >
              {{ id.slice(0, 8) }}…
            </SelectItem>
          </SelectContent>
        </Select>

        <Input v-model="filters.search" placeholder="Buscar título ou cliente…" />
      </div>

      <div
        v-if="!isClientPortal"
        class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
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
    </div>

    <!-- Loading -->
    <MarketingPageSkeleton v-if="showSkeleton" variant="grid" :cards="6" content-only />

    <!-- Empty -->
    <div
      v-else-if="!items.length"
      class="rounded-xl border border-dashed p-12 text-center"
    >
      <Icon name="lucide:badge-check" class="mx-auto h-10 w-10 text-muted-foreground" />
      <p class="mt-3 font-medium">
        {{ emptyCopy.title }}
      </p>
      <p class="mt-1 text-sm text-muted-foreground">
        {{ emptyCopy.description }}
      </p>
    </div>

    <div
      v-else-if="isClientPortal && pendingSelectable.length"
      class="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 px-4 py-3"
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
        <Icon name="lucide:check" class="mr-1 h-4 w-4" />
        Aprovar selecionados ({{ selectedIds.length }})
      </Button>
    </div>

    <div
      v-if="!pending && monthGroups.length > 1"
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
      v-if="!pending && items.length"
      class="grid gap-4"
      :class="isClientPortal ? 'sm:grid-cols-1 lg:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3'"
    >
      <div
        v-for="item in items"
        :key="item.id"
        class="relative overflow-hidden rounded-xl border bg-card text-left transition hover:border-primary/40 hover:shadow-sm"
      >
        <div
          v-if="isClientPortal && item.status === 'pending' && item.can_decide !== false"
          class="absolute left-3 top-3 z-10"
          @click.stop
        >
          <Checkbox
            :checked="selectedIds.includes(item.id)"
            @update:checked="toggleSelected(item.id)"
          />
        </div>
        <button
          type="button"
          class="w-full text-left"
          @click="openItem(item)"
        >
        <div :class="isClientPortal ? 'aspect-[4/3]' : 'aspect-square'">
          <ApprovalMediaPreview
            :assets="uniqueApprovalPreviewAssets(item.raw || item)"
            :format="item.formats?.[0]"
          />
        </div>
        <div class="space-y-2 p-4">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p v-if="!isClientPortal && item.client?.name" class="truncate text-xs text-muted-foreground">
                {{ item.client.name }}
              </p>
              <h3 class="truncate font-semibold">
                {{ item.title }}
              </h3>
            </div>
            <Badge
              :variant="item.overdue ? 'destructive' : item.status === 'pending' ? 'default' : 'secondary'"
              class="shrink-0"
            >
              {{ item.overdue ? 'Atrasado' : statusLabel(item.status) }}
            </Badge>
          </div>

          <div class="flex flex-wrap gap-1.5">
            <Badge
              v-for="platform in item.platforms || []"
              :key="platform"
              variant="outline"
              class="gap-1"
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
              <dd class="font-medium text-foreground">
                {{ item.due_at ? new Date(item.due_at).toLocaleDateString('pt-BR') : '—' }}
              </dd>
            </div>
            <div>
              <dt>Aguardando</dt>
              <dd class="font-medium text-foreground">
                {{ waitingLabel(item.waiting_ms) }}
              </dd>
            </div>
            <div>
              <dt>Responsáveis</dt>
              <dd class="font-medium text-foreground">
                {{ (item.approver_ids || []).length || '—' }}
              </dd>
            </div>
            <div>
              <dt>Versão</dt>
              <dd class="font-medium text-foreground">
                v{{ item.version_number || '—' }}
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
            Aprovar {{ selectedIds.length }} {{ selectedIds.length === 1 ? 'peça' : 'peças' }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
