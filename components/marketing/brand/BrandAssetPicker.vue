<script setup lang="ts">
import type { BrandGuideLogoAsset } from '~/types/brand-guide'
import type { MediaAsset } from '~/types/marketing-social'
import { toast } from 'vue-sonner'
import { mediaAssetPreviewUrl, toBrandGuideLogoAsset } from '~/utils/media-asset'

const props = withDefaults(defineProps<{
  assetIds: string[]
  assets: BrandGuideLogoAsset[]
  disabled?: boolean
  label?: string
  hint?: string
  dialogTitle?: string
  dialogDescription?: string
  emptyLabel?: string
  max?: number
  /** Prefer media library category (e.g. logo); falls back to image mime. */
  category?: string
  /** Allow uploading files into the library and linking them here. */
  allowUpload?: boolean
  uploadLabel?: string
  uploadAccept?: string
  uploadPurpose?: 'reference' | 'publication'
}>(), {
  label: 'Arquivos da biblioteca',
  hint: 'Referencie arquivos já existentes na biblioteca.',
  dialogTitle: 'Selecionar da biblioteca',
  dialogDescription: 'Escolha arquivos da biblioteca de mídia do cliente.',
  emptyLabel: 'Nenhum arquivo vinculado. Use a biblioteca de mídia.',
  max: 12,
  allowUpload: false,
  uploadLabel: 'Enviar',
  uploadAccept: 'image/*,.svg,.png,.jpg,.jpeg,.webp,.gif',
  uploadPurpose: 'reference',
})

export type BrandAssetSelection = {
  assetIds: string[]
  assets: BrandGuideLogoAsset[]
}

const emit = defineEmits<{
  /** Prefer this — ids + assets in one event (avoids stale v-model races). */
  change: [value: BrandAssetSelection]
  uploaded: [value: BrandAssetSelection]
  'update:assetIds': [value: string[]]
  'update:assets': [value: BrandGuideLogoAsset[]]
}>()

const social = useMarketingSocial()
const open = ref(false)
const loading = ref(false)
const uploading = ref(false)
const library = ref<MediaAsset[]>([])
const fileInput = ref<HTMLInputElement | null>(null)

const selectedSet = computed(() => new Set(props.assetIds))
const atLimit = computed(() => props.assetIds.length >= props.max)

/** Emit selection once so parents can patch ids+assets atomically. */
function commitSelection(selection: BrandAssetSelection, options?: { uploaded?: boolean }) {
  emit('change', selection)
  // Legacy dual emits — only safe if parent ignores them and uses `change`.
  emit('update:assetIds', selection.assetIds)
  emit('update:assets', selection.assets)
  if (options?.uploaded)
    emit('uploaded', selection)
}

function asLibraryAsset(asset: MediaAsset | Record<string, unknown>): MediaAsset {
  const row = asset as MediaAsset & {
    preview_url?: string | null
    mime_type?: string
    object_path?: string
  }
  return {
    ...row,
    previewUrl: mediaAssetPreviewUrl(row),
    mimeType: row.mimeType || row.mime_type || '',
    objectPath: row.objectPath || row.object_path || '',
  } as MediaAsset
}

async function openPicker() {
  if (props.disabled)
    return
  open.value = true
  loading.value = true
  try {
    if (props.category) {
      const byCategory = await social.listAssets({ category: props.category, limit: 60 })
      library.value = (byCategory.length
        ? byCategory
        : (await social.listAssets({ mime: 'image', limit: 60 }))
      ).map(asLibraryAsset)
    }
    else {
      library.value = (await social.listAssets({ mime: 'image', limit: 60 })).map(asLibraryAsset)
    }
  }
  catch {
    library.value = []
  }
  finally {
    loading.value = false
  }
}

function toggle(asset: MediaAsset) {
  const normalized = toBrandGuideLogoAsset(asset)
  if (!normalized)
    return

  const nextIds = new Set(props.assetIds)
  const nextAssets = [...props.assets]
  if (nextIds.has(asset.id)) {
    nextIds.delete(asset.id)
    commitSelection({
      assetIds: [...nextIds],
      assets: nextAssets.filter(item => item.id !== asset.id),
    })
    return
  }
  if (nextIds.size >= props.max)
    return
  nextIds.add(asset.id)
  nextAssets.push(normalized)
  commitSelection({ assetIds: [...nextIds], assets: nextAssets })
}

