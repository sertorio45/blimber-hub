import type { MaybeRefOrGetter } from 'vue'
import type { CmsAuthor, CmsCreateAuthorInput, CmsItem, CmsUpdateAuthorInput } from '~/lib/cms/contracts'

import { computed, toValue } from 'vue'

import { cmsCacheKey, invalidateCmsCache, useCmsApi, visibleCmsError } from '~/composables/cms/useCmsApi'
import { useMarketingFetch } from '~/composables/marketing/useMarketingFetch'

const AUTHORS_SCOPE = 'authors'

export function useCmsAuthors(siteId: MaybeRefOrGetter<string | null | undefined>) {
  const api = useCmsApi()
  const site = computed(() => toValue(siteId) || '')

  const list = useMarketingFetch<CmsItem<CmsAuthor[]>>({
    key: () => cmsCacheKey(api.tenantId.value, AUTHORS_SCOPE, site.value),
    handler: () => api.request<CmsItem<CmsAuthor[]>>('/api/cms/authors', { query: { siteId: site.value } }),
    default: () => ({ data: [] }),
    enabled: () => api.hasTenant.value && Boolean(site.value),
  })

  const authors = computed(() => list.data.value.data ?? [])

  function remember(author: CmsAuthor) {
    const current = list.data.value.data ?? []
    const next = current.some(item => item.id === author.id)
      ? current.map(item => (item.id === author.id ? author : item))
      : [...current, author].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    list.data.value = { data: next }
  }

  async function createAuthor(input: Omit<CmsCreateAuthorInput, 'siteId'>): Promise<CmsAuthor> {
    const tenant = api.tenantId.value
    const response = await api.request<CmsItem<CmsAuthor>>('/api/cms/authors', {
      method: 'POST',
      body: { ...input, siteId: site.value },
    })
    invalidateCmsCache(tenant, AUTHORS_SCOPE)
    if (tenant === api.tenantId.value)
      remember(response.data)
    return response.data
  }

  async function updateAuthor(authorId: string, input: CmsUpdateAuthorInput): Promise<CmsAuthor> {
    const tenant = api.tenantId.value
    const response = await api.request<CmsItem<CmsAuthor>>(`/api/cms/authors/${authorId}`, {
      method: 'PATCH',
      body: input,
    })
    invalidateCmsCache(tenant, AUTHORS_SCOPE)
    if (tenant === api.tenantId.value)
      remember(response.data)
    return response.data
  }

  async function deleteAuthor(authorId: string): Promise<void> {
    const tenant = api.tenantId.value
    await api.request(`/api/cms/authors/${authorId}`, { method: 'DELETE' })
    invalidateCmsCache(tenant, AUTHORS_SCOPE)
    if (tenant === api.tenantId.value)
      list.data.value = { data: (list.data.value.data ?? []).filter(item => item.id !== authorId) }
  }

  return {
    authors,
    pending: list.pending,
    showSkeleton: list.showSkeleton,
    loadError: computed(() => visibleCmsError(list.error.value)),
    refresh: list.refresh,
    createAuthor,
    updateAuthor,
    deleteAuthor,
  }
}
