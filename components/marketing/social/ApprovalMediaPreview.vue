<script setup lang="ts">
import {
  isImageAsset,
  isVideoAsset,
  previewUrl,
  type SocialPreviewAsset,
} from '@/utils/marketing-social-preview'

export interface MediaAnchorPin {
  id?: string
  xPercent: number
  yPercent: number
  slideIndex?: number | null
  mediaTimeMs?: number | null
  body?: string
}

const props = defineProps<{
  assets: SocialPreviewAsset[]
  format?: string | null
  annotate?: boolean
  pins?: MediaAnchorPin[]
}>()

const emit = defineEmits<{
  pin: [payload: {
    anchorType: 'image' | 'carousel' | 'video'
    xPercent: number | null
    yPercent: number | null
    slideIndex: number | null
    mediaTimeMs: number | null
  }]
  'update:slideIndex': [index: number]
}>()

const index = ref(0)
const videoRef = ref<HTMLVideoElement | null>(null)

watch(() => props.assets, () => {
  index.value = 0
})

watch(index, (value) => {
  emit('update:slideIndex', value)
})

const current = computed(() => props.assets[index.value] || null)
const isCarousel = computed(() => props.assets.length > 1 || props.format === 'carousel')

const visiblePins = computed(() =>
  (props.pins || []).filter((pin) => {
    if (pin.slideIndex == null)
      return true
    return Number(pin.slideIndex) === index.value
  }),
)

function onMediaClick(event: MouseEvent) {
  if (!props.annotate || !current.value)
    return
  const target = event.currentTarget as HTMLElement | null
  if (!target)
    return
  const rect = target.getBoundingClientRect()
  if (!rect.width || !rect.height)
    return
  const xPercent = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100))
  const yPercent = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100))

  if (isVideoAsset(current.value)) {
    const ms = Math.round((videoRef.value?.currentTime || 0) * 1000)
    emit('pin', {
      anchorType: 'video',
      xPercent,
      yPercent,
      slideIndex: null,
      mediaTimeMs: ms,
    })
    return
  }

  emit('pin', {
    anchorType: isCarousel.value ? 'carousel' : 'image',
    xPercent,
    yPercent,
    slideIndex: isCarousel.value ? index.value : null,
    mediaTimeMs: null,
  })
}
</script>

<template>
  <div class="overflow-hidden rounded-xl border bg-muted">
    <div
      class="relative flex min-h-[240px] items-center justify-center bg-black/5 sm:min-h-[360px]"
      :class="annotate ? 'cursor-crosshair' : ''"
      @click="onMediaClick"
    >
      <template v-if="current">
        <img
          v-if="isImageAsset(current) && previewUrl(current)"
          :src="previewUrl(current)!"
          :alt="current.name || 'Preview'"
          class="pointer-events-none max-h-[70vh] w-full object-contain"
          draggable="false"
        >
        <video
          v-else-if="isVideoAsset(current) && previewUrl(current)"
          ref="videoRef"
          :src="previewUrl(current)!"
          class="max-h-[70vh] w-full"
          controls
          playsinline
          @click.stop
        />
        <div v-else class="flex flex-col items-center gap-2 p-8 text-muted-foreground">
          <Icon name="lucide:image-off" class="h-10 w-10" />
          <p class="text-sm">
            Mídia indisponível
          </p>
        </div>
      </template>
      <div v-else class="flex flex-col items-center gap-2 p-8 text-muted-foreground">
        <Icon name="lucide:image-off" class="h-10 w-10" />
        <p class="text-sm">
          Sem preview nesta versão
        </p>
      </div>

      <button
        v-for="(pin, pinIndex) in visiblePins"
        :key="pin.id || `${pin.xPercent}-${pin.yPercent}-${pinIndex}`"
        type="button"
        class="absolute z-10 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-background bg-primary text-[10px] font-semibold text-primary-foreground shadow"
        :style="{ left: `${pin.xPercent}%`, top: `${pin.yPercent}%` }"
        :title="pin.body || 'Comentário'"
        @click.stop
      >
        {{ pinIndex + 1 }}
      </button>

      <template v-if="isCarousel && assets.length > 1">
        <Button
          type="button"
          size="icon"
          variant="secondary"
          aria-label="Slide anterior"
          class="absolute left-2 top-1/2 z-30 h-11 w-11 -translate-y-1/2 rounded-full border border-border/60 bg-background/90 text-foreground shadow-md hover:bg-background hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 sm:h-10 sm:w-10"
          :disabled="index === 0"
          @click.stop="index = Math.max(0, index - 1)"
        >
          <Icon name="lucide:chevron-left" class="h-6 w-6" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          aria-label="Próximo slide"
          class="absolute right-2 top-1/2 z-30 h-11 w-11 -translate-y-1/2 rounded-full border border-border/60 bg-background/90 text-foreground shadow-md hover:bg-background hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 sm:h-10 sm:w-10"
          :disabled="index >= assets.length - 1"
          @click.stop="index = Math.min(assets.length - 1, index + 1)"
        >
          <Icon name="lucide:chevron-right" class="h-6 w-6" />
        </Button>
        <div class="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-1.5">
          <span
            v-for="(_, i) in assets"
            :key="i"
            class="h-1.5 w-1.5 rounded-full"
            :class="i === index ? 'bg-primary' : 'bg-muted-foreground/40'"
          />
        </div>
      </template>
    </div>
    <div class="flex items-center justify-between gap-2 border-t bg-background px-3 py-2 text-xs text-muted-foreground">
      <span class="truncate">
        {{ current?.name || 'Preview' }}
        <span v-if="isCarousel"> · {{ index + 1 }}/{{ assets.length }}</span>
      </span>
      <span v-if="annotate" class="shrink-0 text-primary">
        Clique na arte para marcar
      </span>
    </div>
  </div>
</template>
