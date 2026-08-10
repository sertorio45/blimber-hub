<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import FunnelForm from '~/components/crm/config/FunnelForm.vue'
import ColorPicker from '~/components/crm/config/ColorPicker.vue'
import CrmPageHeader from '~/components/crm/shared/CrmPageHeader.vue'
import Button from '~/components/ui/button/Button.vue'
import Card from '~/components/ui/card/Card.vue'
import CardContent from '~/components/ui/card/CardContent.vue'
import Dialog from '~/components/ui/dialog/Dialog.vue'
import DialogContent from '~/components/ui/dialog/DialogContent.vue'
import DialogFooter from '~/components/ui/dialog/DialogFooter.vue'
import DialogHeader from '~/components/ui/dialog/DialogHeader.vue'
import DialogTitle from '~/components/ui/dialog/DialogTitle.vue'
import Input from '~/components/ui/input/Input.vue'
import { toast } from '~/components/ui/toast/use-toast'
import { isTenantScopedRole } from '~/constants/roles'
import { deleteWithConfirm } from '~/composables/useConfirmDelete'
import { useTenantPage } from '~/composables/useTenantPage'
import { useTenantRoleFilter } from '~/composables/useTenantRoleFilter'

definePageMeta({
  middleware: ['auth'],
})

const { tenantId, currentRole, whenTenantReady } = useTenantPage()
const selectedItems = ref<any[]>([])
const showDialog = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const formModel = ref<any>({ name: '', description: '', is_default: false })
const nameError = ref('')
const route = useRoute()
const funnelId = computed(() => route.params.id as string)

// Dados do funil selecionado
const funil = ref<any>(null)
const loadingFunil = ref(true)
const stages = ref<any[]>([])
const loadingStages = ref(true)

// Buscar funil selecionado
async function fetchFunil() {
  if (!funnelId.value || funnelId.value === 'undefined') {
    console.warn('Funil ID não disponível')
    return
  }
  loadingFunil.value = true
  const { data } = await useFetch(`/api/crm/funnel/${funnelId.value}`, { params: { tenant_id: tenantId.value } })
  funil.value = data.value
  if (funil.value) {
    formModel.value = {
      name: funil.value.name,
      description: funil.value.description,
      is_default: funil.value.is_default,
      is_active: funil.value.is_active ?? true,
      priority: funil.value.priority ?? 0,
      id: funil.value.id,
    }
  }
  loadingFunil.value = false
}

// Buscar stages do funil selecionado
async function fetchStages() {
  if (!funnelId.value || funnelId.value === 'undefined') {
    console.warn('Funil ID não disponível para buscar stages')
    return
  }
  loadingStages.value = true
  const { data } = await useFetch(`/api/crm/sales_stage?funnel_id=${funnelId.value}&tenant_id=${tenantId.value}`)
  stages.value = Array.isArray(data.value) ? data.value : []
  // Filtrar e ordenar stages customizados corretamente
  customStages.value = stages.value
    .filter((s: any) => !s.is_default)
    .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
  loadingStages.value = false
}

const {
  data: funnelsRaw,
  refresh: refreshFunnels,
} = await useCachedAsyncData<any[]>(
  computed(() => `crm-funnel-${tenantId.value ?? 'none'}`),
  () => $fetch('/api/crm/funnel', { query: { tenant_id: tenantId.value } }),
  { watch: [tenantId], default: () => null, server: false },
)

const funnelsArray = computed(() => funnelsRaw.value ?? [])
const { filteredData: funnelsByTenant } = useTenantRoleFilter<any>(funnelsArray, 'tenant_id')

const filteredFunnels = computed(() => {
  if (!tenantId.value)
    return []
  const all = funnelsArray.value
  const defaults = all.filter((item: any) => item.is_default === true)
  if (isTenantScopedRole(currentRole.value)) {
    return all.filter((item: any) => item.is_default === true || item.tenant_id === tenantId.value)
  }
  const ids = new Set(defaults.map((i: any) => i.id))
  return [...defaults, ...funnelsByTenant.value.filter((i: any) => !ids.has(i.id))]
})

function handleEdit(funil: any) {
  if (!funil || typeof funil !== 'object')
    return
  if (funil.is_default)
    return
  formMode.value = 'edit'
  formModel.value = {
    name: funil.name ?? '',
    description: funil.description ?? '',
    is_default: Boolean(funil.is_default),
    id: funil.id ?? undefined,
  }
  showDialog.value = true
}

function handleCreate() {
  formMode.value = 'create'
  formModel.value = { name: '', description: '', is_default: false }
  showDialog.value = true
}

