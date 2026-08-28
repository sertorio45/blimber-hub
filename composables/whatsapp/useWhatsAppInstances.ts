import type {
  CreateWhatsAppInstancePayload,
  WhatsAppInstanceView,
} from '~/types/whatsapp'

export function useWhatsAppInstances() {
  const { tenantId } = useTenant()
  const cacheKey = computed(() => `whatsapp-instances-${tenantId.value}`)

  const { data, pending, refresh, error, showSkeleton } = useCachedAsyncData(
    cacheKey,
    async () => {
      if (!tenantId.value)
        return null

      const response = await $fetch<{
        data: WhatsAppInstanceView[]
        meta?: { totalUnread?: number, totalConversations?: number }
      }>('/api/whatsapp/instances', {
        query: { tenant_id: tenantId.value },
      })
      return {
        instances: response.data || [],
        totalUnread: response.meta?.totalUnread ?? 0,
      }
    },
    { watch: [tenantId], default: () => null, server: false },
  )

  const instances = computed(() => data.value?.instances ?? [])
  const totalUnread = computed(() => data.value?.totalUnread ?? 0)

  async function createInstance(payload: Omit<CreateWhatsAppInstancePayload, 'tenant_id'>) {
    const response = await $fetch<{ data: WhatsAppInstanceView, webhookUrl: string }>(
      '/api/whatsapp/instances',
      {
        method: 'POST',
        body: {
          ...payload,
          tenant_id: tenantId.value,
        },
      },
    )
    await refresh()
    return response
  }

  async function createInstanceFromEmbeddedSignup(payload: {
    code: string
    waba_id?: string | null
    phone_number_id?: string | null
    coexistence?: boolean
    name?: string
    is_default?: boolean
  }) {
    const response = await $fetch<{
      data: WhatsAppInstanceView
      webhookUrl: string
      coexistence: boolean
    }>('/api/whatsapp/instances/embedded-signup', {
      method: 'POST',
      body: {
        ...payload,
        waba_id: payload.waba_id || undefined,
        phone_number_id: payload.phone_number_id || undefined,
        tenant_id: tenantId.value,
      },
    })
    await refresh()
    return response
  }

  async function deleteInstance(id: string) {
    await $fetch(`/api/whatsapp/instances/${id}`, {
      method: 'DELETE',
      query: { tenant_id: tenantId.value },
    })
    await refresh()
  }

  async function connectInstance(id: string) {
    const response = await $fetch<{
      data: {
        status: string
        qrCode: string | null
        pairingCode?: string | null
        alreadyConnected?: boolean
        phoneNumber?: string | null
      }
    }>(
      `/api/whatsapp/instances/${id}/connect`,
      {
        method: 'POST',
        query: { tenant_id: tenantId.value },
      },
    )
    await refresh()
    return response.data
  }

  async function disconnectInstance(id: string) {
    await $fetch(`/api/whatsapp/instances/${id}/disconnect`, {
      method: 'POST',
      query: { tenant_id: tenantId.value },
    })
    await refresh()
  }

  async function pollStatus(id: string) {
    const response = await $fetch<{ data: { status: string, phoneNumber?: string, qrCode?: string | null } }>(
      `/api/whatsapp/instances/${id}/status`,
      { query: { tenant_id: tenantId.value } },
    )
    await refresh()
    return response.data
  }

  async function testConnection(id: string) {
    return $fetch(`/api/whatsapp/instances/${id}/test`, {
      method: 'POST',
      query: { tenant_id: tenantId.value },
    })
  }

  async function discoverEvolutionInstances(payload: { api_url: string, api_token: string }) {
    return $fetch<{ data: import('~/types/whatsapp').EvolutionRemoteInstanceView[] }>(
      '/api/whatsapp/instances/discover',
    {
      method: 'POST',
      body: {
        ...payload,
        tenant_id: tenantId.value,
      },
    },
    )
  }

  async function syncInstance(id: string) {
    const response = await $fetch<{
      success: boolean
      webhookUrl: string
      data: { status: string, phoneNumber?: string }
    }>(`/api/whatsapp/instances/${id}/sync`, {
      method: 'POST',
      query: { tenant_id: tenantId.value },
    })
    await refresh()
    return response
  }

  async function updateInstance(
    id: string,
    payload: {
      is_default?: boolean
      name?: string
      evolution_instance_name?: string
    },
  ) {
    const response = await $fetch<{ data: WhatsAppInstanceView }>(`/api/whatsapp/instances/${id}`, {
      method: 'PUT',
      body: {
        tenant_id: tenantId.value,
        ...payload,
      },
    })
    await refresh()
    return response.data
  }

  return {
    instances,
    totalUnread,
    pending,
    showSkeleton,
    error,
    refresh,
    createInstance,
    createInstanceFromEmbeddedSignup,
    updateInstance,
    deleteInstance,
    connectInstance,
    disconnectInstance,
    pollStatus,
    testConnection,
    discoverEvolutionInstances,
    syncInstance,
  }
}
