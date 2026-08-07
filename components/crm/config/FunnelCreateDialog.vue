<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { Icon } from '#components'
import ColorPicker from '~/components/crm/config/ColorPicker.vue'
import Button from '~/components/ui/button/Button.vue'
import Checkbox from '~/components/ui/checkbox/Checkbox.vue'
import Dialog from '~/components/ui/dialog/Dialog.vue'
import DialogDescription from '~/components/ui/dialog/DialogDescription.vue'
import DialogFooter from '~/components/ui/dialog/DialogFooter.vue'
import DialogHeader from '~/components/ui/dialog/DialogHeader.vue'
import DialogScrollContent from '~/components/ui/dialog/DialogScrollContent.vue'
import DialogTitle from '~/components/ui/dialog/DialogTitle.vue'
import Input from '~/components/ui/input/Input.vue'
import Label from '~/components/ui/label/Label.vue'
import Textarea from '~/components/ui/textarea/Textarea.vue'

const Draggable = defineAsyncComponent(() => import('vuedraggable'))

export interface FunnelCustomStageDraft {
  id?: string
  name: string
  color: string
  description: string
  order?: number
}

export interface FunnelCreatedPayload {
  funnel: {
    id: string
    name: string
    description?: string | null
    is_active?: boolean
    priority?: number
  }
  stages: Array<{
    id: string
    name: string
    color?: string
    order?: number
    description?: string
    is_default?: boolean
  }>
}

export type FunnelUpdatedPayload = FunnelCreatedPayload

interface StageDraft {
  id?: string
  key?: string
  /** Stable client key for drag-and-drop list identity */
  localKey: string
  name: string
  color: string
  description: string
  isDefault: boolean
}

