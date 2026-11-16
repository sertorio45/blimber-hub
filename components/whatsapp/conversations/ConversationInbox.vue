<script setup lang="ts">
import type { Product } from '~/types/crm'
import type { WhatsAppConversation, WhatsAppConversationLead } from '~/types/whatsapp'

import ChatPanel from '~/components/whatsapp/conversations/ChatPanel.vue'
import ConversationDetails from '~/components/whatsapp/conversations/ConversationDetails.vue'
import ConversationList from '~/components/whatsapp/conversations/ConversationList.vue'
import InboxMobileSwitcher from '~/components/whatsapp/conversations/InboxMobileSwitcher.vue'
import InboxSidebar from '~/components/whatsapp/conversations/InboxSidebar.vue'
import { toast } from 'vue-sonner'
import { deleteWithConfirm } from '~/composables/useConfirmDelete'

const route = useRoute()
const router = useRouter()
const inboxStore = useWhatsAppInboxStore()
const { tenantId } = useTenant()

const {
  conversations,
  pending: conversationsPending,
  upsertConversation,
  markAsRead,
  updateConversation,
  deleteConversation,
  syncConversationToCrm,
  fetchConversationAgent,
  fetchConversationLead,
  updateConversationLead,
  setConversationAgent,
} = useWhatsAppConversations()

const { agents, pending: agentsPending } = useWhatsAppAgents()
const { instances, totalUnread, pending: instancesPending, refresh: refreshInstances } = useWhatsAppInstances()

const conversationLead = ref<WhatsAppConversationLead | null>(null)
const resolvedConversation = ref<WhatsAppConversation | null>(null)
const metaLoadingId = ref<string | null>(null)

const { data: crmProducts, pending: productsPending } = useAsyncData(
  () => `crm-products-inbox-${tenantId.value}`,
  async () => {
    if (!tenantId.value)
      return [] as Product[]

    return $fetch<Product[]>('/api/crm/products', {
      query: {
        tenant_id: tenantId.value,
        active: 'true',
      },
    })
  },
  { watch: [tenantId], default: () => [], server: false },
)

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '')
}

function buildRouteQuery(id: string | null, instanceId: string | null) {
  const query: Record<string, string> = {}
  if (instanceId)
    query.inbox = instanceId
  if (id)
    query.id = id
  return query
}

const activeInstanceId = computed({
  get: () => {
    const fromQuery = typeof route.query.inbox === 'string' ? route.query.inbox : null
    return inboxStore.activeInstanceId ?? fromQuery ?? null
  },
  set: (instanceId: string | null) => {
    inboxStore.setActiveInstance(instanceId)

    let conversationId = typeof route.query.id === 'string' ? route.query.id : null
    if (conversationId) {
      const conversation = conversations.value.find(item => item.id === conversationId)
        || (resolvedConversation.value?.id === conversationId ? resolvedConversation.value : null)
      if (conversation && instanceId && conversation.instanceId !== instanceId)
        conversationId = null
    }

    inboxStore.setActiveConversation(conversationId)

    router.replace({
      path: '/whatsapp/conversations',
      query: buildRouteQuery(conversationId, instanceId),
    })
  },
})

const activeId = computed({
  get: () => {
    const fromQuery = typeof route.query.id === 'string' ? route.query.id : null
    return inboxStore.activeConversationId || fromQuery || null
  },
  set: (id: string | null) => {
    inboxStore.setActiveConversation(id)

    const currentQueryId = typeof route.query.id === 'string' ? route.query.id : null
    if (currentQueryId === id)
      return

    router.replace({
      path: '/whatsapp/conversations',
      query: buildRouteQuery(id, activeInstanceId.value),
    })
  },
})

const messagesConversationId = computed(() => resolvedConversation.value?.id || activeId.value)

const isResolvingConversation = computed(
  () => Boolean(activeId.value && !resolvedConversation.value),
)