function remove(id: string) {
  commitSelection({
    assetIds: props.assetIds.filter(item => item !== id),
    assets: props.assets.filter(item => item.id !== id),
  })
}

function triggerUpload() {
  if (props.disabled || uploading.value || atLimit.value)
    return
  fileInput.value?.click()
}

async function onUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files ? Array.from(input.files) : []
  if (!files.length)
    return

  const remaining = props.max - props.assetIds.length
  if (remaining <= 0) {
    toast.error(`Limite de ${props.max} arquivo(s) atingido.`)
    input.value = ''
    return
  }

  const queue = files.slice(0, remaining)
  uploading.value = true
  try {
    const nextIds = [...props.assetIds]
    const nextAssets = [...props.assets]

    for (const file of queue) {
      if (!file.type.startsWith('image/') && !/\.(?:svg|png|jpe?g|webp|gif)$/i.test(file.name)) {
        toast.error(`“${file.name}” não é uma imagem válida.`)
        continue
      }

      const uploaded = await social.uploadAsset(file, props.uploadPurpose, {
        category: props.category || undefined,
      })
      const normalizedAsset = asLibraryAsset(uploaded)
      const logoAsset = toBrandGuideLogoAsset(normalizedAsset)
      if (!logoAsset)
        continue

      // Prefer immediate local preview if signed URL is still missing
      if (!logoAsset.previewUrl)
        logoAsset.previewUrl = URL.createObjectURL(file)

      if (!nextIds.includes(logoAsset.id)) {
        nextIds.push(logoAsset.id)
        nextAssets.push(logoAsset)
      }

      library.value = [
        normalizedAsset,
        ...library.value.filter(item => item.id !== normalizedAsset.id),
      ]
    }

    const selection = { assetIds: nextIds, assets: nextAssets }
    commitSelection(selection, { uploaded: true })

    if (queue.length === 1)
      toast.success('Logo enviado e vinculado. Salvando…')
    else
      toast.success(`${queue.length} arquivos enviados e vinculados. Salvando…`)

    if (files.length > remaining)
      toast.info(`Apenas ${remaining} arquivo(s) foram adicionados (limite de ${props.max}).`)
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || error?.message || 'Não foi possível enviar o arquivo.')
  }
  finally {
    uploading.value = false
    input.value = ''
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-sm font-medium">
          {{ label }}
        </p>
        <p class="text-xs text-muted-foreground">
          {{ hint }}
        </p>
      </div>
      <div
        v-if="!disabled"
        class="flex flex-wrap items-center gap-2"
      >
        <input
          v-if="allowUpload"
          ref="fileInput"
          type="file"
          class="hidden"
          :accept="uploadAccept"
          multiple
          @change="onUpload"
        >
        <Button
          v-if="allowUpload"
          type="button"
          size="sm"
          variant="default"
          :disabled="uploading || atLimit"
          @click="triggerUpload"
        >
          <Icon
            v-if="uploading"
            name="lucide:loader-2"
            class="mr-1.5 h-4 w-4 animate-spin"
          />
          <Icon
            v-else
            name="lucide:upload"
            class="mr-1.5 h-4 w-4"
          />
          {{ uploading ? 'Enviando…' : uploadLabel }}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          :disabled="uploading"
          @click="openPicker"
        >
          <Icon
            name="lucide:images"
            class="mr-1.5 h-4 w-4"
          />
          Biblioteca
        </Button>
      </div>
    </div>

    <div
      v-if="!assets.length"
      class="border rounded-lg border-dashed p-6 text-center text-sm text-muted-foreground"
    >
      <p>{{ emptyLabel }}</p>
      <div
        v-if="allowUpload && !disabled"
        class="mt-3 flex flex-wrap items-center justify-center gap-2"
      >
        <Button
          type="button"
          size="sm"
          :disabled="uploading"
          @click="triggerUpload"
        >
          <Icon
            name="lucide:upload"
            class="mr-1.5 h-4 w-4"
          />
          {{ uploadLabel }}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          :disabled="uploading"
          @click="openPicker"
        >
          Escolher na biblioteca
        </Button>
      </div>
    </div>

    <div
      v-else
      class="grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      <div
        v-for="asset in assets"
        :key="asset.id"
        class="group relative overflow-hidden border rounded-lg bg-muted"
      >
        <img
          v-if="asset.previewUrl"
          :src="asset.previewUrl"
          :alt="asset.name"
          class="aspect-square w-full bg-white object-contain p-2"
        >
        <div
          v-else
          class="aspect-square flex items-center justify-center text-xs text-muted-foreground"
        >
          Sem preview
        </div>
        <div class="truncate border-t px-2 py-1.5 text-xs">
          {{ asset.name }}
        </div>
        <Button
          v-if="!disabled"
          type="button"
          size="icon"
          variant="secondary"
          class="absolute right-1.5 top-1.5 h-7 w-7 opacity-0 transition group-hover:opacity-100"
          @click="remove(asset.id)"
        >
          <Icon
            name="lucide:x"
            class="h-3.5 w-3.5"
          />
        </Button>
      </div>
    </div>

    <p
      v-if="atLimit && !disabled"
      class="text-xs text-muted-foreground"
    >
      Limite de {{ max }} arquivo(s) atingido. Remova um para adicionar outro.
    </p>

    <Dialog v-model:open="open">
      <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{{ dialogTitle }}</DialogTitle>
          <DialogDescription>
            {{ dialogDescription }}
          </DialogDescription>
        </DialogHeader>

        <div
          v-if="allowUpload && !disabled"
          class="mb-4 flex flex-wrap items-center justify-between gap-2 border rounded-lg border-dashed p-3"
        >
          <p class="text-xs text-muted-foreground">
            Não encontrou o arquivo? Envie agora — ele entra na biblioteca e fica vinculado aqui.
          </p>
          <Button
            type="button"
            size="sm"
            :disabled="uploading || atLimit"
            @click="triggerUpload"
          >
            <Icon
              v-if="uploading"
              name="lucide:loader-2"
              class="mr-1.5 h-4 w-4 animate-spin"
            />
            <Icon
              v-else
              name="lucide:upload"
              class="mr-1.5 h-4 w-4"
            />
            {{ uploading ? 'Enviando…' : uploadLabel }}
          </Button>
        </div>

        <div
          v-if="loading"
          class="py-10 text-center text-sm text-muted-foreground"
        >
          Carregando biblioteca…
        </div>
        <div
          v-else-if="!library.length"
          class="border rounded-lg border-dashed p-8 text-center text-sm text-muted-foreground"
        >
          Nenhum asset encontrado.
          <template v-if="allowUpload">
            <Button
              type="button"
              size="sm"
              class="mt-3"
              :disabled="uploading || atLimit"
              @click="triggerUpload"
            >
              {{ uploadLabel }}
            </Button>
          </template>
          <NuxtLink
            v-else
            to="/marketing/media"
            class="mt-2 block text-primary underline-offset-4 hover:underline"
          >
            Abrir biblioteca
          </NuxtLink>
        </div>
        <div
          v-else
          class="grid grid-cols-2 gap-3 sm:grid-cols-3"
        >
          <button
            v-for="asset in library"
            :key="asset.id"
            type="button"
            class="relative overflow-hidden border rounded-lg text-left transition hover:bg-muted/40"
            :class="{ 'ring-2 ring-primary': selectedSet.has(asset.id) }"
            @click="toggle(asset)"
          >
            <img
              v-if="asset.previewUrl"
              :src="asset.previewUrl"
              :alt="asset.name"
              class="aspect-square w-full bg-white object-contain p-2"
            >
            <div
              v-else
              class="aspect-square flex items-center justify-center bg-muted text-xs text-muted-foreground"
            >
              Sem preview
            </div>
            <p class="truncate border-t px-2 py-1.5 text-xs">
              {{ asset.name }}
            </p>
            <span
              v-if="selectedSet.has(asset.id)"
              class="absolute right-2 top-2 h-6 w-6 flex items-center justify-center rounded-full bg-primary text-primary-foreground"
            >
              <Icon
                name="lucide:check"
                class="h-3.5 w-3.5"
              />
            </span>
          </button>
        </div>

        <DialogFooter>
          <Button
            type="button"
            @click="open = false"
          >
            Concluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
