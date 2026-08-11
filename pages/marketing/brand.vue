<script setup lang="ts">
import { toast } from 'vue-sonner'
import BrandCenterPanel from '~/components/marketing/brand/BrandCenterPanel.vue'

definePageMeta({
  middleware: ['auth'],
  title: 'Marca',
})

const {
  draft,
  showSkeleton,
  saving,
  canManage,
  completeness,
  save,
  tenantId,
} = useBrandGuide()

async function handleSave() {
  try {
    await save()
    toast.success('Marca salva')
  }
  catch (error: unknown) {
    const err = error as { data?: { statusMessage?: string }, message?: string }
    toast.error(err?.data?.statusMessage || err?.message || 'Falha ao salvar')
  }
}
</script>

<template>
  <div>
    <div
      v-if="!tenantId"
      class="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"
    >
      Selecione um cliente no workspace para editar a marca.
    </div>

    <MarketingPageSkeleton
      v-else-if="showSkeleton"
      variant="detail"
    />

    <BrandCenterPanel
      v-else
      v-model="draft"
      :completeness="completeness"
      :can-manage="canManage"
      :saving="saving"
      @save="handleSave"
    />
  </div>
</template>
