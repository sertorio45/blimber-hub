import type { MaybeRefOrGetter } from 'vue'
import type {
  CmsCollectionDefinition,
  CmsCreateCollectionInput,
  CmsEntry,
  CmsItem,
  CmsPage,
  CmsSaveEntryInput,
  CmsUpdateCollectionInput,
} from '~/lib/cms/contracts'

import { computed, ref, toValue, watch } from 'vue'

import { cmsCacheKey, invalidateCmsCache, useCmsApi, visibleCmsError } from '~/composables/cms/useCmsApi'
import { useMarketingFetch } from '~/composables/marketing/useMarketingFetch'

const DEFINITIONS_SCOPE = 'collections'

function entriesScope(definitionId: string): string {
  return `collection-entries:${definitionId}`
}

export function useCmsCollections(siteId: MaybeRefOrGetter<string | null>) {
  const api = useCmsApi()
  const resolvedSiteId = computed(() => toValue(siteId))

  const list = useMarketingFetch<CmsItem<CmsCollectionDefinition[]>>({
    key: () => cmsCacheKey(api.tenantId.value, DEFINITIONS_SCOPE, resolvedSiteId.value),
    handler: () => api.request<CmsItem<CmsCollectionDefinition[]>>('/api/cms/collections', {
      query: { siteId: resolvedSiteId.value || undefined },
    }),
    default: () => ({ data: [] }),
    enabled: () => api.hasTenant.value && Boolean(resolvedSiteId.value),
  })

  const definitions = computed(() => Array.isArray(list.data.value?.data) ? list.data.value.data : [])

  function invalidate() {
    invalidateCmsCache(api.tenantId.value, DEFINITIONS_SCOPE)
  }

  async function createDefinition(input: CmsCreateCollectionInput): Promise<CmsCollectionDefinition> {
    const response = await api.request<CmsItem<CmsCollectionDefinition>>('/api/cms/collections', {
      method: 'POST',
      body: input,
    })
    invalidate()
    return response.data
  }

  async function updateDefinition(id: string, input: CmsUpdateCollectionInput): Promise<CmsCollectionDefinition> {
    const response = await api.request<CmsItem<CmsCollectionDefinition>>(`/api/cms/collections/${id}`, {
      method: 'PATCH',
      body: input,
    })
    invalidate()
    return response.data
  }

  async function deleteDefinition(id: string): Promise<void> {
    await api.request(`/api/cms/collections/${id}`, { method: 'DELETE' })
    invalidateCmsCache(api.tenantId.value, DEFINITIONS_SCOPE, entriesScope(id))
  }

  return {
    definitions,
    pending: list.pending,
    showSkeleton: list.showSkeleton,
    loadError: computed(() => visibleCmsError(list.error.value)),
    refresh: list.refresh,
    createDefinition,
    updateDefinition,
    deleteDefinition,
  }
}

export function useCmsCollectionEntries(definitionId: MaybeRefOrGetter<string | null>) {
  const api = useCmsApi()
  const resolvedId = computed(() => toValue(definitionId))
  const local = ref<CmsEntry[] | null>(null)

  const list = useMarketingFetch<CmsPage<CmsEntry>>({
    key: () => cmsCacheKey(api.tenantId.value, resolvedId.value ? entriesScope(resolvedId.value) : 'collection-entries'),
    handler: () => api.request<CmsPage<CmsEntry>>(`/api/cms/collections/${resolvedId.value}/entries`, {
      query: { limit: 100 },
    }),
    default: () => ({ data: [], nextCursor: null }),
    enabled: () => api.hasTenant.value && Boolean(resolvedId.value),
  })

  watch(resolvedId, () => {
    local.value = null
  })

  const entries = computed(() => local.value ?? (Array.isArray(list.data.value?.data) ? list.data.value.data : []))

  function remember(next: CmsEntry[]) {
    local.value = next
  }

  async function refresh() {
    local.value = null
    await list.refresh()
  }

  async function createEntry(input: CmsSaveEntryInput): Promise<CmsEntry> {
    const id = resolvedId.value
    if (!id)
      throw new Error('Coleção não selecionada')
    const response = await api.request<CmsItem<CmsEntry>>(`/api/cms/collections/${id}/entries`, {
      method: 'POST',
      body: input,
    })
    remember([response.data, ...entries.value.filter(entry => entry.id !== response.data.id)])
    return response.data
  }

  async function updateEntry(entryId: string, input: CmsSaveEntryInput): Promise<CmsEntry> {
    const id = resolvedId.value
    if (!id)
      throw new Error('Coleção não selecionada')
    const response = await api.request<CmsItem<CmsEntry>>(`/api/cms/collections/${id}/entries/${entryId}`, {
      method: 'PATCH',
      body: input,
    })
    remember(entries.value.map(entry => entry.id === response.data.id ? response.data : entry))
    return response.data
  }

  async function deleteEntry(entryId: string): Promise<void> {
    const id = resolvedId.value
    if (!id)
      return
    await api.request(`/api/cms/collections/${id}/entries/${entryId}`, { method: 'DELETE' })
    remember(entries.value.filter(entry => entry.id !== entryId))
  }

  return {
    entries,
    pending: list.pending,
    showSkeleton: list.showSkeleton,
    loadError: computed(() => visibleCmsError(list.error.value)),
    refresh,
    createEntry,
    updateEntry,
    deleteEntry,
  }
}

export function useCmsCollection(definitionId: MaybeRefOrGetter<string | null>) {
  const api = useCmsApi()
  const resolvedId = computed(() => toValue(definitionId))

  const detail = useMarketingFetch<CmsItem<CmsCollectionDefinition | null>>({
    key: () => cmsCacheKey(api.tenantId.value, 'collection', resolvedId.value),
    handler: () => api.request<CmsItem<CmsCollectionDefinition>>(`/api/cms/collections/${resolvedId.value}`),
    default: () => ({ data: null }),
    enabled: () => api.hasTenant.value && Boolean(resolvedId.value),
  })

  return {
    definition: computed(() => detail.data.value?.data ?? null),
    pending: detail.pending,
    showSkeleton: detail.showSkeleton,
    loadError: computed(() => visibleCmsError(detail.error.value)),
    refresh: detail.refresh,
  }
}
