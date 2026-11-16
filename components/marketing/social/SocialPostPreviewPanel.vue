<script setup lang="ts">
import type { SocialPlatform, SocialPostFormat } from '~/types/marketing-social'
import {
  aspectRatioLabel,
  platformIcon,
  previewFormatBadge,
  probeMediaSize,
  resolveDisplayAspectRatio,
  type PreviewMediaItem,
  type ProbedMediaSize,
} from '~/utils/marketing-social-preview'
import { buildCaptionWithHashtags } from '~/utils/social-hashtags'

const props = withDefaults(defineProps<{
  caption: string
  hashtags?: string[]
  platform?: SocialPlatform
  accountName?: string
  /** @deprecated Prefer mediaItems for carousel / multi-asset previews. */
  mediaUrl?: string | null
  mediaType?: 'image' | 'video' | null
  mediaWidth?: number | null
  mediaHeight?: number | null
  mediaItems?: PreviewMediaItem[]
  format?: SocialPostFormat | null
  linkUrl?: string | null
  showEmptyMedia?: boolean
}>(), {
  hashtags: () => [],
  platform: 'facebook',
  accountName: 'Sua página',
  mediaUrl: null,
  mediaType: null,
  mediaWidth: null,
  mediaHeight: null,
  mediaItems: () => [],
  format: null,
  linkUrl: null,
  showEmptyMedia: false,
})

const activePlatform = ref<SocialPlatform>(props.platform)
const slideIndex = ref(0)
const touchStartX = ref<number | null>(null)
/** Intrinsic sizes probed from the media URL when asset metadata is missing. */
const probedSizes = ref<Record<string, ProbedMediaSize>>({})

watch(() => props.platform, (value) => {
  activePlatform.value = value
})

const mediaList = computed<PreviewMediaItem[]>(() => {
  if (props.mediaItems?.length)
    return props.mediaItems.filter(item => Boolean(item.url))
  if (props.mediaUrl) {
    return [{
      url: props.mediaUrl,
      type: props.mediaType === 'video' ? 'video' : 'image',
      width: props.mediaWidth,
      height: props.mediaHeight,
    }]
  }
  return []
})

watch(mediaList, () => {
  slideIndex.value = 0
}, { deep: true })

watch(
  mediaList,
  async (items) => {
    await Promise.all(items.map(async (item) => {
      const knownWidth = Number(item.width)
      const knownHeight = Number(item.height)
      if (Number.isFinite(knownWidth) && Number.isFinite(knownHeight) && knownWidth > 0 && knownHeight > 0)
        return
      if (probedSizes.value[item.url])
        return

      const probed = await probeMediaSize(item.url, item.type)
      if (!probed)
        return
      probedSizes.value = {
        ...probedSizes.value,
        [item.url]: probed,
      }
    }))
  },
  { immediate: true, deep: true },
)

const currentMedia = computed(() => mediaList.value[slideIndex.value] || null)

function resolveMediaSize(item: PreviewMediaItem | null): ProbedMediaSize | null {
  if (!item)
    return null
  const metaWidth = Number(item.width)
  const metaHeight = Number(item.height)
  if (Number.isFinite(metaWidth) && Number.isFinite(metaHeight) && metaWidth > 0 && metaHeight > 0)
    return { width: metaWidth, height: metaHeight }
  return probedSizes.value[item.url] || null
}

const currentMediaSize = computed(() => resolveMediaSize(currentMedia.value))

const fullText = computed(() => buildCaptionWithHashtags(props.caption, props.hashtags))

const hasPreviewContent = computed(() =>
  Boolean(fullText.value.trim() || mediaList.value.length || props.linkUrl),
)

const platformLabel = computed(() => ({
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
})[activePlatform.value])

const platformTabs = computed(() => {
  const tabs: SocialPlatform[] = ['facebook', 'instagram']
  if (props.platform === 'linkedin')
    tabs.push('linkedin')
  return tabs
})

const linkHostname = computed(() => {
  if (!props.linkUrl)
    return ''
  try {
    return new URL(props.linkUrl).hostname
  }
  catch {
    return props.linkUrl
  }
})

