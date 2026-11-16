<script setup lang="ts">
import type { WhatsAppConversation } from '~/types/whatsapp'

import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'

const props = defineProps<{
  conversation: WhatsAppConversation
  active?: boolean
  showInstanceBadge?: boolean
}>()

const emit = defineEmits<{
  select: []
}>()

const initials = computed(() =>
  props.conversation.contactName.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase(),
)

function formatRelative(value?: string | null) {
  if (!value)
    return ''
  const date = new Date(value)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) {
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date)
  }
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date)
}
</script>

<template>
  <button
    type="button"
    class="flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted/50"
    :class="active ? 'bg-muted/60' : ''"
    @click="emit('select')"
  >
    <Avatar class="h-10 w-10 shrink-0">
      <AvatarImage :src="conversation.profilePicture || undefined" />
      <AvatarFallback>{{ initials }}</AvatarFallback>
    </Avatar>

    <div class="min-w-0 flex-1">
      <div class="flex items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-1.5">
          <span
            v-if="conversation.isGroup"
            class="i-lucide-users h-3.5 w-3.5 shrink-0 text-muted-foreground"
          />
          <p class="truncate font-medium">
            {{ conversation.isGroup ? (conversation.groupSubject || conversation.contactName) : conversation.contactName }}
          </p>
          <Badge
            v-if="showInstanceBadge && conversation.instanceName"
            variant="outline"
            class="h-4 shrink-0 px-1 text-[10px] font-normal"
          >
            {{ conversation.instanceName }}
          </Badge>
        </div>
        <span class="shrink-0 text-[11px] text-muted-foreground">
          {{ formatRelative(conversation.lastMessageAt) }}
        </span>
      </div>
      <div class="mt-0.5 flex items-center justify-between gap-2">
        <p class="truncate text-sm text-muted-foreground">
          {{ conversation.lastMessagePreview || '—' }}
        </p>
        <Badge v-if="conversation.unreadCount > 0" class="h-5 min-w-5 shrink-0 justify-center rounded-full px-1.5">
          {{ conversation.unreadCount }}
        </Badge>
      </div>
    </div>
  </button>
</template>