const {
  messages,
  initialLoading: messagesLoading,
  sending,
  updateMessage,
  sendMessage,
  notifyTyping,
} = useWhatsAppMessages(messagesConversationId)

async function fetchConversationById(id: string) {
  return $fetch<{ data: WhatsAppConversation }>(`/api/whatsapp/conversations/${id}`, {
    query: { tenant_id: tenantId.value },
  })
}

function findConversationByPhone(
  phone: string,
  instanceId?: string | null,
) {
  const phoneKey = normalizePhone(phone)
  return conversations.value.find((item) => {
    if (normalizePhone(item.contactPhone) !== phoneKey)
      return false
    if (instanceId && item.instanceId !== instanceId)
      return false
    return true
  }) || null
}

async function resolveConversation(id: string) {
  const fromList = conversations.value.find(item => item.id === id)
  if (fromList) {
    resolvedConversation.value = fromList
    return fromList
  }

  try {
    const response = await fetchConversationById(id)
    upsertConversation(response.data)
    resolvedConversation.value = response.data
    return response.data
  }
  catch {
    const cached = resolvedConversation.value
    if (cached?.id === id) {
      const replacement = findConversationByPhone(cached.contactPhone, cached.instanceId)
      if (replacement) {
        activeId.value = replacement.id
        resolvedConversation.value = replacement
        return replacement
      }
    }

    activeId.value = null
    resolvedConversation.value = null
    return null
  }
}

async function loadConversationMeta(id: string, conversation: WhatsAppConversation) {
  if (metaLoadingId.value === id)
    return

  metaLoadingId.value = id

  try {
    if (conversation.unreadCount) {
      try {
        await markAsRead(id)
      }
      catch {
        /* non-blocking */
      }
    }

    try {
      const agentResponse = await fetchConversationAgent(id)
      const current = conversations.value.find(item => item.id === id) || conversation
      const withAgent = {
        ...current,
        activeAgentId: agentResponse.data.agentId,
        activeAgentName: agentResponse.data.agentName,
      }
      upsertConversation(withAgent)

      if (resolvedConversation.value?.id === id)
        resolvedConversation.value = withAgent
    }
    catch {
      /* non-blocking */
    }

    if (conversation.leadId) {
      try {
        const leadResponse = await fetchConversationLead(id)
        conversationLead.value = leadResponse.data
      }
      catch {
        conversationLead.value = null
      }
    }
    else {
      conversationLead.value = null
    }
  }
  finally {
    if (metaLoadingId.value === id)
      metaLoadingId.value = null
  }
}

watch(
  [activeId, () => conversations.value.length],
  async ([id]) => {
    if (!id) {
      resolvedConversation.value = null
      conversationLead.value = null
      return
    }

    const conversation = await resolveConversation(id)
    if (!conversation || conversation.id !== id) {
      if (conversation)
        await loadConversationMeta(conversation.id, conversation)
      return
    }

    resolvedConversation.value = conversation
    await loadConversationMeta(id, conversation)
  },
  { immediate: true },
)

watch(conversations, (list) => {
  if (!activeId.value)
    return

  const match = list.find(item => item.id === activeId.value)
  if (match) {
    resolvedConversation.value = match
    return
  }

  const cached = resolvedConversation.value
  if (!cached)
    return

  const replacement = findConversationByPhone(
    cached.contactPhone,
    cached.instanceId,
  )
  if (replacement && replacement.id !== activeId.value)
    activeId.value = replacement.id
})

watch(
  () => route.query.inbox,
  (inbox) => {
    const next = typeof inbox === 'string' ? inbox : null
    if (next !== inboxStore.activeInstanceId)
      inboxStore.setActiveInstance(next)
  },
  { immediate: true },
)

watch(
  () => route.query.id,
  (id) => {
    if (typeof id === 'string' && id !== activeId.value)
      activeId.value = id
  },
)

