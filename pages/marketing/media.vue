<script setup lang="ts">
import type { LibraryAssetRow, MediaLibraryUploadItem } from '~/composables/marketing/useMediaLibrary'
import type { MediaAssetDeletePreviewItem } from '~/server/utils/media-asset-deletion'
import { toast } from 'vue-sonner'
import MediaLibraryDeleteDialog from '~/components/marketing/media/MediaLibraryDeleteDialog.vue'
import MediaLibraryGrid from '~/components/marketing/media/MediaLibraryGrid.vue'
import { invalidateMarketingCache } from '~/composables/marketing/useMarketingFetch'
import {
  formatMediaAssetSize,
  libraryAssetDisplayUrl,
  libraryAssetIsImage,
  libraryAssetIsVideo,
  libraryAssetSize,
  mergeLibraryAssetPreviews,
  normalizeLibraryAsset,
  useMediaLibrary,
} from '~/composables/marketing/useMediaLibrary'

definePageMeta({
  middleware: ['auth'],
  title: 'Biblioteca de mídia',
})

const social = useMarketingSocial()
const mediaLibrary = useMediaLibrary()

const search = ref('')
const purpose = ref<'all' | 'publication' | 'reference'>('all')
const category = ref('all')
const uploadPurpose = ref<'publication' | 'reference'>('publication')
const uploading = ref(false)
const uploadingItems = ref<MediaLibraryUploadItem[]>([])
const isFileDragOver = ref(false)
const previewDialogOpen = ref(false)
const activeAsset = ref<LibraryAssetRow | null>(null)
const newFolderName = ref('')
const creatingFolder = ref(false)
/** Nested dragenter/leave counter so child nodes don't flicker the overlay. */
let fileDragDepth = 0

const selectedIds = ref<string[]>([])
const deleteDialogOpen = ref(false)
const deletePreviewLoading = ref(false)
const deleting = ref(false)
const deletePreviewItems = ref<MediaAssetDeletePreviewItem[]>([])

const { can } = useWorkspace()
const canManageLibrary = computed(() => can('marketing.social.library.manage'))

const { data: assets, showSkeleton, revalidating, refresh, error: loadError } = useMarketingFetch({
  key: () => `marketing-library-${social.tenantId.value}-${category.value}`,
  handler: async () => {
    const rows = await social.listAssets({
      ...(category.value !== 'all' ? { category: category.value } : {}),
    })
    return rows.map(row => normalizeLibraryAsset(row))
  },
  default: () => [] as LibraryAssetRow[],
  watch: [social.tenantId, category],
  enabled: () => Boolean(social.tenantId.value),
  ttlMs: 3 * 60 * 1000,
})

const { data: folders, refresh: refreshFolders } = useMarketingFetch({
  key: () => `library-folders-${social.tenantId.value}`,
  handler: () => $fetch<{ data: any[] }>('/api/marketing/social/library/meta', {
    query: { tenant_id: social.tenantId.value || undefined, type: 'folders' },
  }),
  default: () => ({ data: [] as any[] }),
  watch: [social.tenantId],
  enabled: () => Boolean(social.tenantId.value),
  ttlMs: 5 * 60 * 1000,
})

const categories = [
  { value: 'all', label: 'Todas categorias' },
  { value: 'logo', label: 'Logos' },
  { value: 'brand_manual', label: 'Manual da marca' },
  { value: 'photo', label: 'Fotos' },
  { value: 'video', label: 'Vídeos' },
  { value: 'product', label: 'Produtos' },
  { value: 'document', label: 'Documentos' },
  { value: 'reference', label: 'Referências' },
]

const filteredAssets = computed(() => {
  const term = search.value.trim().toLocaleLowerCase('pt-BR')
  const rows = Array.isArray(assets.value) ? assets.value as LibraryAssetRow[] : []
  return rows.filter((asset) => {
    const matchesPurpose = purpose.value === 'all' || asset.purpose === purpose.value
    const matchesSearch = !term || asset.name.toLocaleLowerCase('pt-BR').includes(term)
    const active = asset.lifecycle !== 'discontinued'
    return matchesPurpose && matchesSearch && active
  })
})

const selectedAssets = computed(() =>
  filteredAssets.value.filter(asset => selectedIds.value.includes(asset.id)),
)

const hasSelection = computed(() => selectedIds.value.length > 0)
const allFilteredSelected = computed(() =>
  filteredAssets.value.length > 0
  && filteredAssets.value.every(asset => selectedIds.value.includes(asset.id)),
)

