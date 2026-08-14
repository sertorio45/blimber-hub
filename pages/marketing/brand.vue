<script setup lang="ts">
import { toast } from 'vue-sonner'
import BrandCenterPanel from '~/components/marketing/brand/BrandCenterPanel.vue'
import { MARKETING_ADS_CREATIVES_ROUTE } from '~/constants/ads-domain'

definePageMeta({
  middleware: ['auth'],
  title: 'Marca',
})

const { currentTenant } = useTenant()
const tenantLabel = computed(() => currentTenant.value?.name?.trim() || null)
const brandTrail = [
  { title: 'Marketing', href: '/marketing' },
  { title: 'Marca', href: '/marketing/brand' },
]

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
  <div class="space-y-4">
    <div class="space-y-1">
      <BaseBreadcrumbCustom :links="brandTrail" />
      <p class="text-xs text-muted-foreground">
        <template v-if="tenantLabel">
          Cliente ativo: {{ tenantLabel }}
        </template>
        <template v-else>
          Selecione um cliente no workspace para editar a marca.
        </template>
      </p>
    </div>

    <div
      v-if="!tenantId"
      class="border rounded-lg border-dashed p-8 text-center text-sm text-muted-foreground"
    >
      Selecione um cliente no workspace para editar a marca.
    </div>

    <MarketingPageSkeleton
      v-else-if="showSkeleton"
      variant="detail"
    />

    <template v-else>
      <div class="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          @click="navigateTo(MARKETING_ADS_CREATIVES_ROUTE)"
        >
          Criativos de Ads
          <Icon name="lucide:arrow-right" class="ml-2 h-4 w-4" />
        </Button>
      </div>
      <BrandCenterPanel
        v-model="draft"
        :completeness="completeness"
        :can-manage="canManage"
        :saving="saving"
        @save="handleSave"
      />
    </template>
  </div>
</template>
