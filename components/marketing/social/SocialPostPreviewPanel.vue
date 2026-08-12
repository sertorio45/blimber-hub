<script setup lang="ts">
import type { SocialPlatform } from '~/types/marketing-social'
import { platformIcon } from '~/utils/marketing-social-preview'
import { buildCaptionWithHashtags } from '~/utils/social-hashtags'

const props = withDefaults(defineProps<{
  caption: string
  hashtags?: string[]
  platform?: SocialPlatform
  accountName?: string
  mediaUrl?: string | null
  mediaType?: 'image' | 'video' | null
  linkUrl?: string | null
}>(), {
  hashtags: () => [],
  platform: 'facebook',
  accountName: 'Sua página',
  mediaUrl: null,
  mediaType: null,
  linkUrl: null,
})

const activePlatform = ref<SocialPlatform>(props.platform)

watch(() => props.platform, (value) => {
  activePlatform.value = value
})

const fullText = computed(() => buildCaptionWithHashtags(props.caption, props.hashtags))

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
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-2">
      <p class="text-sm font-medium">
        Pré-visualização
      </p>
      <div v-if="platformTabs.length > 1" class="flex gap-1 rounded-lg bg-muted p-0.5">
        <button
          v-for="tab in platformTabs"
          :key="tab"
          type="button"
          class="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors"
          :class="activePlatform === tab ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          @click="activePlatform = tab"
        >
          <Icon :name="platformIcon(tab)" class="h-3.5 w-3.5" />
          {{ tab === 'facebook' ? 'Facebook' : tab === 'instagram' ? 'Instagram' : 'LinkedIn' }}
        </button>
      </div>
    </div>

    <div
      class="overflow-hidden border rounded-xl bg-background shadow-sm"
      :class="activePlatform === 'instagram' ? 'max-w-sm mx-auto' : ''"
    >
      <div class="flex items-center gap-2.5 border-b px-3 py-2.5">
        <div class="h-9 w-9 flex shrink-0 items-center justify-center rounded-full bg-muted">
          <Icon :name="platformIcon(activePlatform)" class="h-4 w-4 text-muted-foreground" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold leading-tight">
            {{ accountName }}
          </p>
          <p class="text-xs text-muted-foreground">
            Agora · {{ platformLabel }}
          </p>
        </div>
        <Icon name="lucide:more-horizontal" class="h-4 w-4 text-muted-foreground" />
      </div>

      <div v-if="fullText" class="px-3 pt-3">
        <p class="whitespace-pre-wrap text-sm leading-relaxed">
          {{ fullText }}
        </p>
      </div>

      <div
        v-if="mediaUrl"
        class="mt-3 overflow-hidden bg-muted"
        :class="activePlatform === 'instagram' ? 'aspect-square' : 'aspect-[1.91/1]'"
      >
        <video
          v-if="mediaType === 'video'"
          :src="mediaUrl"
          class="h-full w-full object-cover"
          muted
          playsinline
        />
        <img
          v-else
          :src="mediaUrl"
          alt="Prévia da mídia"
          class="h-full w-full object-cover"
        >
      </div>
      <div
        v-else
        class="mx-3 mt-3 aspect-[1.91/1] flex items-center justify-center border rounded-lg border-dashed bg-muted/40"
      >
        <div class="text-center text-muted-foreground">
          <Icon name="lucide:image" class="mx-auto mb-1 h-6 w-6 opacity-50" />
          <p class="text-xs">
            Mídia aparecerá na etapa de planejamento
          </p>
        </div>
      </div>

      <div
        v-if="linkUrl"
        class="mx-3 mb-3 mt-2 overflow-hidden border rounded-lg bg-muted/30"
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

      <div class="flex items-center justify-between border-t px-3 py-2 text-muted-foreground">
        <div class="flex gap-4">
          <Icon name="lucide:heart" class="h-4 w-4" />
          <Icon name="lucide:message-circle" class="h-4 w-4" />
          <Icon name="lucide:send" class="h-4 w-4" />
        </div>
        <Icon name="lucide:bookmark" class="h-4 w-4" />
      </div>
    </div>
  </div>
</template>