const isLibraryBooting = computed(() =>
  !social.tenantId.value || showSkeleton.value,
)

const showLibraryGrid = computed(() =>
  isLibraryBooting.value
  || uploadingItems.value.length > 0
  || filteredAssets.value.length > 0,
)

const showEmptyState = computed(() =>
  !isLibraryBooting.value
  && !loadError.value
  && !uploadingItems.value.length
  && filteredAssets.value.length === 0,
)

function invalidateLibraryCaches() {
  const tenant = social.tenantId.value || ''
  invalidateMarketingCache([
    `marketing-library-${tenant}`,
    `marketing-social-form-assets-${tenant}`,
  ])
}

function revokeUploadPreviews(items: MediaLibraryUploadItem[]) {
  for (const item of items) {
    if (item.previewUrl?.startsWith('blob:'))
      URL.revokeObjectURL(item.previewUrl)
  }
}

onUnmounted(() => {
  revokeUploadPreviews(uploadingItems.value)
  resetFileDragState()
})

watch(filteredAssets, (items) => {
  const valid = new Set(items.map(item => item.id))
  selectedIds.value = selectedIds.value.filter(id => valid.has(id))
})

async function createFolder() {
  if (!newFolderName.value.trim() || !canManageLibrary.value)
    return
  creatingFolder.value = true
  try {
    await $fetch('/api/marketing/social/library/meta', {
      method: 'POST',
      body: { kind: 'folder', name: newFolderName.value.trim() },
    })
    newFolderName.value = ''
    toast.success('Pasta criada')
    await refreshFolders()
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || 'Falha ao criar pasta')
  }
  finally {
    creatingFolder.value = false
  }
}

function prependUploadedAssets(uploaded: LibraryAssetRow[]) {
  if (!uploaded.length)
    return

  const current = assets.value as LibraryAssetRow[]
  assets.value = [
    ...uploaded,
    ...current.filter(asset => !uploaded.some(row => row.id === asset.id)),
  ] as LibraryAssetRow[]
}

function uploadAccept(): string {
  return uploadPurpose.value === 'publication'
    ? 'image/*,video/mp4,video/quicktime'
    : 'image/*,video/mp4,video/quicktime,application/pdf'
}

function isAcceptedLibraryFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase()
  if (mime.startsWith('image/'))
    return true
  if (mime === 'video/mp4' || mime === 'video/quicktime')
    return true
  if (uploadPurpose.value === 'reference' && mime === 'application/pdf')
    return true

  // Some OS/browsers omit MIME — fall back to extension.
  const name = file.name.toLowerCase()
  if (/\.(?:jpe?g|png|gif|webp|svg|heic|heif|avif|bmp)$/i.test(name))
    return true
  if (/\.(?:mp4|mov)$/i.test(name))
    return true
  if (uploadPurpose.value === 'reference' && name.endsWith('.pdf'))
    return true
  return false
}

function hasFileDragPayload(event: DragEvent): boolean {
  const types = event.dataTransfer?.types
  if (!types)
    return false
  return Array.from(types).includes('Files')
}

function onLibraryDragEnter(event: DragEvent) {
  if (uploading.value || !hasFileDragPayload(event))
    return
  event.preventDefault()
  fileDragDepth += 1
  isFileDragOver.value = true
}

function onLibraryDragOver(event: DragEvent) {
  if (!hasFileDragPayload(event))
    return
  event.preventDefault()
  if (event.dataTransfer)
    event.dataTransfer.dropEffect = uploading.value ? 'none' : 'copy'
}

function onLibraryDragLeave(event: DragEvent) {
  if (!hasFileDragPayload(event))
    return
  event.preventDefault()
  fileDragDepth = Math.max(0, fileDragDepth - 1)
  if (fileDragDepth === 0)
    isFileDragOver.value = false
}

function resetFileDragState() {
  fileDragDepth = 0
  isFileDragOver.value = false
}

async function onLibraryDrop(event: DragEvent) {
  event.preventDefault()
  resetFileDragState()
  if (uploading.value)
    return

  const dropped = Array.from(event.dataTransfer?.files || [])
  if (!dropped.length)
    return

  const files = dropped.filter(isAcceptedLibraryFile)
  if (!files.length) {
    toast.error(
      uploadPurpose.value === 'publication'
        ? 'Use imagens ou vídeos (MP4/MOV) para peças finais'
        : 'Formato não suportado. Use imagem, vídeo (MP4/MOV) ou PDF',
    )
    return
  }

  await uploadFiles(files)
}