async function handleFormSubmit(_data: any) {
  nameError.value = ''
  const currentTenantId = tenantId.value || (typeof window !== 'undefined' ? localStorage.getItem('tenantId') : '')
  if (!currentTenantId) {
    console.warn('Select a tenant before creating a funil.')
    return
  }

  // Na página de edição, sempre é uma edição
  const isEdit = true
  const currentFunilId = funnelId.value

  if (!currentFunilId) {
    toast({ title: 'Erro', description: 'ID do funil não encontrado', variant: 'destructive' })
    return
  }

  const nameToCheck = (_data.name || '').trim().toLowerCase()
  const alreadyExists = filteredFunnels.value.some(funil =>
    funil.name?.trim().toLowerCase() === nameToCheck
    && funil.id !== currentFunilId,
  )
  if (alreadyExists) {
    nameError.value = 'Já existe um funil com este nome.'
    return
  }

  // Validar stages customizados - apenas stages com nome válido
  const validCustomStages = customStages.value
    .filter(stage => stage.name && stage.name.trim().length > 0)
    .map((stage, idx) => ({
      id: stage.id || undefined,
      name: stage.name.trim(),
      order: typeof stage.order === 'number' ? stage.order : idx + 1,
      description: stage.description || '',
      color: stage.color || '#cccccc',
      tenant_id: currentTenantId,
      funnel_id: currentFunilId,
      is_default: false,
    }))

  const url = `/api/crm/funnel/${currentFunilId}`
  const method = 'PUT'
  const payload: any = {
    name: _data.name?.trim() || '',
    description: _data.description?.trim(),
    is_default: false,
    is_active: _data.is_active ?? true,
    priority: _data.priority ?? 0,
    tenant_id: currentTenantId,
    customStages: validCustomStages,
    id: currentFunilId,
  }

  try {
    const response = await useFetch(url, { method, body: payload })
    await refreshFunnels()
    await fetchFunil()
    await fetchStages()
    toast({ title: 'Sucesso', description: 'Funil atualizado com sucesso!', variant: 'default' })
  }
  catch (err: any) {
    toast({ title: 'Erro', description: `Falha ao atualizar o funil: ${err?.message || 'Erro desconhecido'}`, variant: 'destructive' })
  }
}

async function handleDelete(funil: any) {
  if (!tenantId.value || !funil?.id)
    return

  const tenantUuid = typeof tenantId.value === 'object' && tenantId.value !== null
    ? (tenantId.value as { id: string }).id
    : tenantId.value

  const deleted = await deleteWithConfirm(
    () => $fetch(`/api/crm/funnel/${funil.id}?tenant_id=${tenantUuid}`, { method: 'DELETE' }),
    {
      title: 'Excluir funil?',
      description: `Tem certeza que deseja excluir "${funil.name}"? Esta ação não pode ser desfeita.`,
      successMessage: 'Funil excluído com sucesso.',
      errorMessage: 'Não foi possível excluir o funil.',
    },
  )

  if (deleted) {
    await refreshFunnels()
    await navigateTo('/crm/config/funnel')
  }
}

async function handleMultiDelete() {
  if (!tenantId.value || !selectedItems.value.length)
    return

  const tenantUuid = typeof tenantId.value === 'object' && tenantId.value !== null
    ? (tenantId.value as { id: string }).id
    : tenantId.value
  const toDelete = (selectedItems.value as any[]).filter(item => item && !item.is_default && item.id)
  const count = toDelete.length

  if (!count)
    return

  const deleted = await deleteWithConfirm(
    () => Promise.all(toDelete.map(item =>
      $fetch(`/api/crm/funnel/${item.id}?tenant_id=${tenantUuid}`, { method: 'DELETE' }),
    )),
    {
      title: 'Excluir vários funis?',
      description: `Tem certeza que deseja excluir ${count} funis? Esta ação não pode ser desfeita.`,
      successMessage: `${count} funil(is) excluído(s) com sucesso.`,
      errorMessage: 'Não foi possível excluir os funis.',
    },
  )

  if (deleted) {
    selectedItems.value = []
    await refreshFunnels()
  }
}

// Stages fixos
const fixedStages = [
  { id: 'new', name: 'Novo', probability: 100 },
  { id: 'won', name: 'Ganho', probability: 100 },
  { id: 'lost', name: 'Perdido', probability: 0 },
]

