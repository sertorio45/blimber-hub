<script setup lang="ts">
import type { WhatsAppMessage } from '~/types/whatsapp'

import MessageStatusIcon from '~/components/whatsapp/conversations/MessageStatusIcon.vue'
import { Button } from '~/components/ui/button'

const props = defineProps<{
  message: WhatsAppMessage
  quotedMessage?: WhatsAppMessage | null
  showParticipant?: boolean
}>()

const emit = defineEmits<{
  reply: [message: WhatsAppMessage]
  react: [payload: { message: WhatsAppMessage, emoji: string }]
}>()

const inboxStore = useWhatsAppInboxStore()

const reactionEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏']

function formatTime(value?: string | null) {
  if (!value)
    return ''
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

const isImage = computed(() =>
  props.message.messageType === 'image'
  || String(props.message.mediaMime || '').startsWith('image/'),
)
const isVideo = computed(() =>
  props.message.messageType === 'video'
  || String(props.message.mediaMime || '').startsWith('video/'),
)
const isAudio = computed(() =>
  props.message.messageType === 'audio'
  || String(props.message.mediaMime || '').startsWith('audio/'),
)

const reactionSummary = computed(() => {
  const counts = new Map<string, number>()
  for (const reaction of props.message.reactions || []) {
    if (!reaction.emoji)
      continue
    counts.set(reaction.emoji, (counts.get(reaction.emoji) || 0) + 1)
  }
  return Array.from(counts.entries()).map(([emoji, count]) => ({ emoji, count }))
})
</script>

<template>
  <div class="group flex" :class="message.fromMe ? 'justify-end' : 'justify-start'">
    <div class="max-w-[75%] space-y-1">
      <div
        class="rounded-2xl px-4 py-2 text-sm shadow-sm"
        :class="message.fromMe
          ? 'rounded-br-md bg-primary text-primary-foreground'
          : 'rounded-bl-md border bg-card text-foreground'"
      >
        <p
          v-if="showParticipant && !message.fromMe && message.participantName"
          class="mb-1 text-[11px] font-medium opacity-80"
        >
          {{ message.participantName }}
        </p>

        <div
          v-if="quotedMessage || message.quotedExternalId"
          class="mb-2 rounded-md border-l-2 px-2 py-1 text-xs opacity-80"
          :class="message.fromMe ? 'border-primary-foreground/40 bg-primary-foreground/10' : 'border-primary/40 bg-muted/60'"
        >
          <p class="truncate font-medium">
            {{ quotedMessage?.fromMe ? 'Você' : (quotedMessage?.participantName || 'Mensagem') }}
          </p>
          <p class="truncate">
            {{ quotedMessage?.content || 'Mensagem citada' }}
          </p>
        </div>

        <template v-if="message.mediaUrl">
          <img
            v-if="isImage"
            :src="message.mediaUrl"
            :alt="message.fileName || 'Imagem'"
            class="mb-2 max-h-64 w-full rounded-lg object-cover"
          >
          <video
            v-else-if="isVideo"
            :src="message.mediaUrl"
            controls
            class="mb-2 max-h-64 w-full rounded-lg"
          />
          <audio
            v-else-if="isAudio"
            :src="message.mediaUrl"
            controls
            class="mb-2 w-full"
          />
          <a
            v-else
            :href="message.mediaUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="mb-2 inline-flex items-center gap-1 underline"
          >
            <span class="i-lucide-file h-3.5 w-3.5" />
            {{ message.fileName || 'Ver arquivo' }}
          </a>
        </template>

        <p
          v-if="message.content && !(message.mediaUrl && !message.content.trim())"
          class="whitespace-pre-wrap break-words"
        >
          {{ message.content }}
        </p>

        <div
          class="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70"
          :class="message.fromMe ? 'text-primary-foreground/80' : 'text-muted-foreground'"
        >
          <span>{{ formatTime(message.sentAt || message.createdAt) }}</span>
          <MessageStatusIcon v-if="message.fromMe" :status="String(message.status)" />
        </div>
      </div>

      <div v-if="reactionSummary.length" class="flex flex-wrap gap-1 px-1">
        <span
          v-for="item in reactionSummary"
          :key="item.emoji"
          class="rounded-full border bg-background px-1.5 py-0.5 text-[11px]"
        >
          {{ item.emoji }} {{ item.count > 1 ? item.count : '' }}
        </span>
      </div>

      <div class="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          variant="ghost"
          size="sm"
          class="h-7 px-2 text-xs"
          @click="emit('reply', message); inboxStore.setReplyToMessage(message)"
        >
          Responder
        </Button>
        <button
          v-for="emoji in reactionEmojis"
          :key="emoji"
          type="button"
          class="rounded px-1 text-sm hover:bg-muted"
          @click="emit('react', { message, emoji })"
        >
          {{ emoji }}
        </button>
      </div>
    </div>
  </div>
</template>
