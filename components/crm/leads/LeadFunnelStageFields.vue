<script setup lang="ts">
import type { SalesStage } from '~/types/crm'
import { computed, ref, watch } from 'vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import Label from '~/components/ui/label/Label.vue'
import { firstStageIdForFunnel, stagesForFunnel } from '~/utils/crm/sales-stage'
import { useTenant } from '~/composables/useTenant'

const props = withDefaults(
  defineProps<{
    funnelId?: string | null
    salesStageId?: string | null
    /** When true, changing funnel auto-selects the first stage of the new funnel. */
    autoSelectFirstStage?: boolean
    required?: boolean
    disabled?: boolean
    idPrefix?: string
  }>(),
  {
    funnelId: null,
    salesStageId: null,
    autoSelectFirstStage: true,
    required: false,
    disabled: false,
    idPrefix: 'lead',
  },
)

const emit = defineEmits<{
  'update:funnelId': [value: string | null]
  'update:salesStageId': [value: string | null]
}>()

const { tenantId } = useTenant()

const { data: funnels, pending: funnelsPending } = await useLazyFetch<Array<{ id: string, name: string }>>('/api/crm/funnel', {
  query: computed(() => ({ tenant_id: tenantId.value })),
  watch: [tenantId],
  default: () => [],
  server: false,
})

const { data: allStages, pending: stagesPending } = await useLazyFetch<SalesStage[]>('/api/crm/sales_stage', {
  query: computed(() => ({
    tenant_id: tenantId.value,
    active_only: 'true',
  })),
  watch: [tenantId],
  default: () => [],
  server: false,
})

const isLoading = computed(() => funnelsPending.value || stagesPending.value)

const stagesOfFunnel = computed(() =>
  stagesForFunnel(allStages.value || [], localFunnelId.value),
)

const localFunnelId = ref<string | null>(props.funnelId ?? null)
const localStageId = ref<string | null>(props.salesStageId ?? null)
const syncingFromProps = ref(false)

watch(
  () => [props.funnelId, props.salesStageId] as const,
  ([funnelId, salesStageId]) => {
    syncingFromProps.value = true
    localFunnelId.value = funnelId ?? null

    if (salesStageId) {
      localStageId.value = salesStageId
      syncingFromProps.value = false
      return
    }

    if (props.autoSelectFirstStage && funnelId) {
      const first = firstStageIdForFunnel(allStages.value || [], funnelId)
      localStageId.value = first
      syncingFromProps.value = false
      if (first)
        emit('update:salesStageId', first)
      return
    }

    localStageId.value = null
    syncingFromProps.value = false
  },
)

watch(allStages, (stages) => {
  if (!localFunnelId.value || localStageId.value || !props.autoSelectFirstStage)
    return
  const first = firstStageIdForFunnel(stages || [], localFunnelId.value)
  if (!first)
    return
  localStageId.value = first
  emit('update:salesStageId', first)
})

watch(localFunnelId, (funnelId) => {
  if (syncingFromProps.value)
    return

  emit('update:funnelId', funnelId)

  const validStages = stagesForFunnel(allStages.value || [], funnelId)
  const currentStillValid = validStages.some(stage => stage.id === localStageId.value)

  if (!currentStillValid) {
    const nextStageId = props.autoSelectFirstStage
      ? firstStageIdForFunnel(allStages.value || [], funnelId)
      : null
    localStageId.value = nextStageId
    emit('update:salesStageId', nextStageId)
  }
})

watch(localStageId, (stageId) => {
  if (syncingFromProps.value)
    return
  emit('update:salesStageId', stageId)
})

const funnelSelectId = computed(() => `${props.idPrefix}-funnel`)
const stageSelectId = computed(() => `${props.idPrefix}-stage`)
</script>

<template>
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2 md:col-span-2">
    <div class="space-y-2">
      <Label :for="funnelSelectId">
        Funil
        <span v-if="required" class="text-destructive">*</span>
      </Label>
      <Select
        :model-value="localFunnelId || undefined"
        :disabled="disabled || isLoading"
        @update:model-value="(value: string) => { localFunnelId = value || null }"
      >
        <SelectTrigger :id="funnelSelectId" class="w-full">
          <SelectValue placeholder="Selecione o funil" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="funnel in funnels"
            :key="funnel.id"
            :value="funnel.id"
          >
            {{ funnel.name }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div class="space-y-2">
      <Label :for="stageSelectId">
        Estágio de vendas
        <span v-if="required" class="text-destructive">*</span>
      </Label>
      <Select
        :model-value="localStageId || undefined"
        :disabled="disabled || isLoading || !localFunnelId || stagesOfFunnel.length === 0"
        @update:model-value="(value: string) => { localStageId = value || null }"
      >
        <SelectTrigger :id="stageSelectId" class="w-full">
          <SelectValue :placeholder="localFunnelId ? 'Selecione o estágio' : 'Selecione o funil primeiro'" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="stage in stagesOfFunnel"
            :key="stage.id"
            :value="stage.id"
          >
            {{ stage.name }}
          </SelectItem>
        </SelectContent>
      </Select>
      <p
        v-if="localFunnelId && !isLoading && stagesOfFunnel.length === 0"
        class="text-xs text-muted-foreground"
      >
        Este funil não possui estágios cadastrados.
      </p>
    </div>
  </div>
</template>