type LeadPriority = 'high' | 'medium' | 'low'
interface Lead {
  id: string
  name: string
  sales_stage_id: 'new' | 'won' | 'lost'
  value: number
  priority: LeadPriority
  company: string
  createdAt: Date
  assignedTo: string
  source: string
  tags: string[]
}
const leads = ref<Lead[]>([
  { id: '1', name: 'Lead 1', sales_stage_id: 'new', value: 1000, priority: 'high', company: 'Company A', createdAt: new Date(), assignedTo: 'User 1', source: 'website', tags: [] },
  { id: '2', name: 'Lead 2', sales_stage_id: 'won', value: 2000, priority: 'medium', company: 'Company B', createdAt: new Date(), assignedTo: 'User 2', source: 'email', tags: [] },
  { id: '3', name: 'Lead 3', sales_stage_id: 'lost', value: 500, priority: 'low', company: 'Company C', createdAt: new Date(), assignedTo: 'User 3', source: 'phone', tags: [] },
])

const leadsByStage = computed<Record<'new' | 'won' | 'lost', Lead[]>>(() => {
  const grouped: Record<'new' | 'won' | 'lost', Lead[]> = { new: [], won: [], lost: [] }
  for (const lead of leads.value) {
    if (grouped[lead.sales_stage_id])
      grouped[lead.sales_stage_id].push(lead)
  }
  return grouped
})

const stageStats = computed<Record<'new' | 'won' | 'lost', { count: number, value: number }>>(() => {
  const stats: Record<'new' | 'won' | 'lost', { count: number, value: number }> = { new: { count: 0, value: 0 }, won: { count: 0, value: 0 }, lost: { count: 0, value: 0 } }
  for (const stage of fixedStages) {
    const stageLeads = leadsByStage.value[stage.id as 'new' | 'won' | 'lost'] || []
    stats[stage.id as 'new' | 'won' | 'lost'] = {
      count: stageLeads.length,
      value: stageLeads.reduce((sum: number, lead: Lead) => sum + (lead.value || 0), 0),
    }
  }
  return stats
})

const stageProgress = computed<Record<'new' | 'won' | 'lost', number>>(() => {
  const progress: Record<'new' | 'won' | 'lost', number> = { new: 0, won: 0, lost: 0 }
  const totalLeads = leads.value.length
  for (const stage of fixedStages) {
    const stageCount = stageStats.value[stage.id as 'new' | 'won' | 'lost']?.count || 0
    progress[stage.id as 'new' | 'won' | 'lost'] = totalLeads > 0 ? (stageCount / totalLeads) * 100 : 0
  }
  return progress
})

function handleDragOver(event: DragEvent) { event.preventDefault() }
function handleDrop() {}
function handleDragStart() {}
function getPriorityColor() { return '' }
function formatCurrency(val) { return `R$ ${val}` }

// Funções para editar/remover/adicionar stages customizados
const defaultStages = computed(() => Array.isArray(stages.value) ? stages.value.filter(s => s.is_default) : [])
const customStages = ref<any[]>([])

function addStage() {
  const newStage = {
    name: '',
    color: randomColor(),
    description: '',
    funnel_id: funnelId.value,
    tenant_id: tenantId.value,
    order: customStages.value.length + 2, // +2 porque New é 1
    is_default: false,
  }
  customStages.value.push(newStage)
}
function removeStage(idx: number) {
  customStages.value.splice(idx, 1)
}
function randomColor() {
  const h = Math.floor(Math.random() * 360)
  const s = 60 + Math.floor(Math.random() * 30)
  const l = 40 + Math.floor(Math.random() * 30)
  return hslToHex(h, s, l)
}
function hslToHex(h: number, s: number, l: number) {
  s /= 100; l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const color = l - a * Math.max(Math.min(k(n) - 3, 9 - k(n), 1), -1)
    return Math.round(255 * color)
  }
  return `#${[f(0), f(8), f(4)].map(x => x.toString(16).padStart(2, '0')).join('')}`
}

whenTenantReady(async () => {
  await refreshFunnels()
  await fetchFunil()
  await fetchStages()
})

watch(tenantId, (val) => {
  if (val)
    refreshFunnels()
  showDialog.value = false
  formModel.value = { name: '', description: '', is_default: false }
})

watch(funnelId, async () => {
  await fetchFunil()
  await fetchStages()
})
</script>

