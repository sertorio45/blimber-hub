<script setup lang="ts">
import type { LibraryAssetRow, MediaLibraryUploadItem } from '~/composables/marketing/useMediaLibrary'
import {
  formatMediaAssetDate,
  formatMediaAssetSize,
  libraryAssetCreatedAt,
  libraryAssetDisplayUrl,
  libraryAssetIsImage,
  libraryAssetIsVideo,
  libraryAssetPurposeLabel,
  libraryAssetSize,
} from '~/composables/marketing/useMediaLibrary'

const props = withDefaults(defineProps<{
  assets: LibraryAssetRow[]
  selectedIds: string[]
  canManage?: boolean
  tenantId?: string | null
  skeletonCount?: number
  uploadingItems?: MediaLibraryUploadItem[]
}>(), {
  canManage: false,
  tenantId: null,
  skeletonCount: 0,
  uploadingItems: () => [],
})

const emit = defineEmits<{
  toggle: [id: string, event?: Event]
  open: [asset: LibraryAssetRow]
}>()

const selectedSet = computed(() => new Set(props.selectedIds))
const loadedImages = reactive<Record<string, boolean>>({})

function isSelected(id: string) {
  return selectedSet.value.has(id)
}

function previewSrc(asset: LibraryAssetRow): string | null {
  return libraryAssetDisplayUrl(asset, props.tenantId)
}

function markImageLoaded(id: string) {
  loadedImages[id] = true
}

function onToggle(id: string, event?: Event) {
  event?.preventDefault()
  event?.stopPropagation()
  emit('toggle', id, event)
}

function fileKindIcon(asset: LibraryAssetRow): string {
  if (libraryAssetIsVideo(asset))
    return 'lucide:file-video'
  if (libraryAssetIsImage(asset))
    return 'lucide:image'
  return 'lucide:file-text'
}
</script>

<template>
  <div
    class="grid grid-cols-2 gap-3 2xl:grid-cols-6 lg:grid-cols-4 sm:grid-cols-3 xl:grid-cols-5"
    :aria-busy="skeletonCount > 0 || uploadingItems.length > 0"
  >
    <div
      v-for="index in skeletonCount"
      :key="`skeleton-${index}`"
      class="overflow-hidden border rounded-xl bg-card shadow-sm"
      aria-hidden="true"
    >
      <div class="aspect-square media-skeleton-shimmer" />
      <div class="p-3 space-y-2">
        <div class="h-4 w-3/4 media-skeleton-shimmer rounded" />
        <div class="h-3 w-1/2 media-skeleton-shimmer rounded" />
        <div class="h-5 w-16 media-skeleton-shimmer rounded-full" />
      </div>
    </div>

    <article
      v-for="item in uploadingItems"
      :key="item.id"
      class="relative overflow-hidden border rounded-xl bg-card shadow-sm"
      aria-busy="true"
      aria-label="Enviando arquivo"
    >
      <div class="relative aspect-square overflow-hidden bg-muted">
        <img
          v-if="item.previewUrl"
          :src="item.previewUrl"
          alt=""
          class="h-full w-full object-cover opacity-50"
        >
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-950/55 text-white">
          <Icon name="lucide:loader-circle" class="h-8 w-8 animate-spin" />
          <p class="text-xs font-medium tracking-wide">
            Enviando…
          </p>
        </div>
      </div>
      <div class="p-3 space-y-1">
        <p class="truncate text-sm font-medium leading-tight" :title="item.name">
          {{ item.name }}
        </p>
        <p class="text-xs text-muted-foreground">
          Processando arquivo
        </p>
      </div>
    </article>

    <article
      v-for="asset in assets"
      :key="asset.id"
      class="group relative overflow-hidden border rounded-xl bg-card shadow-sm transition-all duration-200 hover:shadow-md motion-reduce:transition-none hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
      :class="isSelected(asset.id)
        ? 'ring-[3px] ring-primary ring-offset-2 ring-offset-background'
        : 'ring-1 ring-border hover:ring-foreground/20'"
    >
      <button
        type="button"
        class="absolute inset-0 z-[1] cursor-pointer bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
        :aria-label="`Visualizar ${asset.name}`"
        @click="emit('open', asset)"
      />

      <div
        v-if="canManage"
        class="absolute left-2 top-2 z-20"
      >
        <button
          type="button"
          role="checkbox"
          :aria-checked="isSelected(asset.id)"
          :aria-label="isSelected(asset.id) ? `Desmarcar ${asset.name}` : `Selecionar ${asset.name}`"
          class="h-7 w-7 flex items-center justify-center border-2 rounded-full shadow-[0_0_0_1px_rgba(255,255,255,0.95),0_2px_10px_rgba(0,0,0,0.55)] transition-transform duration-150 active:scale-95 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary focus-visible:ring-offset-background motion-reduce:transition-none"
          :class="isSelected(asset.id)
            ? 'border-white bg-primary text-primary-foreground'
            : 'border-neutral-950 bg-white text-neutral-950'"
          @click="onToggle(asset.id, $event)"
        >
          <Icon
            v-if="isSelected(asset.id)"
            name="lucide:check"
            class="h-3.5 w-3.5"
          />
        </button>
      </div>

      <div class="relative aspect-square overflow-hidden bg-muted">
        <img
          v-if="libraryAssetIsImage(asset) && previewSrc(asset)"
          :src="previewSrc(asset)!"
          :alt="asset.name"
          class="aspect-square h-full w-full object-cover transition-[opacity,transform] duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
          :class="loadedImages[asset.id] ? 'opacity-100' : 'opacity-0'"
          loading="lazy"
          referrerpolicy="no-referrer"
          @load="markImageLoaded(asset.id)"
          @error="markImageLoaded(asset.id)"
        >
        <div
          v-else
          class="h-full flex flex-col items-center justify-center gap-1 bg-muted px-2 text-center"
        >
          <Icon
            :name="fileKindIcon(asset)"
            class="h-10 w-10 text-muted-foreground"
          />
          <p v-if="libraryAssetIsImage(asset)" class="text-[10px] text-muted-foreground">
            Sem prévia
          </p>
        </div>

        <div
          class="pointer-events-none absolute inset-0 transition-colors duration-200 motion-reduce:transition-none"
          :class="isSelected(asset.id)
            ? 'bg-neutral-950/50'
            : 'bg-neutral-950/0 group-hover:bg-neutral-950/25'"
        />

        <div
          v-if="isSelected(asset.id)"
          class="ring-[3px] pointer-events-none absolute inset-0 ring-white ring-inset"
        />
      </div>

      <div class="bg-card p-3 space-y-1">
        <p class="truncate text-sm font-medium leading-tight" :title="asset.name">
          {{ asset.name }}
        </p>
        <p class="text-xs text-muted-foreground">
          {{ formatMediaAssetSize(libraryAssetSize(asset)) }}
          · {{ formatMediaAssetDate(libraryAssetCreatedAt(asset)) }}
        </p>
        <Badge variant="secondary" class="mt-1 text-[10px]">
          {{ libraryAssetPurposeLabel(asset.purpose) }}
        </Badge>
      </div>
    </article>
  </div>
</template>
