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

const captionLength = computed(() => fullText.value.length)

const platformMaxChars: Record<SocialPlatform, number> = {
  facebook: 63206,
  instagram: 2200,
  linkedin: 3000,
}

const captionStatus = computed(() => {
  const max = platformMaxChars[activePlatform.value]
  if (captionLength.value > max) return 'over'
  if (captionLength.value > max * 0.9) return 'warning'
  return 'ok'
})
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-2">
      <p class="text-sm font-medium">
        Pré-visualização
      </p>
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

    <!-- Platform tabs -->
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

    <!-- Post mockup -->
    <Transition name="preview-fade" mode="out-in">
      <div
        :key="activePlatform"
        class="overflow-hidden border rounded-xl bg-background shadow-sm"
        :class="activePlatform === 'instagram' ? 'max-w-sm mx-auto' : ''"
      >
        <!-- Post header -->
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
            </p>
          </div>
          <Icon name="lucide:more-horizontal" class="h-4 w-4 text-muted-foreground" />
        </div>

        <!-- Caption -->
        <div v-if="fullText" class="px-3.5 pb-2">
          <p class="whitespace-pre-wrap text-sm leading-relaxed">
            {{ fullText }}
          </p>
        </div>

        <!-- Media -->
        <div
          v-if="mediaUrl"
          class="overflow-hidden bg-muted"
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
          class="mx-3.5 aspect-[1.91/1] flex items-center justify-center border rounded-lg border-dashed bg-muted/30"
          :class="activePlatform === 'instagram' ? 'aspect-square' : ''"
        >
          <div class="text-center text-muted-foreground">
            <Icon name="lucide:image" class="mx-auto mb-2 h-8 w-8 opacity-40" />
            <p class="text-xs">
              Mídia aparecerá na etapa de planejamento
            </p>
          </div>
        </div>

        <!-- Link preview -->
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

        <!-- Engagement bar -->
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
</style>