async function uploadFromInput(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.length)
    return
  const files = Array.from(input.files)
  input.value = ''
  await uploadFiles(files)
}

async function uploadFiles(files: File[]) {
  if (!files.length || uploading.value)
    return

  uploading.value = true
  const placeholders: MediaLibraryUploadItem[] = files.map(file => ({
    id: `upload-${crypto.randomUUID()}`,
    name: file.name,
    previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
  }))
  uploadingItems.value = placeholders
  const uploadedRows: LibraryAssetRow[] = []
  try {
    for (const [index, file] of files.entries()) {
      const uploaded = await social.uploadAsset(file, uploadPurpose.value, {
        category: category.value !== 'all' ? category.value : undefined,
      })
      const row = normalizeLibraryAsset(uploaded, file)
      uploadedRows.push(row)
      prependUploadedAssets([row])
      const placeholder = placeholders[index]
      if (placeholder)
        uploadingItems.value = uploadingItems.value.filter(item => item.id !== placeholder.id)
    }

    toast.success(uploadedRows.length > 1 ? 'Arquivos adicionados à biblioteca' : 'Arquivo adicionado à biblioteca')
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || error?.statusMessage || error?.message || 'Não foi possível enviar os arquivos')
  }
  finally {
    if (uploadedRows.length) {
      invalidateLibraryCaches()
      try {
        await refresh()
        const listed = Array.isArray(assets.value) ? assets.value as LibraryAssetRow[] : []
        const listedIds = new Set(listed.map(row => row.id))
        const missing = uploadedRows.filter(row => row.id && !listedIds.has(row.id))
        assets.value = mergeLibraryAssetPreviews(
          [...missing, ...listed],
          uploadedRows,
        ) as LibraryAssetRow[]
      }
      catch (refreshError) {
        console.warn('[media-library] refresh after upload failed:', refreshError)
      }
    }
    revokeUploadPreviews(placeholders)
    uploadingItems.value = []
    uploading.value = false
  }
}

function openPreview(asset: LibraryAssetRow) {
  activeAsset.value = asset
  previewDialogOpen.value = true
}

function toggleSelected(id: string, event?: Event) {
  event?.stopPropagation()
  if (selectedIds.value.includes(id))
    selectedIds.value = selectedIds.value.filter(value => value !== id)
  else
    selectedIds.value = [...selectedIds.value, id]
}

function toggleSelectAllFiltered() {
  if (allFilteredSelected.value)
    selectedIds.value = []
  else
    selectedIds.value = filteredAssets.value.map(asset => asset.id)
}

function clearSelection() {
  selectedIds.value = []
}

async function openDeleteDialog(assetIds?: string[]) {
  const ids = assetIds?.length ? assetIds : selectedIds.value
  if (!ids.length || !canManageLibrary.value)
    return

  selectedIds.value = ids
  deleteDialogOpen.value = true
  deletePreviewLoading.value = true
  deletePreviewItems.value = []

  try {
    const preview = await mediaLibrary.previewDelete(ids)
    deletePreviewItems.value = preview.assets
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || 'Não foi possível preparar a exclusão')
    deleteDialogOpen.value = false
  }
  finally {
    deletePreviewLoading.value = false
  }
}

async function confirmDelete() {
  const ids = selectedAssets.value.map(asset => asset.id)
  if (!ids.length)
    return

  deleting.value = true
  const previous = (assets.value as LibraryAssetRow[]) || []
  assets.value = previous.filter(asset => !ids.includes(asset.id)) as LibraryAssetRow[]

  try {
    const result = await mediaLibrary.deleteAssets(ids)
    const count = result.count || ids.length
    toast.success(count > 1 ? `${count} arquivos excluídos` : 'Arquivo excluído com sucesso')
    deleteDialogOpen.value = false
    previewDialogOpen.value = false
    if (activeAsset.value && ids.includes(activeAsset.value.id))
      activeAsset.value = null
    selectedIds.value = []
    invalidateLibraryCaches()
    await refresh()
  }
  catch (error: any) {
    assets.value = previous as LibraryAssetRow[]
    const blocked = error?.data?.data?.blocked || error?.data?.blocked
    if (blocked?.length) {
      deletePreviewItems.value = blocked
      toast.error(error?.data?.statusMessage || 'Alguns arquivos estão vinculados a publicações')
      return
    }
    toast.error(error?.data?.statusMessage || error?.message || 'Não foi possível excluir os arquivos')
  }
  finally {
    deleting.value = false
  }
}

