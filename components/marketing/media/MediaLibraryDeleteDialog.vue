<script setup lang="ts">
import type { LibraryAssetRow } from '~/composables/marketing/useMediaLibrary'
import type { MediaAssetDeletePreviewItem } from '~/server/utils/media-asset-deletion'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog'
import Button from '~/components/ui/button/Button.vue'
import {
  libraryAssetIsImage,
  libraryAssetIsVideo,
  libraryAssetPreview,
  libraryAssetPurposeLabel,
} from '~/composables/marketing/useMediaLibrary'

const props = defineProps<{
  open: boolean
  assets: LibraryAssetRow[]
  previewItems: MediaAssetDeletePreviewItem[]
  loadingPreview?: boolean
  deleting?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'confirm': []
}>()

const openProxy = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

const count = computed(() => props.assets.length)
const blockedItems = computed(() => props.previewItems.filter(item => item.linkedPostCount > 0 || (item.cmsUsageCount ?? 0) > 0))
const canDelete = computed(() => !props.loadingPreview && blockedItems.value.length === 0 && count.value > 0)

const title = computed(() => {
  if (count.value <= 1)
    return `Excluir “${props.assets[0]?.name || 'arquivo'}”?`
  return `Excluir ${count.value} arquivos?`
})

function previewForAsset(asset: LibraryAssetRow): MediaAssetDeletePreviewItem | undefined {
  return props.previewItems.find(item => item.id === asset.id)
}

function onOpenChange(value: boolean) {
  if (!value && !props.deleting)
    openProxy.value = false
}
</script>

<template>
  <AlertDialog :open="openProxy" @update:open="onOpenChange">
    <AlertDialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-xl">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ title }}</AlertDialogTitle>
        <AlertDialogDescription>
          Esta ação não pode ser desfeita. Os arquivos serão removidos permanentemente da biblioteca.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div class="space-y-4">
        <div
          v-if="loadingPreview"
          class="space-y-3"
        >
          <div class="flex items-center gap-2 border rounded-lg border-dashed p-4 text-sm text-muted-foreground">
            <Icon name="lucide:loader-circle" class="h-4 w-4 animate-spin" />
            Verificando vínculos com publicações…
          </div>
          <div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
            <div
              v-for="index in Math.min(count || 3, 8)"
              :key="`preview-skeleton-${index}`"
              class="overflow-hidden border rounded-lg"
            >
              <div class="aspect-square media-skeleton-shimmer" />
              <div class="h-5 w-full media-skeleton-shimmer" />
            </div>
          </div>
        </div>

        <div
          v-else-if="blockedItems.length"
          class="border border-destructive/30 rounded-lg bg-destructive/5 p-4 text-sm"
        >
          <p class="text-destructive font-medium">
            Alguns arquivos estão em uso
          </p>
          <ul class="mt-2 text-muted-foreground space-y-2">
            <li v-for="item in blockedItems" :key="item.id">
              <span class="text-foreground font-medium">{{ item.name }}</span>
              <template v-if="item.linkedPostCount > 0">
                · {{ item.linkedPostCount }} post(s) social(is)
              </template>
              <template v-if="(item.cmsUsageCount ?? 0) > 0">
                · {{ item.cmsUsageCount }} uso(s) no site
              </template>
              <span v-if="item.linkedPosts.length">
                — ex.: {{ item.linkedPosts.map(post => post.title || 'Sem título').join(', ') }}
              </span>
            </li>
          </ul>
          <p class="mt-2 text-xs">
            Remova os vínculos nos conteúdos antes de tentar excluir novamente.
          </p>
        </div>

        <div
          v-else
          class="border border-amber-500/30 rounded-lg bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-300"
        >
          Verifique os arquivos selecionados antes de confirmar. Arquivos em uso em publicações não podem ser excluídos.
        </div>

        <div
          v-if="!loadingPreview"
          class="grid grid-cols-3 max-h-48 gap-2 overflow-y-auto sm:grid-cols-4"
        >
          <div
            v-for="asset in assets"
            :key="asset.id"
            class="overflow-hidden border rounded-lg bg-muted/40"
          >
            <div class="aspect-square overflow-hidden bg-muted">
              <img
                v-if="libraryAssetIsImage(asset)"
                :src="previewForAsset(asset)?.previewUrl || libraryAssetPreview(asset) || undefined"
                :alt="asset.name"
                class="h-full w-full object-cover"
              >
              <div v-else class="h-full flex items-center justify-center">
                <Icon
                  :name="libraryAssetIsVideo(asset) ? 'lucide:file-video' : 'lucide:file-text'"
                  class="h-8 w-8 text-muted-foreground"
                />
              </div>
            </div>
            <p class="truncate px-2 py-1 text-[11px] font-medium" :title="asset.name">
              {{ asset.name }}
            </p>
          </div>
        </div>

        <ul
          v-if="!loadingPreview"
          class="max-h-32 overflow-y-auto text-sm space-y-1"
        >
          <li
            v-for="asset in assets"
            :key="`name-${asset.id}`"
            class="flex items-center justify-between gap-2"
          >
            <span class="truncate">{{ asset.name }}</span>
            <Badge variant="secondary" class="shrink-0 text-[10px]">
              {{ libraryAssetPurposeLabel(asset.purpose) }}
            </Badge>
          </li>
        </ul>
      </div>

      <AlertDialogFooter>
        <Button
          type="button"
          variant="outline"
          :disabled="deleting"
          @click="openProxy = false"
        >
          Cancelar
        </Button>
        <Button
          type="button"
          variant="destructive"
          :disabled="!canDelete || deleting"
          @click="emit('confirm')"
        >
          <Icon v-if="deleting" name="lucide:loader-circle" class="mr-2 h-4 w-4 animate-spin" />
          {{ deleting ? 'Excluindo…' : count > 1 ? `Excluir ${count} arquivos` : 'Excluir arquivo' }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
