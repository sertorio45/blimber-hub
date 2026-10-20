<script setup lang="ts">
import type { CmsMediaAsset } from '~/composables/cms/useCmsMedia'
import type { CmsMediaRef } from '~/lib/cms/contracts'

import { computed, ref } from 'vue'

import CmsMediaLibraryDialog from '~/components/cms/CmsMediaLibraryDialog.vue'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { useCmsAccess } from '~/composables/cms/useCmsAccess'
import { useCmsMedia } from '~/composables/cms/useCmsMedia'
import { mediaAssetPreviewUrl } from '~/utils/media-asset'

const props = withDefaults(defineProps<{
  modelValue: CmsMediaRef | null
  disabled?: boolean
  error?: string | null
}>(), {
  disabled: false,
  error: null,
})

const emit = defineEmits<{
  'update:modelValue': [value: CmsMediaRef | null]
}>()

const access = useCmsAccess()
const media = useCmsMedia()
const open = ref(false)
const altId = useId()

const selectedPreview = computed(() => {
  const current = props.modelValue
  if (!current)
    return null
  const asset = media.assets.value.find(item => item.id === current.assetId)
  if (!asset)
    return null
  return mediaAssetPreviewUrl({
    mimeType: typeof asset.mime_type === 'string' ? asset.mime_type : '',
    previewUrl: asset.previewUrl,
    preview_url: asset.preview_url,
  })
})

function selectAsset(asset: CmsMediaAsset) {
  const rawPath = asset.object_path
  const objectPath = typeof rawPath === 'string' ? rawPath.trim() : ''
  emit('update:modelValue', {
    assetId: asset.id,
    ...(objectPath ? { objectPath } : {}),
    ...(props.modelValue?.alt ? { alt: props.modelValue.alt } : {}),
    ...(props.modelValue?.credit ? { credit: props.modelValue.credit } : {}),
  })
  open.value = false
}

function updateAlt(value: string | number) {
  if (!props.modelValue)
    return
  const alt = String(value).trim()
  emit('update:modelValue', {
    ...props.modelValue,
    ...(alt ? { alt } : { alt: undefined }),
  })
}

function clearCover() {
  emit('update:modelValue', null)
}
</script>

<template>
  <div class="space-y-3">
    <Label>Capa</Label>

    <div v-if="modelValue" class="space-y-3">
      <div class="relative overflow-hidden border rounded-xl bg-muted/40">
        <img
          v-if="selectedPreview"
          :src="selectedPreview"
          :alt="modelValue.alt || 'Capa da publicação'"
          class="aspect-[16/9] w-full object-cover"
        >
        <div v-else class="aspect-[16/9] flex items-center justify-center text-muted-foreground">
          <Icon name="lucide:image" class="size-8" aria-hidden="true" />
        </div>
      </div>
      <div class="space-y-2">
        <Label :for="altId" class="text-xs text-muted-foreground font-normal">Texto alternativo</Label>
        <Input
          :id="altId"
          :model-value="modelValue.alt ?? ''"
          maxlength="300"
          placeholder="Descreva a imagem"
          :disabled="disabled"
          @update:model-value="updateAlt"
        />
      </div>
      <div class="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" :disabled="disabled" @click="open = true">
          Trocar
        </Button>
        <Button type="button" variant="ghost" size="sm" :disabled="disabled" @click="clearCover">
          Remover
        </Button>
      </div>
    </div>

    <Button
      v-else
      type="button"
      variant="outline"
      class="h-28 w-full border-dashed"
      :disabled="disabled || !access.canReadMedia.value"
      @click="open = true"
    >
      <Icon name="lucide:image-plus" class="mr-2 size-4" aria-hidden="true" />
      Escolher imagem
    </Button>

    <p v-if="!access.canReadMedia.value" class="text-xs text-muted-foreground">
      Você não tem acesso à biblioteca de mídia.
    </p>
    <p v-if="error" class="text-xs text-destructive">
      {{ error }}
    </p>

    <CmsMediaLibraryDialog
      v-model:open="open"
      title="Escolher capa"
      :selected-asset-ids="modelValue ? [modelValue.assetId] : []"
      @select="selectAsset"
    />
  </div>
</template>