const captionLength = computed(() => fullText.value.length)

const platformMaxChars: Record<SocialPlatform, number> = {
  facebook: 63206,
  instagram: 2200,
  linkedin: 3000,
}

const captionStatus = computed(() => {
  const max = platformMaxChars[activePlatform.value]
  if (captionLength.value > max)
    return 'over'
  if (captionLength.value > max * 0.9)
    return 'warning'
  return 'ok'
})

const isStoryPreview = computed(() => props.format === 'story')
const isReelsPreview = computed(() =>
  props.format === 'video' && activePlatform.value === 'instagram',
)
const isPhonePreview = computed(() => isStoryPreview.value || isReelsPreview.value)
const isCarouselPreview = computed(() =>
  props.format === 'carousel' || mediaList.value.length > 1,
)

const mediaAspectRatio = computed(() => {
  // Stories / Reels keep a phone chrome; feed/carousel use the probed intrinsic ratio.
  if (isPhonePreview.value) {
    return resolveDisplayAspectRatio({
      format: props.format,
      platform: activePlatform.value,
      width: null,
      height: null,
    })
  }
  return resolveDisplayAspectRatio({
    format: props.format,
    platform: activePlatform.value,
    width: currentMediaSize.value?.width ?? props.mediaWidth,
    height: currentMediaSize.value?.height ?? props.mediaHeight,
  })
})

const mediaAspectStyle = computed(() => ({
  aspectRatio: String(mediaAspectRatio.value),
}))

/** Label always reflects the real media when probed, even inside a 9:16 phone frame. */
const ratioLabel = computed(() => {
  const size = currentMediaSize.value
  if (size)
    return aspectRatioLabel(size.width / size.height)
  return aspectRatioLabel(mediaAspectRatio.value)
})

const sizeLabel = computed(() => {
  const size = currentMediaSize.value
  if (!size)
    return ratioLabel.value
  return `${size.width}×${size.height} · ${ratioLabel.value}`
})

const formatBadge = computed(() => previewFormatBadge({
  format: props.format,
  platform: activePlatform.value,
  mediaCount: mediaList.value.length,
  aspectLabel: sizeLabel.value,
}))

const mediaObjectClass = computed(() => {
  if (isPhonePreview.value || mediaAspectRatio.value < 0.85)
    return 'object-contain'
  return 'object-cover'
})

function onMediaElementLoad(event: Event) {
  const el = event.target as HTMLImageElement | HTMLVideoElement | null
  if (!el || !currentMedia.value)
    return

  let width = 0
  let height = 0
  if (el instanceof HTMLVideoElement) {
    width = el.videoWidth
    height = el.videoHeight
  }
  else {
    width = el.naturalWidth
    height = el.naturalHeight
  }
  if (!(width > 0 && height > 0))
    return

  const url = currentMedia.value.url
  const previous = probedSizes.value[url]
  if (previous?.width === width && previous?.height === height)
    return

  probedSizes.value = {
    ...probedSizes.value,
    [url]: { width, height },
  }
}

function goToSlide(index: number) {
  if (!mediaList.value.length)
    return
  slideIndex.value = Math.min(mediaList.value.length - 1, Math.max(0, index))
}

function onTouchStart(event: TouchEvent) {
  touchStartX.value = event.changedTouches[0]?.clientX ?? null
}

