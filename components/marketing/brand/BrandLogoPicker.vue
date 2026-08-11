<script setup lang="ts">
import type { BrandGuideLogoAsset } from '~/types/brand-guide'
import BrandAssetPicker from '~/components/marketing/brand/BrandAssetPicker.vue'

const props = defineProps<{
  logoAssetIds: string[]
  logoAssets: BrandGuideLogoAsset[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  change: [value: { logoAssetIds: string[], logoAssets: BrandGuideLogoAsset[] }]
  uploaded: [value: { logoAssetIds: string[], logoAssets: BrandGuideLogoAsset[] }]
}>()

function mapSelection(selection: { assetIds: string[], assets: BrandGuideLogoAsset[] }) {
  return {
    logoAssetIds: selection.assetIds,
    logoAssets: selection.assets,
  }
}
</script>

<template>
  <BrandAssetPicker
    :asset-ids="props.logoAssetIds"
    :assets="props.logoAssets"
    :disabled="props.disabled"
    label="Logos"
    hint="Envie o logo principal (e versões adicionais) ou selecione arquivos já existentes na biblioteca."
    dialog-title="Selecionar logos da biblioteca"
    dialog-description="Escolha até 8 arquivos. Prefira a categoria “Logos” na biblioteca."
    empty-label="Nenhum logo vinculado. Envie uma imagem ou escolha na biblioteca."
    :max="8"
    category="logo"
    allow-upload
    upload-label="Enviar logo"
    @change="emit('change', mapSelection($event))"
    @uploaded="emit('uploaded', mapSelection($event))"
  />
</template>