useWhatsAppRealtime({
  onMessage: (message) => {
    const currentId = messagesConversationId.value
    if (message.conversationId === currentId) {
      updateMessage(message)
      if (!message.fromMe && currentId)
        markAsRead(currentId)
    }
    else if (!message.fromMe && message.conversationId) {
      const conv = conversations.value.find(c => c.id === message.conversationId)
      if (conv) {
        upsertConversation({
          ...conv,
          unreadCount: conv.unreadCount + 1,
          lastMessagePreview: message.content,
          lastMessageAt: message.sentAt || message.createdAt,
        })
      }
    }
  },
  onConversationUpdate: (conversation) => {
    upsertConversation(conversation)
    if (conversation.id === resolvedConversation.value?.id)
      resolvedConversation.value = conversation
    refreshInstances()
  },
})

async function handleSelectInbox(instanceId: string | null) {
  activeInstanceId.value = instanceId
}

const showAllInboxes = computed(() => !activeInstanceId.value)
const activeInboxLabel = computed(() => {
  if (!activeInstanceId.value)
    return 'Todas as caixas'
  return instances.value.find(item => item.id === activeInstanceId.value)?.name || 'Caixa de entrada'
})

async function handleSelect(id: string) {
  activeId.value = id
}

async function handleSend(payload: string | import('~/composables/whatsapp/useWhatsAppMessages').SendWhatsAppMessagePayload) {
  try {
    await sendMessage(payload)
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || error?.message || 'Erro ao enviar mensagem')
  }
}

async function handleReact(payload: { message: import('~/types/whatsapp').WhatsAppMessage, emoji: string }) {
  try {
    await sendMessage({
      type: 'reaction',
      reaction: {
        messageId: payload.message.id,
        emoji: payload.emoji,
      },
    })
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || error?.message || 'Erro ao reagir')
  }
}

function handleReply(message: import('~/types/whatsapp').WhatsAppMessage) {
  inboxStore.setReplyToMessage(message)
}

function handleClearReply() {
  inboxStore.setReplyToMessage(null)
}

function handleTyping() {
  notifyTyping()
}

async function handleStatusChange(status: import('~/types/whatsapp').WhatsAppConversationStatus) {
  const id = resolvedConversation.value?.id
  if (!id)
    return
  try {
    const updated = await updateConversation(id, { status })
    resolvedConversation.value = updated
    toast.success('Status atualizado')
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || error?.message || 'Erro ao atualizar status')
  }
}

async function handleSyncCrm(payload: {
  productId?: string | null
  value?: number
  serviceName?: string | null
}) {
  const id = resolvedConversation.value?.id
  if (!id)
    return
  try {
    const response = await syncConversationToCrm(id, payload)

    if (response.data)
      resolvedConversation.value = response.data

    if (response.lead?.id && (payload.productId || payload.value !== undefined || payload.serviceName)) {
      conversationLead.value = await updateConversationLead(id, {
        value: payload.value,
        serviceName: payload.serviceName,
        productId: payload.productId,
      })
    }
    else if (response.data.leadId) {
      const leadResponse = await fetchConversationLead(id)
      conversationLead.value = leadResponse.data
    }

    if (response.leadCreated)
      toast.success('Contato e lead criados no funil')
    else if (response.lead)
      toast.success('Contato sincronizado com o CRM')
    else
      toast.success('Contato sincronizado com o CRM')
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || error?.message || 'Erro ao sincronizar com o CRM')
  }
}

function handleLeadUpdated(lead: WhatsAppConversationLead) {
  conversationLead.value = lead
}

async function handleDeleteConversation() {
  const conversation = resolvedConversation.value
  const id = conversation?.id
  if (!id)
    return

  const contactName = conversation.contactName || 'este contato'
  const ok = await deleteWithConfirm(
    () => deleteConversation(id),
    {
      title: 'Excluir conversa?',
      description: `Todas as mensagens de "${contactName}" serão removidas permanentemente. Esta ação não pode ser desfeita.`,
      successMessage: 'Conversa excluída com sucesso.',
    },
  )
  if (ok) {
    activeId.value = null
    resolvedConversation.value = null
    conversationLead.value = null
  }
}

