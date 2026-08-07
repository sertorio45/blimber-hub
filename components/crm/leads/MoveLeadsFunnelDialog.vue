<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import Button from '~/components/ui/button/Button.vue'
import Dialog from '~/components/ui/dialog/Dialog.vue'
import DialogContent from '~/components/ui/dialog/DialogContent.vue'
import DialogDescription from '~/components/ui/dialog/DialogDescription.vue'
import DialogFooter from '~/components/ui/dialog/DialogFooter.vue'
import DialogHeader from '~/components/ui/dialog/DialogHeader.vue'
import DialogTitle from '~/components/ui/dialog/DialogTitle.vue'
import LeadFunnelStageFields from '~/components/crm/leads/LeadFunnelStageFields.vue'
import { useTenant } from '~/composables/useTenant'

const props = withDefaults(
  defineProps<{
    open: boolean
    leadIds: string[]
    defaultFunnelId?: string | null
  }>(),
  {
    leadIds: () => [],
    defaultFunnelId: null,
  },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  'moved': [payload: { funnelId: string, salesStageId: string, moved: number }]
}>()

const { tenantId } = useTenant()
const isSubmitting = ref(false)
const targetFunnelId = ref<string | null>(null)
const targetStageId = ref<string | null>(null)

const isOpen = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
})

const countLabel = computed(() => {
  const count = props.leadIds.length
  return count === 1 ? '1 lead' : `${count} leads`
})

watch(
  () => props.open,
  (open) => {
    if (!open)
      return
    targetFunnelId.value = props.defaultFunnelId ?? null
    targetStageId.value = null
  },
)

async function confirmMove() {
  if (!tenantId.value) {
    toast.error('Tenant não identificado.')
    return
  }
  if (!props.leadIds.length) {
    toast.error('Selecione ao menos um lead.')
    return
  }
  if (!targetFunnelId.value || !targetStageId.value) {
    toast.error('Selecione o funil e o estágio de destino.')
    return
  }

  isSubmitting.value = true
  try {
    const result = await $fetch<{ moved: number, funnel_id: string, sales_stage_id: string }>(
      '/api/crm/leads/move-funnel',
      {
        method: 'POST',
        body: {
          tenant_id: tenantId.value,
          lead_ids: props.leadIds,
          funnel_id: targetFunnelId.value,
          sales_stage_id: targetStageId.value,
        },
      },
    )

    const moved = result.moved ?? props.leadIds.length
    toast.success(
      moved === 1
        ? '1 lead movido com sucesso.'
        : `${moved} leads movidos com sucesso.`,
    )

    emit('moved', {
      funnelId: result.funnel_id || targetFunnelId.value,
      salesStageId: result.sales_stage_id || targetStageId.value,
      moved,
    })
    isOpen.value = false
  }
  catch (error: any) {
    const message
      = error?.data?.statusMessage
      || error?.statusMessage
      || error?.message
      || 'Não foi possível mover os leads.'
    toast.error(message)
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle>Mover para funil</DialogTitle>
        <DialogDescription>
          Mova {{ countLabel }} para outro funil e estágio.
        </DialogDescription>
      </DialogHeader>

      <div class="py-2">
        <LeadFunnelStageFields
          v-model:funnel-id="targetFunnelId"
          v-model:sales-stage-id="targetStageId"
          required
          id-prefix="move-leads"
        />
      </div>

      <DialogFooter>
        <Button variant="outline" :disabled="isSubmitting" @click="isOpen = false">
          Cancelar
        </Button>
        <Button
          :loading="isSubmitting"
          :disabled="isSubmitting || !targetFunnelId || !targetStageId || leadIds.length === 0"
          @click="confirmMove"
        >
          Confirmar movimentação
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