function onTouchEnd(event: TouchEvent) {
  if (touchStartX.value == null || mediaList.value.length < 2)
    return
  const endX = event.changedTouches[0]?.clientX ?? touchStartX.value
  const delta = endX - touchStartX.value
  touchStartX.value = null
  if (Math.abs(delta) < 40)
    return
  if (delta < 0)
    goToSlide(slideIndex.value + 1)
  else
    goToSlide(slideIndex.value - 1)
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-2">
      <p class="text-sm font-medium">
        Pré-visualização
      </p>
      <div class="flex items-center gap-2">
        <span
          v-if="hasPreviewContent"
          class="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          {{ formatBadge }}
        </span>
        <div v-if="captionStatus !== 'ok'" class="flex items-center gap-1.5">
          <Icon
            :name="captionStatus === 'over' ? 'lucide:alert-circle' : 'lucide:alert-triangle'"
            class="h-3.5 w-3.5"
            :class="captionStatus === 'over' ? 'text-destructive' : 'text-orange-500'"
          />
          <span
            class="text-xs"
            :class="captionStatus === 'over' ? 'text-destructive' : 'text-orange-500'"
          >
            {{ captionLength }}/{{ platformMaxChars[activePlatform].toLocaleString('pt-BR') }}
          </span>
        </div>
      </div>
    </div>

    <div
      v-if="!hasPreviewContent"
      class="flex flex-col items-center justify-center gap-3 border rounded-xl border-dashed bg-muted/20 px-6 py-10 text-center"
    >
      <div class="h-11 w-11 flex items-center justify-center rounded-full bg-muted">
        <Icon name="lucide:eye" class="h-5 w-5 text-muted-foreground" />
      </div>
      <div class="space-y-1">
        <p class="text-sm font-medium">
          Sem prévia ainda
        </p>
        <p class="max-w-[220px] text-xs text-muted-foreground">
          Escreva a legenda ou adicione mídia na etapa de planejamento para ver o post aqui.
        </p>
      </div>
    </div>

    <template v-else>
      <div v-if="platformTabs.length > 1" class="flex gap-1 rounded-lg bg-muted p-1">
        <button
          v-for="tab in platformTabs"
          :key="tab"
          type="button"
          class="relative flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200"
          :class="activePlatform === tab
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'"
          @click="activePlatform = tab"
        >
          <Icon :name="platformIcon(tab)" class="h-3.5 w-3.5" />
          {{ tab === 'facebook' ? 'Facebook' : tab === 'instagram' ? 'Instagram' : 'LinkedIn' }}
        </button>
      </div>

      <Transition name="preview-fade" mode="out-in">
        <!-- Stories / Reels phone chrome -->
        <div
          v-if="isPhonePreview"
          :key="`${activePlatform}-phone`"
          class="mx-auto w-full max-w-[280px]"
        >
          <div class="overflow-hidden rounded-[1.75rem] border border-border/80 bg-black shadow-lg ring-1 ring-black/5">
            <div
              class="relative overflow-hidden bg-zinc-950"
              :style="mediaAspectStyle"
              @touchstart.passive="onTouchStart"
              @touchend.passive="onTouchEnd"
            >
              <!-- Stories progress -->
              <div
                v-if="isStoryPreview"
                class="absolute inset-x-3 top-3 z-20 flex gap-1"
              >
                <div
                  v-for="(_, i) in Math.max(mediaList.length, 1)"
                  :key="i"
                  class="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30"
                >
                  <div
                    class="h-full rounded-full bg-white transition-all duration-300"
                    :style="{ width: i <= slideIndex ? '100%' : '0%' }"
                  />
                </div>
              </div>

              <!-- Top account row -->
              <div class="absolute inset-x-0 top-0 z-20 flex items-center gap-2 bg-gradient-to-b from-black/55 to-transparent px-3 pb-8 pt-5">
                <div
                  class="mt-1 h-8 w-8 flex shrink-0 items-center justify-center rounded-full"
                  :class="isStoryPreview
                    ? 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 p-[1.5px]'
                    : 'bg-white/20'"
                >
                  <div class="h-full w-full flex items-center justify-center rounded-full bg-zinc-900">
                    <Icon :name="platformIcon(activePlatform)" class="h-3.5 w-3.5 text-white" />
                  </div>
                </div>
                <div class="mt-1 min-w-0 flex-1">
                  <p class="truncate text-xs font-semibold text-white">
                    {{ accountName }}
                  </p>
                  <p class="text-[10px] text-white/70">
                    {{ isStoryPreview ? 'Stories' : 'Reels' }} · Agora
                  </p>
                </div>
                <Icon name="lucide:more-horizontal" class="mt-1 h-4 w-4 text-white/80" />
              </div>

              <template v-if="currentMedia">
                <video
                  v-if="currentMedia.type === 'video'"
                  :src="currentMedia.url"
                  class="h-full w-full"
                  :class="mediaObjectClass"
                  muted
                  playsinline
                  loop
                  autoplay
                  @loadedmetadata="onMediaElementLoad"
                />
                <img
                  v-else
                  :src="currentMedia.url"
                  alt="Prévia da mídia"
                  class="h-full w-full"
                  :class="mediaObjectClass"
                  draggable="false"
                  @load="onMediaElementLoad"
                >
              </template>
              <div
                v-else-if="showEmptyMedia"
                class="flex h-full w-full items-center justify-center text-white/50"
              >
                <div class="text-center">
                  <Icon name="lucide:image" class="mx-auto mb-2 h-8 w-8 opacity-40" />
                  <p class="text-xs">
                    Mídia na etapa de planejamento
                  </p>
                </div>
              </div>

              <!-- Reels side actions -->
              <div
                v-if="isReelsPreview"
                class="absolute bottom-20 right-2.5 z-20 flex flex-col items-center gap-4 text-white"
              >
                <Icon name="lucide:heart" class="h-6 w-6 drop-shadow" />
                <Icon name="lucide:message-circle" class="h-6 w-6 drop-shadow" />
                <Icon name="lucide:send" class="h-6 w-6 drop-shadow" />
                <Icon name="lucide:bookmark" class="h-6 w-6 drop-shadow" />
              </div>

              <!-- Caption overlay -->
              <div
                v-if="fullText || isStoryPreview"
                class="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-3 pb-4 pt-10"
              >
                <p
                  v-if="fullText && !isStoryPreview"
                  class="line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-white"
                >
                  <span class="font-semibold">{{ accountName }}</span>
                  {{ ' ' }}{{ fullText }}
                </p>
                <p
                  v-else-if="isStoryPreview"
                  class="text-[10px] text-white/70"
                >
                  Stories não exibe legenda na API · {{ ratioLabel }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Feed / carousel mockup -->
        <div
          v-else
          :key="`${activePlatform}-feed`"
          class="overflow-hidden border rounded-xl bg-background shadow-sm"
          :class="activePlatform === 'instagram' ? 'max-w-sm mx-auto' : ''"
        >
          <div class="flex items-center gap-2.5 px-3.5 py-3">
            <div
              class="h-10 w-10 flex shrink-0 items-center justify-center rounded-full"
              :class="activePlatform === 'instagram'
                ? 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 p-0.5'
                : 'bg-muted'"
            >
              <div
                class="h-full w-full flex items-center justify-center rounded-full"
                :class="activePlatform === 'instagram' ? 'bg-background' : ''"
              >
                <Icon :name="platformIcon(activePlatform)" class="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold leading-tight">
                {{ accountName }}
              </p>
              <p class="text-xs text-muted-foreground">
                Agora · {{ platformLabel }}
                <span v-if="isCarouselPreview"> · Carrossel</span>
              </p>
            </div>
            <Icon name="lucide:more-horizontal" class="h-4 w-4 text-muted-foreground" />
          </div>

          <div
            v-if="activePlatform !== 'instagram' && fullText"
            class="px-3.5 pb-2"
          >
            <p class="whitespace-pre-wrap text-sm leading-relaxed">
              {{ fullText }}
            </p>
          </div>

          <div
            v-if="mediaList.length"
            class="relative overflow-hidden bg-muted"
            :style="mediaAspectStyle"
            @touchstart.passive="onTouchStart"
            @touchend.passive="onTouchEnd"
          >
            <Transition name="slide-fade" mode="out-in">
              <video
                v-if="currentMedia?.type === 'video'"
                :key="`video-${slideIndex}`"
                :src="currentMedia.url"
                class="absolute inset-0 h-full w-full"
                :class="mediaObjectClass"
                muted
                playsinline
                controls
                @loadedmetadata="onMediaElementLoad"
              />
              <img
                v-else-if="currentMedia"
                :key="`image-${slideIndex}`"
                :src="currentMedia.url"
                alt="Prévia da mídia"
                class="absolute inset-0 h-full w-full"
                :class="mediaObjectClass"
                draggable="false"
                @load="onMediaElementLoad"
              >
            </Transition>

            <template v-if="isCarouselPreview && mediaList.length > 1">
              <div class="absolute right-2 top-2 z-20 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
                {{ slideIndex + 1 }}/{{ mediaList.length }}
              </div>
              <button
                type="button"
                class="absolute left-2 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow transition hover:bg-background disabled:opacity-30"
                :disabled="slideIndex === 0"
                aria-label="Slide anterior"
                @click="goToSlide(slideIndex - 1)"
              >
                <Icon name="lucide:chevron-left" class="h-4 w-4" />
              </button>
              <button
                type="button"
                class="absolute right-2 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow transition hover:bg-background disabled:opacity-30"
                :disabled="slideIndex >= mediaList.length - 1"
                aria-label="Próximo slide"
                @click="goToSlide(slideIndex + 1)"
              >
                <Icon name="lucide:chevron-right" class="h-4 w-4" />
              </button>
              <div class="absolute bottom-2.5 left-1/2 z-20 flex -translate-x-1/2 gap-1.5">
                <button
                  v-for="(_, i) in mediaList"
                  :key="i"
                  type="button"
                  class="h-1.5 rounded-full transition-all"
                  :class="i === slideIndex ? 'w-4 bg-primary' : 'w-1.5 bg-white/70'"
                  :aria-label="`Ir para slide ${i + 1}`"
                  @click="goToSlide(i)"
                />
              </div>
            </template>
          </div>
          <div
            v-else-if="showEmptyMedia"
            class="mx-3.5 mb-3 flex items-center justify-center border rounded-lg border-dashed bg-muted/30"
            :style="mediaAspectStyle"
          >
            <div class="text-center text-muted-foreground">
              <Icon name="lucide:image" class="mx-auto mb-2 h-8 w-8 opacity-40" />
              <p class="text-xs">
                Mídia na etapa de planejamento
              </p>
            </div>
          </div>

          <div
            v-if="activePlatform === 'instagram' && fullText"
            class="px-3.5 pb-1 pt-2"
          >
            <p class="whitespace-pre-wrap text-sm leading-relaxed">
              <span class="font-semibold">{{ accountName }}</span>
              {{ ' ' }}{{ fullText }}
            </p>
          </div>

          <div
            v-if="linkUrl"
            class="mx-3.5 mb-3 mt-2 overflow-hidden border rounded-lg bg-muted/30"
          >
            <div class="px-3 py-2">
              <p class="truncate text-xs text-muted-foreground uppercase">
                {{ linkHostname }}
              </p>
              <p class="truncate text-sm font-medium">
                {{ linkUrl }}
              </p>
            </div>
          </div>

          <div class="flex items-center justify-between border-t px-3.5 py-2.5 text-muted-foreground">
            <div class="flex gap-5">
              <button type="button" class="flex items-center gap-1.5 transition-colors hover:text-red-500">
                <Icon name="lucide:heart" class="h-[18px] w-[18px]" />
                <span v-if="activePlatform !== 'instagram'" class="text-xs">Curtir</span>
              </button>
              <button type="button" class="flex items-center gap-1.5 transition-colors hover:text-foreground">
                <Icon name="lucide:message-circle" class="h-[18px] w-[18px]" />
                <span v-if="activePlatform !== 'instagram'" class="text-xs">Comentar</span>
              </button>
              <button type="button" class="flex items-center gap-1.5 transition-colors hover:text-foreground">
                <Icon name="lucide:send" class="h-[18px] w-[18px]" />
                <span v-if="activePlatform === 'linkedin'" class="text-xs">Enviar</span>
              </button>
            </div>
            <button type="button" class="transition-colors hover:text-foreground">
              <Icon name="lucide:bookmark" class="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </Transition>
    </template>
  </div>
</template>

<style scoped>
.preview-fade-enter-active,
.preview-fade-leave-active {
  transition: all 0.2s ease-out;
}
.preview-fade-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
.preview-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: opacity 0.18s ease;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
}
</style>
