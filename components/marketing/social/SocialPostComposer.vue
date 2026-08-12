<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
import {
  buildCaptionWithHashtags,
  formatHashtagsInline,
  normalizeHashtag,
} from '~/utils/social-hashtags'

const props = withDefaults(defineProps<{
  modelValue: string
  hashtags?: string[]
  placeholder?: string
  maxlength?: number
  suggestedHashtags?: string[]
  disabled?: boolean
  textareaClass?: HTMLAttributes['class']
}>(), {
  hashtags: () => [],
  placeholder: 'Escreva a legenda que será publicada nas redes sociais...',
  maxlength: 10000,
  suggestedHashtags: () => [],
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:hashtags': [value: string[]]
  'insertLink': []
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const emojiOpen = ref(false)
const hashtagOpen = ref(false)
const formatOpen = ref(false)
const hashtagQuery = ref('')
const isFocused = ref(false)

const characterCount = computed(() => {
  const tags = formatHashtagsInline(props.hashtags)
  return `${props.modelValue}${tags ? ` ${tags}` : ''}`.length
})

const characterPercent = computed(() => Math.min(100, (characterCount.value / props.maxlength) * 100))

const characterColor = computed(() => {
  if (characterPercent.value > 95) return 'text-destructive'
  if (characterPercent.value > 80) return 'text-orange-500'
  return 'text-muted-foreground'
})

const ringCircumference = 62.83
const ringOffset = computed(() => ringCircumference - (characterPercent.value / 100) * ringCircumference)

const filteredSuggestions = computed(() => {
  const query = hashtagQuery.value.trim().replace(/^#/, '').toLowerCase()
  const pool = [...new Set([
    ...props.suggestedHashtags.map(normalizeHashtag),
    ...props.hashtags.map(normalizeHashtag),
  ])].filter(Boolean)

  if (!query)
    return pool.slice(0, 12)

  return pool
    .filter(tag => tag.replace(/^#/, '').toLowerCase().includes(query))
    .slice(0, 12)
})

const previewText = computed(() => buildCaptionWithHashtags(props.modelValue, props.hashtags))

const emojiGroups: Array<{ label: string, emojis: string[] }> = [
  {
    label: 'Frequentes',
    emojis: ['😀', '😂', '🥰', '😍', '🙌', '👏', '🔥', '✨', '💯', '❤️', '👍', '🎉'],
  },
  {
    label: 'Negócios',
    emojis: ['📣', '📈', '💼', '🏨', '🌴', '☀️', '🍽️', '✈️', '🎯', '💡', '🤝', '📍'],
  },
  {
    label: 'Símbolos',
    emojis: ['✅', '⭐', '💬', '🔗', '📸', '🎬', '🛎️', '🏆', '🌟', '➡️', '▶️', '💚'],
  },
]

function focusTextarea() {
  textareaRef.value?.focus()
}

function getSelectionBounds() {
  const el = textareaRef.value
  if (!el)
    return { start: props.modelValue.length, end: props.modelValue.length }
  return { start: el.selectionStart ?? props.modelValue.length, end: el.selectionEnd ?? props.modelValue.length }
}

function insertAtCursor(text: string) {
  const { start, end } = getSelectionBounds()
  const next = `${props.modelValue.slice(0, start)}${text}${props.modelValue.slice(end)}`
  emit('update:modelValue', next.slice(0, props.maxlength))

  nextTick(() => {
    const el = textareaRef.value
    if (!el)
      return
    const cursor = start + text.length
    el.focus()
    el.setSelectionRange(cursor, cursor)
  })
}

function insertEmoji(emoji: string) {
  insertAtCursor(emoji)
  emojiOpen.value = false
}

function insertHashtag(tag: string) {
  const normalized = normalizeHashtag(tag)
  const current = new Set(props.hashtags.map(normalizeHashtag))
  if (!current.has(normalized)) {
    emit('update:hashtags', [...current, normalized].slice(0, 30))
  }
  hashtagQuery.value = ''
  hashtagOpen.value = false
  focusTextarea()
}

function addHashtagFromQuery() {
  const raw = hashtagQuery.value.trim()
  if (!raw)
    return
  insertHashtag(raw)
}

function removeHashtag(tag: string) {
  emit('update:hashtags', props.hashtags.filter(item => normalizeHashtag(item) !== normalizeHashtag(tag)))
}

function applyTextTransform(mode: 'upper' | 'lower' | 'capitalize') {
  const { start, end } = getSelectionBounds()
  const selected = props.modelValue.slice(start, end)
  const target = selected || props.modelValue
  let transformed = target

  if (mode === 'upper')
    transformed = target.toUpperCase()
  else if (mode === 'lower')
    transformed = target.toLowerCase()
  else
    transformed = target.replace(/\b\w/g, char => char.toUpperCase())

  if (selected) {
    const next = `${props.modelValue.slice(0, start)}${transformed}${props.modelValue.slice(end)}`
    emit('update:modelValue', next.slice(0, props.maxlength))
  }
  else {
    emit('update:modelValue', transformed.slice(0, props.maxlength))
  }
  formatOpen.value = false
  focusTextarea()
}

function onHashtagKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    addHashtagFromQuery()
  }
}

function onToolbarAction(action: 'emoji' | 'location' | 'link') {
  if (action === 'emoji') {
    emojiOpen.value = true
    return
  }
  if (action === 'location') {
    insertAtCursor(' 📍')
    return
  }
  emit('insertLink')
}
</script>

<template>
  <div class="space-y-2">
    <div
      class="relative overflow-hidden border rounded-xl bg-background transition-all duration-200"
      :class="isFocused ? 'ring-2 ring-primary/20 border-primary/40 shadow-sm' : 'hover:border-border/80'"
    >
      <textarea
        id="social-content"
        ref="textareaRef"
        :value="modelValue"
        :disabled="disabled"
        :maxlength="maxlength"
        :placeholder="placeholder"
        :class="cn(
          'flex min-h-52 w-full resize-none border-0 bg-transparent px-4 py-3 pb-14 text-sm leading-relaxed shadow-none outline-none placeholder:text-muted-foreground/60 focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50',
          textareaClass,
        )"
        @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value.slice(0, maxlength))"
        @focus="isFocused = true"
        @blur="isFocused = false"
      />

      <div
        v-if="hashtags.length"
        class="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-dashed px-4 py-2.5"
      >
        <button
          v-for="tag in hashtags"
          :key="tag"
          type="button"
          class="inline-flex items-center gap-1 rounded-full bg-primary/8 px-2.5 py-0.5 text-xs text-primary transition-all hover:bg-primary/15 hover:shadow-sm active:scale-95"
          :disabled="disabled"
          @click="removeHashtag(tag)"
        >
          <span>{{ normalizeHashtag(tag) }}</span>
          <Icon name="lucide:x" class="h-3 w-3 opacity-60" />
        </button>
      </div>

      <!-- Toolbar inside textarea -->
      <div class="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between px-3 pb-2.5">
        <div class="pointer-events-auto flex items-center gap-0.5">
          <Popover v-model:open="formatOpen">
            <PopoverTrigger as-child>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                class="h-8 px-2 text-xs text-muted-foreground font-semibold hover:text-foreground"
                :disabled="disabled"
                aria-label="Formatação de texto"
              >
                Aa
              </Button>
            </PopoverTrigger>
            <PopoverContent class="w-48 p-2" align="start">
              <p class="mb-2 px-1 text-xs text-muted-foreground">
                Formatação de texto
              </p>
              <div class="space-y-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  class="w-full justify-start"
                  @click="applyTextTransform('capitalize')"
                >
                  Capitalizar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  class="w-full justify-start"
                  @click="applyTextTransform('upper')"
                >
                  MAIÚSCULAS
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  class="w-full justify-start"
                  @click="applyTextTransform('lower')"
                >
                  minúsculas
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div class="pointer-events-auto flex items-center gap-0.5">
          <Popover v-model:open="hashtagOpen">
            <PopoverTrigger as-child>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="h-8 w-8 text-muted-foreground hover:text-foreground"
                :disabled="disabled"
                aria-label="Inserir hashtag"
              >
                <Icon name="lucide:hash" class="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent class="w-72 p-3" align="end">
              <p class="mb-2 text-sm font-medium">
                Hashtags
              </p>
              <Input
                v-model="hashtagQuery"
                placeholder="Buscar ou criar hashtag"
                class="mb-3"
                @keydown="onHashtagKeydown"
              />
              <div v-if="filteredSuggestions.length" class="max-h-40 overflow-y-auto space-y-1">
                <button
                  v-for="tag in filteredSuggestions"
                  :key="tag"
                  type="button"
                  class="w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                  @click="insertHashtag(tag)"
                >
                  {{ tag }}
                </button>
              </div>
              <p v-else class="text-xs text-muted-foreground">
                Digite e pressione Enter para adicionar.
              </p>
              <Button
                v-if="hashtagQuery.trim()"
                type="button"
                size="sm"
                class="mt-3 w-full"
                @click="addHashtagFromQuery"
              >
                Adicionar {{ normalizeHashtag(hashtagQuery) }}
              </Button>
            </PopoverContent>
          </Popover>

          <Popover v-model:open="emojiOpen">
            <PopoverTrigger as-child>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="h-8 w-8 text-muted-foreground hover:text-foreground"
                :disabled="disabled"
                aria-label="Inserir emoji"
              >
                <Icon name="lucide:smile" class="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent class="w-72 p-3" align="end">
              <div v-for="group in emojiGroups" :key="group.label" class="mb-3 last:mb-0">
                <p class="mb-1.5 text-xs text-muted-foreground">
                  {{ group.label }}
                </p>
                <div class="grid grid-cols-6 gap-1">
                  <button
                    v-for="emoji in group.emojis"
                    :key="emoji"
                    type="button"
                    class="h-9 rounded-md text-lg transition-transform hover:bg-muted hover:scale-110 active:scale-95"
                    @click="insertEmoji(emoji)"
                  >
                    {{ emoji }}
                  </button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>

    <!-- Enhanced toolbar with character ring -->
    <div class="flex items-center gap-1.5 rounded-lg bg-muted/30 px-2 py-1.5">
      <TooltipProvider :delay-duration="300">
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-8 w-8 text-muted-foreground hover:text-foreground"
              :disabled="disabled"
              @click="onToolbarAction('emoji')"
            >
              <Icon name="lucide:smile" class="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Emoji</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-8 w-8 text-muted-foreground hover:text-foreground"
              :disabled="disabled"
              @click="onToolbarAction('location')"
            >
              <Icon name="lucide:map-pin" class="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Localização</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-8 w-8 text-muted-foreground hover:text-foreground"
              :disabled="disabled"
              @click="onToolbarAction('link')"
            >
              <Icon name="lucide:link" class="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Link</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-8 w-8 text-muted-foreground hover:text-foreground"
              :disabled="disabled"
              @click="hashtagOpen = true"
            >
              <Icon name="lucide:hash" class="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Hashtag</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div class="ml-auto flex items-center gap-2">
        <!-- SVG progress ring -->
        <svg class="h-5 w-5 -rotate-90" viewBox="0 0 24 24">
          <circle
            cx="12" cy="12" r="10"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="text-muted/50"
          />
          <circle
            cx="12" cy="12" r="10"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            :stroke-dasharray="ringCircumference"
            :stroke-dashoffset="ringOffset"
            :class="characterColor"
            class="transition-all duration-300"
          />
        </svg>
        <span :class="characterColor" class="text-xs tabular-nums transition-colors">
          {{ characterCount.toLocaleString('pt-BR') }}
        </span>
      </div>
    </div>

    <p class="sr-only">
      {{ previewText }}
    </p>
  </div>
</template>
