import type { CmsCreateSiteInput, CmsItem, CmsPage, CmsSite, CmsUpdateSiteInput } from '~/lib/cms/contracts'

import { computed } from 'vue'

import { cmsCacheKey, invalidateCmsCache, useCmsApi, visibleCmsError } from '~/composables/cms/useCmsApi'
import { useMarketingFetch } from '~/composables/marketing/useMarketingFetch'

/** Selected site per tenant, so switching company never carries a foreign site id along. */
function useSelectedSites() {
  return useState<Record<string, string>>('cms-selected-site', () => ({}))
}

export function useCmsSites() {
  const api = useCmsApi()
  const selected = useSelectedSites()

  // `useMarketingFetch` is a generic tenant-agnostic SWR loader; reusing it keeps one cache/invalidation model across modules.
  const { data, pending, showSkeleton, error, refresh } = useMarketingFetch<CmsPage<CmsSite>>({
    key: () => cmsCacheKey(api.tenantId.value, 'sites'),
    handler: () => api.request<CmsPage<CmsSite>>('/api/cms/sites', { query: { limit: 100 } }),
    default: () => ({ data: [], nextCursor: null }),
    enabled: () => api.hasTenant.value,
  })

  const sites = computed(() => data.value.data)
  const hasMultipleSites = computed(() => sites.value.length > 1)

  const currentSite = computed<CmsSite | null>(() => {
    const tenant = api.tenantId.value
    const wanted = tenant ? selected.value[tenant] : undefined
    return sites.value.find(site => site.id === wanted) ?? sites.value[0] ?? null
  })

  const loadError = computed(() => visibleCmsError(error.value))

  function selectSite(siteId: string) {
    const tenant = api.tenantId.value
    if (!tenant)
      return
    selected.value = { ...selected.value, [tenant]: siteId }
  }

  function upsertLocal(site: CmsSite) {
    const exists = sites.value.some(item => item.id === site.id)
    const list = exists
      ? sites.value.map(item => (item.id === site.id ? site : item))
      : [...sites.value, site]
    data.value = { ...data.value, data: list }
  }

  async function createSite(input: CmsCreateSiteInput): Promise<CmsSite> {
    const tenant = api.tenantId.value
    const response = await api.request<CmsItem<CmsSite>>('/api/cms/sites', { method: 'POST', body: input })
    invalidateCmsCache(tenant)
    if (tenant === api.tenantId.value) {
      upsertLocal(response.data)
      selectSite(response.data.id)
    }
    return response.data
  }

  async function updateSite(siteId: string, input: CmsUpdateSiteInput): Promise<CmsSite> {
    const tenant = api.tenantId.value
    const response = await api.request<CmsItem<CmsSite>>(`/api/cms/sites/${siteId}`, { method: 'PATCH', body: input })
    invalidateCmsCache(tenant, 'sites', 'overview')
    if (tenant === api.tenantId.value)
      upsertLocal(response.data)
    return response.data
  }

  return {
    sites,
    currentSite,
    hasMultipleSites,
    pending,
    showSkeleton,
    loadError,
    refresh,
    selectSite,
    createSite,
    updateSite,
  }
}
