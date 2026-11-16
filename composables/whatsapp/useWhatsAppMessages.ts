import type { WhatsAppMessage } from '~/types/whatsapp'

const POLL_INTERVAL_MS = 5000

export interface SendWhatsAppMessagePayload {
  content?: string
  replyToId?: string | null
  type?: 'text' | 'media' | 'reaction'
  media?: {
    mediatype: 'image' | 'video' | 'audio' | 'document'
    url: string
    caption?: string
    fileName?: string
  }
  reaction?: {
    messageId: string
    emoji: string
  }
}

function sortMessages(messages: WhatsAppMessage[]) {
  return [...messages].sort((a, b) => {
    const aTime = new Date(a.sentAt || a.createdAt).getTime()
    const bTime = new Date(b.sentAt || b.createdAt).getTime()
    return aTime - bTime
  })
}

function mergeMessages(current: WhatsAppMessage[], remote: WhatsAppMessage[]) {
  const byId = new Map<string, WhatsAppMessage>()
  for (const message of current)
    byId.set(message.id, message)

  for (const message of remote) {
    const existing = byId.get(message.id)
    byId.set(message.id, existing ? { ...existing, ...message } : message)
  }

  return sortMessages(Array.from(byId.values()))
}

export function useWhatsAppMessages(conversationId: Ref<string | null>) {
  const { tenantId } = useTenant()
  const inboxStore = useWhatsAppInboxStore()

  const cacheKey = computed(
    () => `whatsapp-messages-${tenantId.value}-${conversationId.value}`,
  )

  const { data, pending, refresh, showSkeleton } = useCachedAsyncData(
    cacheKey,
    async () => {
      if (!tenantId.value || !conversationId.value)
        return null

      const response = await $fetch<{ data: WhatsAppMessage[] }>(
        `/api/whatsapp/conversations/${conversationId.value}/messages`,
        { query: { tenant_id: tenantId.value } },
      )
      return response.data || []
    },
    { watch: [tenantId, conversationId], default: () => null, server: false },
  )

  const messages = computed({
    get: () => data.value ?? [],
    set: (value: WhatsAppMessage[]) => {
      data.value = value
    },
  })

  const sending = ref(false)
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let presenceTimer: ReturnType<typeof setTimeout> | null = null

  async function fetchMessages() {
    if (!tenantId.value || !conversationId.value)
      return [] as WhatsAppMessage[]

    const response = await $fetch<{ data: WhatsAppMessage[] }>(
      `/api/whatsapp/conversations/${conversationId.value}/messages`,
      { query: { tenant_id: tenantId.value } },
    )
    return response.data || []
  }

  async function syncMessages() {
    if (!tenantId.value || !conversationId.value || pending.value)
      return

    try {
      const remote = await fetchMessages()
      data.value = mergeMessages(data.value ?? [], remote)
    }
    catch {
      /* non-blocking poll */
    }
  }

  function startPolling() {
    stopPolling()
    if (!import.meta.client)
      return

    pollTimer = setInterval(() => {
      syncMessages()
    }, POLL_INTERVAL_MS)
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  watch(conversationId, (id, previousId) => {
    if (id === previousId)
      return

    inboxStore.setReplyToMessage(null)

    if (id) {
      startPolling()
      return
    }

    stopPolling()
    data.value = null
  }, { immediate: true })

  onUnmounted(() => {
    stopPolling()
    if (presenceTimer)
      clearTimeout(presenceTimer)
  })

  function appendMessage(message: WhatsAppMessage) {
    if (message.conversationId !== conversationId.value)
      return
    const exists = (data.value ?? []).some(m => m.id === message.id)
    if (exists)
      return
    data.value = sortMessages([...(data.value ?? []), message])
  }

  function updateMessage(message: WhatsAppMessage) {
    if (message.conversationId !== conversationId.value)
      return
    data.value = mergeMessages(data.value ?? [], [message])
  }

  async function sendMessage(payload: string | SendWhatsAppMessagePayload) {
    if (!conversationId.value)
      return null

    const body = typeof payload === 'string'
      ? { content: payload.trim(), type: 'text' as const }
      : payload

    if (body.type !== 'reaction' && !body.content?.trim() && !body.media)
      return null

    sending.value = true
    try {
      const response = await $fetch<{ data: WhatsAppMessage }>('/api/whatsapp/messages', {
        method: 'POST',
        body: {
          tenant_id: tenantId.value,
          conversation_id: conversationId.value,
          content: body.content?.trim() || undefined,
          reply_to_id: body.replyToId ?? inboxStore.replyToMessage?.id ?? undefined,
          type: body.type || (body.media ? 'media' : body.reaction ? 'reaction' : 'text'),
          media: body.media,
          reaction: body.reaction
            ? { message_id: body.reaction.messageId, emoji: body.reaction.emoji }
            : undefined,
        },
      })
      updateMessage(response.data)
      if (body.type !== 'reaction')
        inboxStore.setReplyToMessage(null)
      return response.data
    }
    finally {
      sending.value = false
    }
  }

  async function sendPresence(presence: 'composing' | 'paused' | 'recording') {
    if (!conversationId.value || !tenantId.value)
      return

    try {
      await $fetch(`/api/whatsapp/conversations/${conversationId.value}/presence`, {
        method: 'POST',
        body: {
          tenant_id: tenantId.value,
          presence,
        },
      })
    }
    catch {
      /* non-blocking */
    }
  }

  function notifyTyping() {
    if (presenceTimer)
      clearTimeout(presenceTimer)
    sendPresence('composing')
    presenceTimer = setTimeout(() => {
      sendPresence('paused')
    }, 4000)
  }

  return {
    messages,
    pending,
    showSkeleton,
    initialLoading: showSkeleton,
    sending,
    refresh,
    appendMessage,
    updateMessage,
    sendMessage,
    sendPresence,
    notifyTyping,
    syncMessages,
  }
}
