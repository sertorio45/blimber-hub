import type { WhatsAppConversation, WhatsAppConversationStatus } from '~/types/whatsapp'

function conversationListKey(conversation: Pick<WhatsAppConversation, 'instanceId' | 'contactPhone' | 'remoteJid'>) {
  const remote = conversation.remoteJid || conversation.contactPhone.replace(/\D/g, '')
  return `${conversation.instanceId || ''}:${remote}`
}

export function useWhatsAppConversations() {
  const { tenantId } = useTenant()
  const inboxStore = useWhatsAppInboxStore()

  const queryParams = computed(() => ({
    tenant_id: tenantId.value || undefined,
    instance_id: inboxStore.activeInstanceId || undefined,
    status: inboxStore.filters.status === 'all' ? undefined : inboxStore.filters.status,
    chat_type: inboxStore.filters.chatType === 'all' ? undefined : inboxStore.filters.chatType,
    search: inboxStore.filters.search || undefined,
    unread_only: inboxStore.filters.unreadOnly ? 'true' : undefined,
    assigned_to_me: inboxStore.filters.assignedToMe ? 'true' : undefined,
  }))

  const cacheKey = computed(
    () => `whatsapp-conversations-${tenantId.value}-${inboxStore.activeInstanceId || 'all'}-${inboxStore.filters.status}-${inboxStore.filters.chatType}-${inboxStore.filters.search}-${inboxStore.filters.unreadOnly}-${inboxStore.filters.assignedToMe}`,
  )

  const { data, pending, refresh, showSkeleton } = useCachedAsyncData(
    cacheKey,
    async () => {
      if (!tenantId.value)
        return null

      const response = await $fetch<{ data: WhatsAppConversation[] }>('/api/whatsapp/conversations', {
        query: queryParams.value,
      })
      return response.data || []
    },
    { watch: [tenantId, queryParams], default: () => null, server: false },
  )

  const conversations = computed({
    get: () => data.value ?? [],
    set: (value: WhatsAppConversation[]) => {
      data.value = value
    },
  })

  function upsertConversation(conversation: WhatsAppConversation) {
    const list = [...(data.value ?? [])]
    const key = conversationListKey(conversation)
    const existing = list.find(item => item.id === conversation.id)

    const merged: WhatsAppConversation = {
      ...conversation,
      activeAgentId: conversation.activeAgentId !== undefined
        ? conversation.activeAgentId
        : existing?.activeAgentId ?? null,
      activeAgentName: conversation.activeAgentName !== undefined
        ? conversation.activeAgentName
        : existing?.activeAgentName ?? null,
    }

    const activeInstanceId = inboxStore.activeInstanceId
    const chatType = inboxStore.filters.chatType || 'all'
    const matchesInbox = !activeInstanceId || merged.instanceId === activeInstanceId
    const matchesChatType = chatType === 'all'
      || (chatType === 'group' && merged.isGroup)
      || (chatType === 'direct' && !merged.isGroup)

    const filtered = list.filter((item) => {
      if (item.id === merged.id)
        return false
      return conversationListKey(item) !== key
    })

    if (matchesInbox && matchesChatType)
      filtered.unshift(merged)

    filtered.sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
      return bTime - aTime
    })
    data.value = filtered
  }

  async function updateConversation(
    id: string,
    payload: { status?: WhatsAppConversationStatus, mark_read?: boolean, assigned_to?: string | null },
  ) {
    const response = await $fetch<{ data: WhatsAppConversation }>(`/api/whatsapp/conversations/${id}`, {
      method: 'PUT',
      body: {
        tenant_id: tenantId.value,
        ...payload,
      },
    })
    upsertConversation(response.data)
    return response.data
  }

  async function markAsRead(id: string) {
    return updateConversation(id, { mark_read: true })
  }

  async function deleteConversation(id: string) {
    await $fetch(`/api/whatsapp/conversations/${id}`, {
      method: 'DELETE',
      query: { tenant_id: tenantId.value },
    })
    data.value = (data.value ?? []).filter(item => item.id !== id)
  }

  async function syncConversationToCrm(
    id: string,
    payload: {
      createIfMissing?: boolean
      value?: number
      serviceName?: string | null
      productId?: string | null
    } = {},
  ) {
    const response = await $fetch<{
      data: WhatsAppConversation
      crmContact: { id: string, name: string, email: string }
      lead: {
        id: string
        name: string
        funnelId: string | null
        salesStageId: string | null
        value: number
        serviceName: string | null
      } | null
      leadCreated: boolean
    }>(`/api/whatsapp/conversations/${id}/sync-crm`, {
      method: 'POST',
      body: {
        tenant_id: tenantId.value,
        create_if_missing: payload.createIfMissing ?? true,
        create_lead: true,
        value: payload.value,
        service_name: payload.serviceName,
        product_id: payload.productId,
      },
    })
    upsertConversation(response.data)
    return response
  }

  async function fetchConversationLead(id: string) {
    return $fetch<{ data: import('~/types/whatsapp').WhatsAppConversationLead | null }>(
      `/api/whatsapp/conversations/${id}/lead`,
      { query: { tenant_id: tenantId.value } },
    )
  }

  async function updateConversationLead(
    id: string,
    payload: {
      value?: number
      serviceName?: string | null
      productId?: string | null
    },
  ) {
    const response = await $fetch<{ data: import('~/types/whatsapp').WhatsAppConversationLead }>(
      `/api/whatsapp/conversations/${id}/lead`,
      {
        method: 'PUT',
        body: {
          tenant_id: tenantId.value,
          value: payload.value,
          service_name: payload.serviceName,
          product_id: payload.productId,
        },
      },
    )
    return response.data
  }

  async function fetchConversationAgent(id: string) {
    return $fetch<{
      data: {
        enabled: boolean
        agentId: string | null
        agentName: string | null
        sessionId: string | null
      }
    }>(`/api/whatsapp/conversations/${id}/agent`, {
      query: { tenant_id: tenantId.value },
    })
  }

  async function setConversationAgent(
    id: string,
    payload: { agentId: string | null, enabled: boolean },
  ) {
    const response = await $fetch<{
      data: {
        enabled: boolean
        agentId: string | null
        agentName: string | null
        sessionId: string | null
        catchUpReplied?: boolean
      }
    }>(`/api/whatsapp/conversations/${id}/agent`, {
      method: 'PUT',
      body: {
        tenant_id: tenantId.value,
        agent_id: payload.agentId,
        enabled: payload.enabled,
      },
    })

    const conversation = (data.value ?? []).find(item => item.id === id)
    if (conversation) {
      upsertConversation({
        ...conversation,
        activeAgentId: response.data.agentId,
        activeAgentName: response.data.agentName,
      })
    }

    return response.data
  }

  return {
    conversations,
    pending,
    showSkeleton,
    refresh,
    upsertConversation,
    updateConversation,
    markAsRead,
    deleteConversation,
    syncConversationToCrm,
    fetchConversationLead,
    updateConversationLead,
    fetchConversationAgent,
    setConversationAgent,
    conversationListKey,
  }
}
