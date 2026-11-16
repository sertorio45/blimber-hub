<script setup lang="ts">
import type { WhatsAppMessage } from '~/types/whatsapp'

import MessageBubble from '~/components/whatsapp/conversations/MessageBubble.vue'
import { Skeleton } from '~/components/ui/skeleton'

const props = defineProps<{
  messages: WhatsAppMessage[]
  loading?: boolean
  isGroup?: boolean
}>()

const emit = defineEmits<{
  reply: [message: WhatsAppMessage]
  react: [payload: { message: WhatsAppMessage, emoji: string }]
}>()

const listRef = ref<HTMLElement | null>(null)

const messagesById = computed(() => {
  const map = new Map<string, WhatsAppMessage>()
  for (const message of props.messages)
    map.set(message.id, message)
  return map
})

function quotedFor(message: WhatsAppMessage) {
  if (!message.replyToId)
    return null
  return messagesById.value.get(message.replyToId) || null
}

function scrollToBottom() {
  nextTick(() => {
    if (listRef.value)
      listRef.value.scrollTop = listRef.value.scrollHeight
  })
}

watch(() => props.messages.length, scrollToBottom)

onMounted(scrollToBottom)
</script>

<template>
  <div ref="listRef" class="relative min-h-0 flex-1 overflow-y-auto px-4 py-4">
    <div
      v-if="loading && !messages.length"
      class="space-y-4"
    >
      <Skeleton v-for="i in 4" :key="i" class="h-12 w-2/3" :class="i % 2 ? 'ml-auto' : ''" />
    </div>
    <div
      v-else-if="!messages.length"
      class="flex h-full min-h-[200px] items-center justify-center text-sm text-muted-foreground"
    >
      Nenhuma mensagem ainda
    </div>
    <div v-else class="flex flex-col gap-3">
      <MessageBubble
        v-for="message in messages"
        :key="message.id"
        :message="message"
        :quoted-message="quotedFor(message)"
        :show-participant="isGroup"
        @reply="emit('reply', $event)"
        @react="emit('react', $event)"
      />
    </div>

    <div
      v-if="loading && messages.length"
      class="pointer-events-none absolute inset-x-4 top-2 flex justify-center"
    >
      <span class="rounded-full bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm">
        Atualizando...
      </span>
    </div>
  </div>
</template>
