import type {
  CreateWhatsAppCampaignPayload,
  UpdateWhatsAppCampaignPayload,
  WhatsAppCampaign,
  WhatsAppCampaignRecipient,
  WhatsAppCampaignStatus,
} from '~/types/whatsapp'

export function useWhatsAppCampaigns() {
  const { tenantId } = useTenant()

  const statusFilter = ref<WhatsAppCampaignStatus | 'all'>('all')
  const search = ref('')

  const cacheKey = computed(
    () => `whatsapp-campaigns-${tenantId.value}-${statusFilter.value}-${search.value}`,
  )

  const { data, pending, refresh, showSkeleton } = useCachedAsyncData(
    cacheKey,
    async () => {
      if (!tenantId.value)
        return null

      const response = await $fetch<{ data: WhatsAppCampaign[], total: number }>(
        '/api/whatsapp/campaigns',
        {
          query: {
            tenant_id: tenantId.value,
            status: statusFilter.value === 'all' ? undefined : statusFilter.value,
            search: search.value || undefined,
            limit: 50,
          },
        },
      )
      return response
    },
    { watch: [tenantId, statusFilter, search], default: () => null, server: false },
  )

  const campaigns = computed(() => data.value?.data ?? [])
  const total = computed(() => data.value?.total ?? 0)

  async function createCampaign(payload: Omit<CreateWhatsAppCampaignPayload, 'tenant_id'>) {
    const response = await $fetch<{ data: WhatsAppCampaign }>('/api/whatsapp/campaigns', {
      method: 'POST',
      body: { ...payload, tenant_id: tenantId.value },
    })
    await refresh()
    return response.data
  }

  async function updateCampaign(id: string, payload: Omit<UpdateWhatsAppCampaignPayload, 'tenant_id'>) {
    const response = await $fetch<{ data: WhatsAppCampaign }>(`/api/whatsapp/campaigns/${id}`, {
      method: 'PUT',
      body: { ...payload, tenant_id: tenantId.value },
    })
    await refresh()
    return response.data
  }

  async function deleteCampaign(id: string) {
    await $fetch(`/api/whatsapp/campaigns/${id}`, {
      method: 'DELETE',
      query: { tenant_id: tenantId.value },
    })
    await refresh()
  }

  async function startCampaign(id: string) {
    const response = await $fetch<{ data: WhatsAppCampaign, audienceSize: number }>(
      `/api/whatsapp/campaigns/${id}/start`,
      {
        method: 'POST',
        query: { tenant_id: tenantId.value },
      },
    )
    await refresh()
    return response
  }

  async function pauseCampaign(id: string) {
    const response = await $fetch<{ data: WhatsAppCampaign }>(
      `/api/whatsapp/campaigns/${id}/pause`,
      {
        method: 'POST',
        query: { tenant_id: tenantId.value },
      },
    )
    await refresh()
    return response.data
  }

  async function tickCampaign(id: string) {
    return $fetch<{ data: WhatsAppCampaign, processed: number, hasPending: boolean }>(
      `/api/whatsapp/campaigns/${id}/tick`,
      {
        method: 'POST',
        query: { tenant_id: tenantId.value },
      },
    )
  }

  async function fetchCampaign(id: string) {
    return $fetch<{ data: WhatsAppCampaign }>(`/api/whatsapp/campaigns/${id}`, {
      query: { tenant_id: tenantId.value },
    })
  }

  async function fetchRecipients(
    campaignId: string,
    params: { status?: string, page?: number, limit?: number } = {},
  ) {
    return $fetch<{ data: WhatsAppCampaignRecipient[], total: number }>(
      `/api/whatsapp/campaigns/${campaignId}/recipients`,
      {
        query: {
          tenant_id: tenantId.value,
          status: params.status,
          page: params.page,
          limit: params.limit,
        },
      },
    )
  }

  return {
    campaigns,
    total,
    pending,
    showSkeleton,
    search,
    statusFilter,
    refresh,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    startCampaign,
    pauseCampaign,
    tickCampaign,
    fetchCampaign,
    fetchRecipients,
  }
}
