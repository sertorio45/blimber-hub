<script setup lang="ts">
import type { CmsMediaRef } from '~/lib/cms/contracts'

import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'

import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { useCmsAccess } from '~/composables/cms/useCmsAccess'
import { useCmsMedia } from '~/composables/cms/useCmsMedia'
import { mediaAssetMimeType, mediaAssetPreviewUrl } from '~/utils/media-asset'

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
const fileInput = ref<HTMLInputElement | null>(null)

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

function previewOf(assetId: string): string | null {
  const asset = media.assets.value.find(item => item.id === assetId)
  if (!asset)
    return null
  const mime = typeof asset.mime_type === 'string' ? asset.mime_type : ''
  if (mime && !mime.startsWith('image/'))
    return null
  return mediaAssetPreviewUrl({
    mimeType: mime,
    previewUrl: asset.previewUrl,
    preview_url: asset.preview_url,
  })
}

function selectAsset(assetId: string) {
  const asset = media.assets.value.find(item => item.id === assetId)
  if (!asset)
    return
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

async function onFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file)
    return
  const uploaded = await media.upload(file)
  if (!uploaded) {
    toast.error('Não foi possível enviar a imagem.')
    return
  }
  selectAsset(uploaded.id)
  toast.success('Imagem enviada.')
}

function isImage(assetId: string): boolean {
  const asset = media.assets.value.find(item => item.id === assetId)
  if (!asset)
    return true
  const mime = mediaAssetMimeType({
    mimeType: typeof asset.mime_type === 'string' ? asset.mime_type : '',
    mime_type: typeof asset.mime_type === 'string' ? asset.mime_type : '',
  })
  return !mime || mime.startsWith('image/')
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

    <Dialog v-model:open="open">
      <DialogContent class="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Escolher capa</DialogTitle>
          <DialogDescription>
            Imagens da biblioteca desta empresa.
          </DialogDescription>
        </DialogHeader>

        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="relative max-w-sm flex-1">
            <Icon name="lucide:search" class="pointer-events-none absolute left-3 top-1/2 size-4 text-muted-foreground -translate-y-1/2" aria-hidden="true" />
            <Input v-model="media.search.value" class="pl-9" placeholder="Buscar imagens…" aria-label="Buscar imagens" />
          </div>
          <Button
            v-if="access.canUploadMedia.value"
            type="button"
            variant="outline"
            size="sm"
            @click="fileInput?.click()"
          >
            <Icon name="lucide:upload" class="mr-2 size-4" aria-hidden="true" />
            Enviar
          </Button>
          <input
            ref="fileInput"
            type="file"
            class="hidden"
            accept="image/*"
            @change="onFilesSelected"
          >
        </div>

        <div v-if="media.showSkeleton.value" class="grid grid-cols-3 gap-2 sm:grid-cols-4">
          <div v-for="n in 8" :key="n" class="aspect-square animate-pulse rounded-lg bg-muted" />
        </div>
        <p v-else-if="media.loadError.value" class="text-sm text-destructive" role="alert">
          {{ media.loadError.value.message }}
        </p>
        <p v-else-if="!media.assets.value.length" class="py-8 text-center text-sm text-muted-foreground">
          Nenhuma imagem na biblioteca.
        </p>
        <ul v-else class="grid grid-cols-3 max-h-80 gap-2 overflow-y-auto sm:grid-cols-4">
          <li v-for="asset in media.assets.value" :key="asset.id">
            <button
              v-if="isImage(asset.id)"
              type="button"
              class="w-full overflow-hidden border rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              :class="modelValue?.assetId === asset.id ? 'ring-2 ring-primary' : ''"
              :aria-pressed="modelValue?.assetId === asset.id"
              :aria-label="`Usar ${asset.name}`"
              @click="selectAsset(asset.id)"
            >
              <img
                v-if="previewOf(asset.id)"
                :src="previewOf(asset.id) || undefined"
                alt=""
                class="aspect-square w-full object-cover"
              >
              <span v-else class="aspect-square flex items-center justify-center bg-muted text-muted-foreground">
                <Icon name="lucide:image" class="size-6" aria-hidden="true" />
              </span>
            </button>
          </li>
        </ul>
      </DialogContent>
    </Dialog>
  </div>
</template>