function deleteFromPreview() {
  if (!activeAsset.value)
    return
  previewDialogOpen.value = false
  openDeleteDialog([activeAsset.value.id])
}
</script>

<template>
  <div
    class="relative space-y-6"
    @dragenter="onLibraryDragEnter"
    @dragover="onLibraryDragOver"
    @dragleave="onLibraryDragLeave"
    @drop="onLibraryDrop"
  >
    <div
      v-if="isFileDragOver"
      class="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-[1px]"
      aria-hidden="true"
    >
      <div class="flex flex-col items-center gap-2 rounded-2xl bg-background/95 px-6 py-5 shadow-lg ring-1 ring-border">
        <Icon name="lucide:upload-cloud" class="h-10 w-10 text-primary" />
        <p class="text-sm font-semibold">
          Solte para enviar à biblioteca
        </p>
        <p class="text-xs text-muted-foreground">
          {{ uploadPurpose === 'publication' ? 'Peças finais: imagens e vídeos' : 'Referências: imagens, vídeos ou PDF' }}
        </p>
      </div>
    </div>

    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">
          Biblioteca
        </h1>
        <p class="mt-1 text-muted-foreground">
          Organize peças finais e referências em um só lugar. Arraste arquivos para cá ou use o botão de envio.
        </p>
        <p
          v-if="revalidating"
          class="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"
          aria-live="polite"
        >
          <Icon name="lucide:loader-circle" class="h-3 w-3 animate-spin" />
          Atualizando biblioteca…
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Select v-model="uploadPurpose">
          <SelectTrigger class="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="publication">
              Peça final
            </SelectItem>
            <SelectItem value="reference">
              Referência
            </SelectItem>
          </SelectContent>
        </Select>
        <Button as-child :disabled="uploading">
          <label class="cursor-pointer">
            <Icon name="lucide:upload" class="mr-2 h-4 w-4" />
            {{ uploading ? 'Enviando...' : 'Enviar arquivos' }}
            <input
              type="file"
              multiple
              :accept="uploadAccept()"
              class="hidden"
              @change="uploadFromInput"
            >
          </label>
        </Button>
      </div>
    </div>

    <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <div class="relative max-w-lg flex-1">
        <Icon name="lucide:search" class="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input v-model="search" class="pl-9" placeholder="Buscar arquivos" />
      </div>
      <Select v-model="purpose">
        <SelectTrigger class="w-full sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            Todos os arquivos
          </SelectItem>
          <SelectItem value="publication">
            Peças finais
          </SelectItem>
          <SelectItem value="reference">
            Referências
          </SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="category">
        <SelectTrigger class="w-full sm:w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="item in categories" :key="item.value" :value="item.value">
            {{ item.label }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <Card v-if="canManageLibrary">
      <CardContent class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <Input v-model="newFolderName" placeholder="Nova pasta" class="sm:max-w-xs" />
        <Button variant="outline" :disabled="creatingFolder || !newFolderName.trim()" @click="createFolder">
          Criar pasta
        </Button>
        <p class="text-xs text-muted-foreground">
          {{ (folders?.data || []).length }} pastas · use categorias e pastas para organizar logos, manuais e referências
        </p>
      </CardContent>
    </Card>

    <div
      v-if="canManageLibrary && hasSelection"
      class="sticky top-0 z-20 flex flex-wrap animate-in items-center justify-between gap-3 border-2 border-primary/40 rounded-xl bg-card p-3 shadow-md fade-in-0 slide-in-from-top-2"
      role="region"
      aria-live="polite"
      aria-label="Ações da seleção"
    >
      <div class="flex flex-wrap items-center gap-3">
        <span class="h-8 min-w-8 flex items-center justify-center rounded-full bg-primary px-2.5 text-sm text-primary-foreground font-semibold">
          {{ selectedIds.length }}
        </span>
        <p class="text-sm font-semibold">
          {{ selectedIds.length === 1 ? 'arquivo selecionado' : 'arquivos selecionados' }}
        </p>
        <Button variant="ghost" size="sm" @click="clearSelection">
          Limpar
        </Button>
        <Button
          v-if="filteredAssets.length"
          variant="ghost"
          size="sm"
          @click="toggleSelectAllFiltered"
        >
          {{ allFilteredSelected ? 'Desmarcar todos' : 'Selecionar todos' }}
        </Button>
      </div>
      <Button variant="destructive" size="sm" @click="openDeleteDialog()">
        <Icon name="lucide:trash-2" class="mr-2 h-4 w-4" />
        Excluir
      </Button>
    </div>

    <p v-if="isLibraryBooting" class="sr-only" aria-live="polite">
      Carregando biblioteca de mídia
    </p>

    <MediaLibraryGrid
      v-if="showLibraryGrid"
      :assets="isLibraryBooting ? [] : filteredAssets"
      :selected-ids="selectedIds"
      :can-manage="canManageLibrary"
      :tenant-id="social.tenantId.value"
      :skeleton-count="isLibraryBooting ? 12 : 0"
      :uploading-items="uploadingItems"
      @toggle="toggleSelected"
      @open="openPreview"
    />

    <Card v-else-if="loadError">
      <CardContent class="flex flex-col items-center py-16 text-center">
        <div class="mb-4 rounded-full bg-destructive/10 p-4">
          <Icon name="lucide:image-off" class="h-10 w-10 text-destructive" />
        </div>
        <h2 class="font-semibold">
          Não foi possível carregar a biblioteca
        </h2>
        <p class="mt-1 max-w-sm text-sm text-muted-foreground">
          {{ (loadError as any)?.data?.statusMessage || (loadError as any)?.statusMessage || 'Tente novamente em instantes.' }}
        </p>
        <Button class="mt-4" variant="outline" @click="refresh()">
          Tentar de novo
        </Button>
      </CardContent>
    </Card>

    <Card v-else-if="showEmptyState">
      <CardContent class="flex flex-col items-center py-16 text-center">
        <div class="mb-4 rounded-full bg-muted p-4">
          <Icon name="lucide:images" class="h-10 w-10 text-muted-foreground" />
        </div>
        <h2 class="font-semibold">
          {{ search.trim() || purpose !== 'all' || category !== 'all' ? 'Nenhum arquivo encontrado' : 'Biblioteca vazia' }}
        </h2>
        <p class="mt-1 max-w-sm text-sm text-muted-foreground">
          {{
            search.trim() || purpose !== 'all' || category !== 'all'
              ? 'Ajuste os filtros ou busque por outro termo.'
              : 'Envie artes, vídeos ou documentos de referência para começar.'
          }}
        </p>
        <Button v-if="!search.trim() && purpose === 'all' && category === 'all'" as-child class="mt-4" :disabled="uploading">
          <label class="cursor-pointer">
            <Icon name="lucide:upload" class="mr-2 h-4 w-4" />
            Enviar arquivos
            <input
              type="file"
              multiple
              accept="image/*,video/mp4,video/quicktime,application/pdf"
              class="hidden"
              @change="uploadFromInput"
            >
          </label>
        </Button>
      </CardContent>
    </Card>

    <Dialog v-model:open="previewDialogOpen">
      <DialogContent class="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{{ activeAsset?.name }}</DialogTitle>
          <DialogDescription>
            {{ activeAsset?.purpose === 'publication' ? 'Peça final' : 'Referência' }}
            · {{ formatMediaAssetSize(libraryAssetSize(activeAsset || {})) }}
          </DialogDescription>
        </DialogHeader>
        <div class="max-h-[70vh] overflow-hidden rounded-xl bg-muted">
          <img
            v-if="activeAsset && (libraryAssetIsImage(activeAsset))"
            :src="libraryAssetDisplayUrl(activeAsset, social.tenantId.value) || undefined"
            :alt="activeAsset.name"
            class="max-h-[70vh] w-full animate-in object-contain duration-300 fade-in-0"
            referrerpolicy="no-referrer"
          >
          <video
            v-else-if="activeAsset && libraryAssetIsVideo(activeAsset)"
            :src="libraryAssetDisplayUrl(activeAsset, social.tenantId.value) || undefined"
            class="max-h-[70vh] w-full"
            controls
          />
          <div v-else class="h-72 flex flex-col items-center justify-center">
            <Icon name="lucide:file-text" class="mb-3 h-12 w-12 text-muted-foreground" />
            <p class="text-sm text-muted-foreground">
              Visualização indisponível para este formato.
            </p>
          </div>
        </div>
        <DialogFooter v-if="canManageLibrary">
          <Button
            variant="destructive"
            @click="deleteFromPreview"
          >
            <Icon name="lucide:trash-2" class="mr-2 h-4 w-4" />
            Excluir arquivo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <MediaLibraryDeleteDialog
      v-model:open="deleteDialogOpen"
      :assets="selectedAssets"
      :preview-items="deletePreviewItems"
      :loading-preview="deletePreviewLoading"
      :deleting="deleting"
      @confirm="confirmDelete"
    />
  </div>
</template>