async function handleAssignChange(userId: string | null) {
  const id = resolvedConversation.value?.id
  if (!id)
    return
  try {
    const updated = await updateConversation(id, { assigned_to: userId })
    resolvedConversation.value = updated
    toast.success(userId ? 'Conversa atribuída' : 'Atribuição removida')
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || error?.message || 'Erro ao atribuir conversa')
  }
}

async function handleAgentChange(payload: { agentId: string | null, enabled: boolean }) {
  const id = resolvedConversation.value?.id
  if (!id)
    return

  if (payload.enabled && !payload.agentId) {
    toast.error('Selecione um agente antes de ativar a IA.')
    return
  }

  try {
    const result = await setConversationAgent(id, payload)
    const current = resolvedConversation.value
    if (current) {
      resolvedConversation.value = {
        ...current,
        activeAgentId: result.agentId,
        activeAgentName: result.agentName,
      }
    }
    if (result.enabled && result.catchUpReplied)
      toast.success('Atendimento por IA ativado — resposta enviada à última mensagem')
    else if (result.enabled)
      toast.success('Atendimento por IA ativado')
    else
      toast.success('Atendimento por IA desativado')
  }
  catch (error: any) {
    toast.error(error?.data?.statusMessage || error?.message || 'Erro ao configurar agente')
  }
}
</script>

<template>
  <div class="flex h-[calc(100vh-8rem)] min-h-[560px] overflow-hidden rounded-xl border bg-background shadow-sm">
    <InboxSidebar
      :instances="instances"
      :active-instance-id="activeInstanceId"
      :total-unread="totalUnread"
      :loading="instancesPending"
      @select="handleSelectInbox"
    />

    <div class="w-full shrink-0 md:w-80 lg:w-96" :class="activeId && 'hidden md:block'">
      <ConversationList
        :conversations="conversations"
        :active-id="resolvedConversation?.id || activeId"
        :loading="conversationsPending"
        :show-instance-badge="showAllInboxes"
        @select="handleSelect"
      >
        <template #inbox-switcher>
          <InboxMobileSwitcher
            :instances="instances"
            :active-instance-id="activeInstanceId"
            :total-unread="totalUnread"
            @select="handleSelectInbox"
          />
        </template>
      </ConversationList>
    </div>

    <div class="min-w-0 flex-1" :class="!activeId && 'hidden md:flex md:flex-col'">
      <div v-if="activeId" class="flex items-center justify-between border-b px-3 py-2 md:hidden">
        <button type="button" class="text-sm text-primary" @click="activeId = null">
          ← Conversas
        </button>
        <span class="truncate text-xs text-muted-foreground">
          {{ activeInboxLabel }}
        </span>
      </div>
      <ChatPanel
        :conversation="resolvedConversation"
        :messages="messages"
        :agents="agents"
        :agents-loading="agentsPending"
        :lead="conversationLead"
        :products="crmProducts || []"
        :products-loading="productsPending"
        :loading="messagesLoading || isResolvingConversation"
        :sending="sending"
        @send="handleSend"
        @typing="handleTyping"
        @reply="handleReply"
        @react="handleReact"
        @clear-reply="handleClearReply"
        @status-change="handleStatusChange"
        @sync-crm="handleSyncCrm"
        @delete-conversation="handleDeleteConversation"
        @agent-change="handleAgentChange"
        @assign-change="handleAssignChange"
        @lead-updated="handleLeadUpdated"
      />
    </div>

    <ConversationDetails
      :conversation="resolvedConversation"
      :lead="conversationLead"
    />
  </div>
</template>
