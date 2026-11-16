<script setup lang="ts">
import type { Product } from '~/types/crm'
import type { WhatsAppAgent, WhatsAppConversation, WhatsAppConversationLead, WhatsAppMessage } from '~/types/whatsapp'
import type { SendWhatsAppMessagePayload } from '~/composables/whatsapp/useWhatsAppMessages'

import ChatHeader from '~/components/whatsapp/conversations/ChatHeader.vue'
import ConversationLeadPanel from '~/components/whatsapp/conversations/ConversationLeadPanel.vue'
import MessageComposer from '~/components/whatsapp/conversations/MessageComposer.vue'
import MessageList from '~/components/whatsapp/conversations/MessageList.vue'

const props = defineProps<{
  conversation: WhatsAppConversation | null
  messages: WhatsAppMessage[]
  agents: WhatsAppAgent[]
  agentsLoading?: boolean
  lead: WhatsAppConversationLead | null
  products: Product[]
  productsLoading?: boolean
  loading?: boolean
  sending?: boolean
}>()

const emit = defineEmits<{
  send: [payload: SendWhatsAppMessagePayload]
  typing: []
  statusChange: [status: WhatsAppConversation['status']]
  syncCrm: [payload: { productId?: string | null, value?: number, serviceName?: string | null }]
  deleteConversation: []
  agentChange: [payload: { agentId: string | null, enabled: boolean }]
  assignChange: [userId: string | null]
  leadUpdated: [lead: WhatsAppConversationLead]
  reply: [message: WhatsAppMessage]
  react: [payload: { message: WhatsAppMessage, emoji: string }]
  clearReply: []
}>()

const inboxStore = useWhatsAppInboxStore()
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-muted/10">
    <template v-if="conversation">
      <ChatHeader
        :conversation="conversation"
        :agents="agents"
        :agents-loading="agentsLoading"
        :lead="lead"
        :products="products"
        :products-loading="productsLoading"
        @status-change="emit('statusChange', $event)"
        @sync-crm="emit('syncCrm', $event)"
        @delete-conversation="emit('deleteConversation')"
        @agent-change="emit('agentChange', $event)"
        @assign-change="emit('assignChange', $event)"
      />
      <ConversationLeadPanel
        v-if="!conversation.isGroup"
        :conversation-id="conversation.id"
        :lead-id="conversation.leadId || null"
        :lead="lead"
        :products="products"
        :products-loading="productsLoading"
        @updated="emit('leadUpdated', $event)"
      />
      <MessageList
        :messages="messages"
        :loading="loading"
        :is-group="conversation.isGroup"
        @reply="emit('reply', $event)"
        @react="emit('react', $event)"
      />
      <MessageComposer
        :disabled="false"
        :sending="sending"
        :reply-to="inboxStore.replyToMessage"
        @send="emit('send', $event)"
        @typing="emit('typing')"
        @clear-reply="emit('clearReply')"
      />
    </template>
    <div v-else-if="loading" class="flex flex-1 flex-col">
      <div class="border-b px-4 py-3">
        <div class="h-9 w-48 animate-pulse rounded bg-muted" />
      </div>
      <div class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Carregando conversa...
      </div>
    </div>
    <div v-else class="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <span class="i-lucide-messages-square h-12 w-12 opacity-40" />
      <p class="text-sm">
        Selecione uma conversa para começar
      </p>
    </div>
  </div>
</template>