<template>
  <div class="w-full flex flex-col items-stretch gap-4">
    <CrmPageHeader
      title="Editar funil"
      description="Ajuste nome, prioridade e etapas do funil."
    >
      <template #actions>
        <NuxtLink to="/crm/config/funnel">
          <Button variant="outline">
            <Icon name="lucide:arrow-left" class="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </NuxtLink>
      </template>
    </CrmPageHeader>

    <!-- Dialog de criar/editar -->
    <Dialog :open="showDialog" @update:open="showDialog = $event">
      <DialogContent class="max-w-lg w-full">
        <DialogHeader>
          <DialogTitle>{{ formMode === 'edit' ? 'Editar Funil' : 'Novo Funil' }}</DialogTitle>
        </DialogHeader>
        <FunnelForm
          v-model="formModel"
          :mode="formMode"
          :loading="false"
          :name-error="nameError"
          @submit="handleFormSubmit"
        />
        <DialogFooter>
          <Button variant="outline" @click="showDialog = false">
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Card class="p-6">
      <form class="flex flex-col gap-4" @submit.prevent="handleFormSubmit(formModel)">
        <div class="flex items-center gap-4">
          <div class="w-64 flex flex-col gap-1">
            <label for="funil-name">Nome *</label>
            <Input id="funil-name" v-model="formModel.name" placeholder="Nome" required />
          </div>
          <div class="w-96 flex flex-col gap-1">
            <label for="funil-description">Descrição</label>
            <Input id="funil-description" v-model="formModel.description" placeholder="Descrição (opcional)" />
          </div>
          <Button type="submit" class="ml-auto">
            Salvar Funil
          </Button>
        </div>
        <CardContent class="mt-6 flex gap-4 overflow-x-auto pb-2">
          <!-- Stages padrão (Novo) -->
          <template v-for="stage in defaultStages.filter(s => ['New', 'Novo'].includes(s.name))" :key="stage.id">
            <div class="min-w-[260px] flex flex-1 flex-col gap-3 border rounded-lg bg-card p-6">
              <h3 class="mb-2 text-base font-semibold">
                {{ stage.name === 'New' ? 'Novo' : stage.name }} (padrão)
              </h3>
              <div class="flex flex-col gap-2">
                <label>Nome *</label>
                <Input :value="stage.name === 'New' ? 'Novo' : stage.name" disabled />
              </div>
              <div class="flex flex-col gap-2">
                <label>Cor</label>
                <div class="h-8 w-8 border rounded" :style="{ backgroundColor: stage.color }" />
              </div>
            </div>
          </template>

          <!-- Stages customizados -->
          <template v-for="(stage, idx) in customStages" :key="stage.id || `custom-${idx}`">
            <div class="min-w-[260px] flex flex-1 flex-col gap-3 border rounded-lg bg-card p-6">
              <h3 class="mb-2 text-base font-semibold">
                Estágio personalizado
              </h3>
              <div class="flex flex-col gap-2">
                <label>Nome *</label>
                <Input v-model="stage.name" placeholder="Nome do estágio" required />
              </div>
              <div class="flex flex-col gap-2">
                <label>Cor</label>
                <div class="flex items-center gap-2">
                  <ColorPicker v-model="stage.color" />
                  <span class="font-mono text-xs uppercase text-muted-foreground">{{ stage.color }}</span>
                </div>
              </div>
              <div class="flex flex-col gap-2">
                <label>Descrição</label>
                <Input v-model="stage.description" placeholder="Descrição do estágio (opcional)" />
              </div>
              <Button type="button" variant="destructive" class="mt-2 w-fit self-end" @click="removeStage(idx)">
                Remover
              </Button>
            </div>
          </template>

          <!-- Stages padrão (Ganho, Perdido) -->
          <template v-for="stage in defaultStages.filter(s => ['Won', 'Lost', 'Ganho', 'Perdido'].includes(s.name))" :key="stage.id">
            <div class="min-w-[260px] flex flex-1 flex-col gap-3 border rounded-lg bg-card p-6">
              <h3 class="mb-2 text-base font-semibold">
                {{ stage.name === 'Won' ? 'Ganho' : stage.name === 'Lost' ? 'Perdido' : stage.name }} (padrão)
              </h3>
              <div class="flex flex-col gap-2">
                <label>Nome *</label>
                <Input :value="stage.name === 'Won' ? 'Ganho' : stage.name === 'Lost' ? 'Perdido' : stage.name" disabled />
              </div>
              <div class="flex flex-col gap-2">
                <label>Cor</label>
                <div class="h-8 w-8 border rounded" :style="{ backgroundColor: stage.color }" />
              </div>
            </div>
          </template>

          <!-- Botão para adicionar novo stage -->
          <div class="min-w-[260px] flex flex-1 flex-col items-center justify-center border rounded-lg bg-card p-6 text-center">
            <h3 class="mb-2 text-base font-semibold">
              Adicionar novo estágio
            </h3>
            <p class="mb-3 text-sm text-muted-foreground">
              Adicione um novo estágio ao seu funil
            </p>
            <Button type="button" variant="outline" @click="addStage">
              Adicionar estágio
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  </div>
</template>