function createLocalKey() {
  return `stage-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

const props = withDefaults(defineProps<{
  open: boolean
  tenantId: string | null | undefined
  mode?: 'create' | 'edit'
  funnelId?: string | null
}>(), {
  mode: 'create',
  funnelId: null,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  'created': [payload: FunnelCreatedPayload]
  'updated': [payload: FunnelUpdatedPayload]
}>()

const isOpen = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

const isEditMode = computed(() => props.mode === 'edit')

const loading = ref(false)
const loadingData = ref(false)
const errorMessage = ref('')
const form = ref({
  name: '',
  description: '',
  is_active: true,
  priority: 0,
})

const defaultStageFallbacks: Array<Omit<StageDraft, 'localKey'>> = [
  { key: 'new', name: 'Novo', color: '#3b82f6', description: 'Estágio inicial', isDefault: true },
  { key: 'won', name: 'Ganho', color: '#22c55e', description: 'Negócio fechado', isDefault: true },
  { key: 'lost', name: 'Perdido', color: '#ef4444', description: 'Negócio perdido', isDefault: true },
]

const stages = ref<StageDraft[]>([])

function randomColor() {
  const palette = ['#8b5cf6', '#ec4899', '#f97316', '#eab308', '#14b8a6', '#64748b']
  return palette[Math.floor(Math.random() * palette.length)]
}

function isDefaultStageName(name: string) {
  const normalized = name.trim().toLowerCase()
  return ['new', 'novo', 'won', 'ganho', 'lost', 'perdido'].includes(normalized)
}

function mapDefaultKey(name: string) {
  const normalized = name.trim().toLowerCase()
  if (normalized === 'new' || normalized === 'novo')
    return 'new'
  if (normalized === 'won' || normalized === 'ganho')
    return 'won'
  return 'lost'
}

function buildDefaultCreateStages(): StageDraft[] {
  const [novo, won, lost] = defaultStageFallbacks
  return [
    { ...novo, localKey: createLocalKey() },
    { ...won, localKey: createLocalKey() },
    { ...lost, localKey: createLocalKey() },
  ]
}

function resetForm() {
  form.value = { name: '', description: '', is_active: true, priority: 0 }
  stages.value = buildDefaultCreateStages()
  errorMessage.value = ''
  loading.value = false
  loadingData.value = false
}

function addStage() {
  // Insert custom stages before Won/Lost defaults when present.
  const lostIdx = stages.value.findIndex(stage => stage.key === 'lost' || mapDefaultKey(stage.name) === 'lost')
  const wonIdx = stages.value.findIndex(stage => stage.key === 'won' || mapDefaultKey(stage.name) === 'won')
  const insertAt = lostIdx >= 0
    ? lostIdx
    : wonIdx >= 0
      ? wonIdx
      : stages.value.length
  stages.value.splice(insertAt, 0, {
    localKey: createLocalKey(),
    name: '',
    color: randomColor(),
    description: '',
    isDefault: false,
  })
}

function removeStage(index: number) {
  const stage = stages.value[index]
  if (!stage || stage.isDefault)
    return
  stages.value.splice(index, 1)
}

function moveStage(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= stages.value.length)
    return
  const list = [...stages.value]
  const [item] = list.splice(index, 1)
  list.splice(target, 0, item)
  stages.value = list
}

async function loadFunnelForEdit() {
  if (!props.funnelId || !props.tenantId) {
    errorMessage.value = 'Funil não encontrado para edição.'
    return
  }

  loadingData.value = true
  errorMessage.value = ''
  try {
    const [funnel, stageList] = await Promise.all([
      $fetch<{
        id: string
        name: string
        description?: string | null
        is_active?: boolean
        priority?: number
      }>(`/api/crm/funnel/${props.funnelId}`, {
        query: { tenant_id: props.tenantId },
      }),
      $fetch<Array<{
        id: string
        name: string
        color?: string
        description?: string
        order?: number
        is_default?: boolean
      }>>('/api/crm/sales_stage', {
        query: {
          funnel_id: props.funnelId,
          tenant_id: props.tenantId,
        },
      }),
    ])

    if (!funnel?.id)
      throw new Error('Funil não encontrado.')

    form.value = {
      name: funnel.name || '',
      description: funnel.description || '',
      is_active: funnel.is_active ?? true,
      priority: Number(funnel.priority) || 0,
    }

    const sorted = (Array.isArray(stageList) ? stageList : [])
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0))

    stages.value = sorted.map((stage) => {
      const isDefault = Boolean(stage.is_default || isDefaultStageName(stage.name || ''))
      return {
        id: stage.id,
        localKey: stage.id || createLocalKey(),
        key: isDefault ? mapDefaultKey(stage.name || '') : undefined,
        name: stage.name || '',
        color: stage.color || randomColor(),
        description: stage.description || '',
        isDefault,
      }
    })

    // Ensure missing default templates still appear if data is incomplete
    if (stages.value.length === 0)
      stages.value = buildDefaultCreateStages()
  }
  catch (error: any) {
    errorMessage.value = error?.data?.message || error?.message || 'Não foi possível carregar o funil.'
  }
  finally {
    loadingData.value = false
  }
}

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      resetForm()
      return
    }

    resetForm()
    if (isEditMode.value)
      await loadFunnelForEdit()
  },
)

function buildStagesPayload() {
  return stages.value
    .filter(stage => stage.isDefault || stage.name.trim())
    .map((stage, idx) => ({
      id: stage.id || undefined,
      name: stage.isDefault
        ? (defaultStageFallbacks.find(item => item.key === stage.key)?.name || stage.name.trim())
        : stage.name.trim(),
      color: stage.color || randomColor(),
      description: stage.description?.trim() || '',
      order: idx + 1,
      is_default: stage.isDefault,
    }))
}

async function handleSubmit() {
  errorMessage.value = ''
  const name = form.value.name.trim()
  if (!name) {
    errorMessage.value = 'Informe o nome do funil.'
    return
  }
  if (!props.tenantId) {
    errorMessage.value = isEditMode.value
      ? 'Selecione um tenant antes de editar o funil.'
      : 'Selecione um tenant antes de criar o funil.'
    return
  }
  if (isEditMode.value && !props.funnelId) {
    errorMessage.value = 'ID do funil não encontrado.'
    return
  }

  const stagesPayload = buildStagesPayload()
  if (stagesPayload.length === 0) {
    errorMessage.value = 'Adicione ao menos uma etapa ao funil.'
    return
  }

  loading.value = true
  try {
    if (isEditMode.value && props.funnelId) {
      const response = await $fetch<{
        statusCode: number
        body: FunnelUpdatedPayload
      }>(`/api/crm/funnel/${props.funnelId}`, {
        method: 'PUT',
        body: {
          id: props.funnelId,
          name,
          description: form.value.description.trim(),
          is_active: form.value.is_active,
          priority: Number(form.value.priority) || 0,
          tenant_id: props.tenantId,
          stages: stagesPayload,
          // Keep customStages for backward compatibility with older clients
          customStages: stagesPayload.filter(stage => !stage.is_default),
        },
      })

      const payload = response?.body
      if (!payload?.funnel?.id)
        throw new Error('Resposta inválida ao atualizar funil.')

      emit('updated', payload)
      isOpen.value = false
      return
    }

    const response = await $fetch<{
      statusCode: number
      body: FunnelCreatedPayload
    }>('/api/crm/funnel', {
      method: 'POST',
      body: {
        name,
        description: form.value.description.trim(),
        is_active: form.value.is_active,
        priority: Number(form.value.priority) || 0,
        tenant_id: props.tenantId,
        stages: stagesPayload.map(({ name: stageName, color, description, order, is_default }) => ({
          name: stageName,
          color,
          description,
          order,
          is_default,
        })),
      },
    })

    const payload = response?.body
    if (!payload?.funnel?.id)
      throw new Error('Resposta inválida ao criar funil.')

    emit('created', payload)
    isOpen.value = false
  }
  catch (error: any) {
    errorMessage.value = error?.data?.message
      || error?.message
      || (isEditMode.value ? 'Não foi possível atualizar o funil.' : 'Não foi possível criar o funil.')
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogScrollContent class="max-h-[90vh] max-w-2xl">
      <DialogHeader>
        <DialogTitle>
          {{ isEditMode ? 'Editar funil' : 'Novo funil' }}
        </DialogTitle>
        <DialogDescription>
          {{ isEditMode
            ? 'Atualize nome, cores e a ordem das etapas (arraste ou use as setas).'
            : 'Crie o funil, ajuste as etapas padrão e adicione etapas personalizadas se precisar.'
          }}
        </DialogDescription>
      </DialogHeader>

      <div v-if="loadingData" class="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Icon name="lucide:loader-2" class="h-4 w-4 animate-spin" />
        Carregando funil...
      </div>

      <form
        v-else
        class="space-y-6 py-2"
        @submit.prevent="handleSubmit"
      >
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-2 sm:col-span-2">
            <Label :for="isEditMode ? 'funnel-edit-name' : 'funnel-create-name'">Nome *</Label>
            <Input
              :id="isEditMode ? 'funnel-edit-name' : 'funnel-create-name'"
              v-model="form.name"
              placeholder="Ex.: Funil comercial"
              required
              :disabled="loading"
            />
          </div>
          <div class="space-y-2 sm:col-span-2">
            <Label :for="isEditMode ? 'funnel-edit-description' : 'funnel-create-description'">Descrição</Label>
            <Textarea
              :id="isEditMode ? 'funnel-edit-description' : 'funnel-create-description'"
              v-model="form.description"
              placeholder="Descrição opcional"
              :disabled="loading"
              class="min-h-20"
            />
          </div>
          <div class="space-y-2">
            <Label :for="isEditMode ? 'funnel-edit-priority' : 'funnel-create-priority'">Prioridade</Label>
            <Input
              :id="isEditMode ? 'funnel-edit-priority' : 'funnel-create-priority'"
              v-model.number="form.priority"
              type="number"
              :disabled="loading"
            />
          </div>
          <div class="flex items-end gap-2 pb-2">
            <Checkbox
              :id="isEditMode ? 'funnel-edit-active' : 'funnel-create-active'"
              :checked="form.is_active"
              :disabled="loading"
              @update:checked="(checked: boolean) => (form.is_active = checked)"
            />
            <Label :for="isEditMode ? 'funnel-edit-active' : 'funnel-create-active'">Funil ativo</Label>
          </div>
        </div>

        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2">
            <div>
              <h3 class="text-sm font-semibold">
                Etapas do funil
              </h3>
              <p class="text-xs text-muted-foreground">
                Arraste pelo ícone ou use as setas. A ordem salva é a que aparece no kanban.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" :disabled="loading" @click="addStage">
              <Icon name="lucide:plus" class="mr-1.5 h-4 w-4" />
              Etapa
            </Button>
          </div>

          <Draggable
            v-model="stages"
            item-key="localKey"
            handle=".stage-drag-handle"
            :disabled="loading"
            class="space-y-2"
          >
            <template #item="{ element: stage, index }">
              <div
                class="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start"
                :class="stage.isDefault ? 'bg-muted/30' : ''"
              >
                <button
                  type="button"
                  class="stage-drag-handle mt-1 shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
                  :disabled="loading"
                  aria-label="Arrastar para reordenar etapa"
                >
                  <Icon name="lucide:grip-vertical" class="h-4 w-4" />
                </button>
                <ColorPicker v-model="stage.color" :disabled="loading" />
                <div class="grid flex-1 gap-2 sm:grid-cols-2">
                  <Input
                    v-model="stage.name"
                    placeholder="Nome da etapa"
                    :disabled="loading || stage.isDefault"
                    required
                  />
                  <Input
                    v-model="stage.description"
                    placeholder="Descrição (opcional)"
                    :disabled="loading"
                  />
                </div>
                <div class="flex shrink-0 items-center gap-1">
                  <span
                    v-if="stage.isDefault"
                    class="mr-1 hidden text-[10px] uppercase tracking-wide text-muted-foreground sm:inline"
                  >
                    padrão
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    class="text-muted-foreground"
                    :disabled="loading || index === 0"
                    aria-label="Mover etapa para cima"
                    @click="moveStage(index, -1)"
                  >
                    <Icon name="lucide:chevron-up" class="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    class="text-muted-foreground"
                    :disabled="loading || index === stages.length - 1"
                    aria-label="Mover etapa para baixo"
                    @click="moveStage(index, 1)"
                  >
                    <Icon name="lucide:chevron-down" class="h-4 w-4" />
                  </Button>
                  <Button
                    v-if="!stage.isDefault"
                    type="button"
                    variant="ghost"
                    size="icon"
                    class="text-muted-foreground hover:text-destructive"
                    :disabled="loading"
                    aria-label="Remover etapa"
                    @click="removeStage(index)"
                  >
                    <Icon name="lucide:trash-2" class="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </template>
          </Draggable>
        </div>

        <p v-if="errorMessage" class="text-sm text-destructive">
          {{ errorMessage }}
        </p>

        <DialogFooter>
          <Button type="button" variant="outline" :disabled="loading" @click="isOpen = false">
            Cancelar
          </Button>
          <Button type="submit" :disabled="loading || !form.name.trim()">
            <Icon v-if="loading" name="lucide:loader-2" class="mr-2 h-4 w-4 animate-spin" />
            <Icon
              v-else
              :name="isEditMode ? 'lucide:save' : 'lucide:plus'"
              class="mr-2 h-4 w-4"
            />
            {{ isEditMode ? 'Salvar alterações' : 'Criar funil' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogScrollContent>
  </Dialog>
</template>
