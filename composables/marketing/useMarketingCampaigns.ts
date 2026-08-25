import type {
  SocialCampaign,
  SocialCampaignDetail,
  SocialCampaignInput,
  SocialCampaignStatus,
  SocialCampaignUpdateInput,
} from '~/types/marketing-social'
import {
  invalidateMarketingCache,
  useMarketingFetch,
} from '~/composables/marketing/useMarketingFetch'

const LIST_CACHE_PREFIX = 'marketing-campaigns'

function tenantQuery() {
  const social = useMarketingSocial()
  return {
    social,
    query: { tenant_id: social.tenantId.value || undefined },
  }
}

function invalidateCampaignCaches(campaignId?: string) {
  invalidateMarketingCache(LIST_CACHE_PREFIX)
  if (campaignId)
    invalidateMarketingCache(`campaign-${campaignId}`)
}

export async function createMarketingCampaign(payload: SocialCampaignInput) {
  const { social, query } = tenantQuery()
  const response = await $fetch<{ data: SocialCampaign }>('/api/marketing/social/campaigns', {
    method: 'POST',
    body: { ...payload, ...query },
  })
  invalidateCampaignCaches()
  return response.data
}

export async function updateMarketingCampaign(id: string, payload: SocialCampaignUpdateInput) {
  const { query } = tenantQuery()
  const response = await $fetch<{ data: Record<string, unknown> }>(
    `/api/marketing/social/campaigns/${id}`,
    {
      method: 'PUT',
      body: { ...payload, ...query },
    },
  )
  invalidateCampaignCaches(id)
  return response.data
}

export async function deleteMarketingCampaign(id: string) {
  const { query } = tenantQuery()
  await $fetch(`/api/marketing/social/campaigns/${id}`, {
    method: 'DELETE',
    query,
  })
  invalidateCampaignCaches(id)
}

export function useMarketingCampaigns() {
  const social = useMarketingSocial()
  const statusFilter = ref<SocialCampaignStatus | 'all'>('all')
  const search = ref('')

  const { data, pending, showSkeleton, revalidating, error, refresh } = useMarketingFetch({
    key: () => `${LIST_CACHE_PREFIX}-${social.tenantId.value}-${statusFilter.value}-${search.value}`,
    handler: () => $fetch<{ data: SocialCampaign[], total: number }>(
      '/api/marketing/social/campaigns',
      {
        query: {
          tenant_id: social.tenantId.value || undefined,
          status: statusFilter.value,
          search: search.value || undefined,
        },
      },
    ),
    default: () => ({ data: [] as SocialCampaign[], total: 0 }),
    watch: [social.tenantId, statusFilter],
    enabled: () => Boolean(social.tenantId.value),
  })

  let searchTimer: ReturnType<typeof setTimeout> | null = null
  watch(search, () => {
    if (searchTimer)
      clearTimeout(searchTimer)
    searchTimer = setTimeout(() => refresh(), 300)
  })

  const campaigns = computed(() => data.value?.data ?? [])
  const total = computed(() => data.value?.total ?? 0)

  async function createCampaign(payload: SocialCampaignInput) {
    const created = await createMarketingCampaign(payload)
    await refresh()
    return created
  }

  async function updateCampaign(id: string, payload: SocialCampaignUpdateInput) {
    const updated = await updateMarketingCampaign(id, payload)
    await refresh()
    return updated
  }

  async function deleteCampaign(id: string) {
    await deleteMarketingCampaign(id)
    await refresh()
  }

  return {
    campaigns,
    total,
    pending,
    showSkeleton,
    revalidating,
    error,
    search,
    statusFilter,
    refresh,
    createCampaign,
    updateCampaign,
    deleteCampaign,
  }
}

export function useMarketingCampaignDetail(campaignId: MaybeRefOrGetter<string>) {
  const social = useMarketingSocial()
  const id = computed(() => String(toValue(campaignId)))

  const fetchState = useMarketingFetch({
    key: () => `campaign-${id.value}-${social.tenantId.value}`,
    handler: () => $fetch<{ data: SocialCampaignDetail }>(
      `/api/marketing/social/campaigns/${id.value}`,
      { query: { tenant_id: social.tenantId.value || undefined } },
    ),
    default: () => ({ data: null as SocialCampaignDetail | null }),
    watch: [id, social.tenantId],
    enabled: () => Boolean(social.tenantId.value) && Boolean(id.value),
  })

  async function updateCampaign(payload: SocialCampaignUpdateInput) {
    const updated = await updateMarketingCampaign(id.value, payload)
    await fetchState.refresh()
    return updated
  }

  async function deleteCampaign() {
    await deleteMarketingCampaign(id.value)
  }

  return {
    ...fetchState,
    campaign: computed(() => fetchState.data.value?.data || null),
    updateCampaign,
    deleteCampaign,
  }
}
