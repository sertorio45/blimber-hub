<script setup lang="ts">
import type { CmsMediaAsset } from '~/composables/cms/useCmsMedia'

import { ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { useCmsAccess } from '~/composables/cms/useCmsAccess'
import { useCmsMedia } from '~/composables/cms/useCmsMedia'
import { mediaAssetMimeType, mediaAssetPreviewUrl } from '~/utils/media-asset'

const props = withDefaults(defineProps<{
  multiple?: boolean
  selectedAssetIds?: string[]
  title?: string
  description?: string
}>(), {
  multiple: false,
  selectedAssetIds: () => [],
  title: 'Escolher imagem',
  description: 'Imagens da biblioteca desta empresa.',
})

const emit = defineEmits<{
  select: [asset: CmsMediaAsset]
  confirm: [assets: CmsMediaAsset[]]
}>()

const open = defineModel<boolean>('open', { required: true })

const access = useCmsAccess()
const media = useCmsMedia()
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

/** In multiple mode the selection is staged and applied only on confirm. */
const stagedIds = ref<string[]>([])

watch(open, (isOpen) => {
  if (isOpen)
    stagedIds.value = [...props.selectedAssetIds]
})

function isImage(asset: CmsMediaAsset): boolean {
  const mime = mediaAssetMimeType({
    mimeType: typeof asset.mime_type === 'string' ? asset.mime_type : '',
    mime_type: typeof asset.mime_type === 'string' ? asset.mime_type : '',
  })
  return !mime || mime.startsWith('image/')
}

function previewOf(asset: CmsMediaAsset): string | null {
  if (!isImage(asset))
    return null
  return mediaAssetPreviewUrl({
    mimeType: typeof asset.mime_type === 'string' ? asset.mime_type : '',
    previewUrl: asset.previewUrl,
    preview_url: asset.preview_url,
  })
}

function isSelected(assetId: string): boolean {
  return props.multiple
    ? stagedIds.value.includes(assetId)
    : props.selectedAssetIds.includes(assetId)
}

function pick(asset: CmsMediaAsset) {
  if (!props.multiple) {
    emit('select', asset)
    open.value = false
    return
  }
  stagedIds.value = stagedIds.value.includes(asset.id)
    ? stagedIds.value.filter(id => id !== asset.id)
    : [...stagedIds.value, asset.id]
}

function confirmSelection() {
  const byId = new Map(media.assets.value.map(asset => [asset.id, asset]))
  const assets = stagedIds.value
    .map(id => byId.get(id))
    .filter((asset): asset is CmsMediaAsset => Boolean(asset))
  emit('confirm', assets)
  open.value = false
}

async function onFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || uploading.value)
    return
  uploading.value = true
  try {
    const uploaded = await media.upload(file)
    if (!uploaded) {
      toast.error('Não foi possível enviar a imagem.')
      return
    }
    toast.success('Imagem enviada.')
    if (props.multiple) {
      if (!stagedIds.value.includes(uploaded.id))
        stagedIds.value = [...stagedIds.value, uploaded.id]
      return
    }
    emit('select', uploaded)
    open.value = false
  }
  finally {
    uploading.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-3xl">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>
          {{ description }}
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
          :disabled="uploading"
          @click="fileInput?.click()"
        >
          <Icon :name="uploading ? 'lucide:loader-circle' : 'lucide:upload'" class="mr-2 size-4" :class="uploading ? 'animate-spin' : ''" aria-hidden="true" />
          {{ uploading ? 'Enviando…' : 'Enviar imagem' }}
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
        Nenhuma imagem na biblioteca. Envie a primeira com o botão acima.
      </p>
      <ul v-else class="grid grid-cols-3 max-h-80 gap-2 overflow-y-auto sm:grid-cols-4">
        <li v-for="asset in media.assets.value" :key="asset.id">
          <button
            v-if="isImage(asset)"
            type="button"
            class="relative w-full overflow-hidden border rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :class="isSelected(asset.id) ? 'ring-2 ring-primary' : ''"
            :aria-pressed="isSelected(asset.id)"
            :aria-label="`Usar ${asset.name}`"
            @click="pick(asset)"
          >
            <img
              v-if="previewOf(asset)"
              :src="previewOf(asset) || undefined"
              alt=""
              class="aspect-square w-full object-cover"
            >
            <span v-else class="aspect-square flex items-center justify-center bg-muted text-muted-foreground">
              <Icon name="lucide:image" class="size-6" aria-hidden="true" />
            </span>
            <span
              v-if="multiple && isSelected(asset.id)"
              class="absolute right-1.5 top-1.5 size-5 flex items-center justify-center rounded-full bg-primary text-primary-foreground"
            >
              <Icon name="lucide:check" class="size-3.5" aria-hidden="true" />
            </span>
          </button>
        </li>
      </ul>

      <DialogFooter v-if="multiple">
        <Button type="button" variant="ghost" @click="open = false">
          Cancelar
        </Button>
        <Button type="button" @click="confirmSelection">
          Usar {{ stagedIds.length }} {{ stagedIds.length === 1 ? 'imagem' : 'imagens' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
