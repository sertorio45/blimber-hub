import type { MaybeRefOrGetter } from 'vue'
import type {
  CmsCreateTaxonomyInput,
  CmsCreateTermInput,
  CmsItem,
  CmsTaxonomy,
  CmsTaxonomyKind,
  CmsTerm,
  CmsUpdateTaxonomyInput,
  CmsUpdateTermInput,
} from '~/lib/cms/contracts'

import { computed, toValue } from 'vue'

import { cmsCacheKey, invalidateCmsCache, useCmsApi, visibleCmsError } from '~/composables/cms/useCmsApi'
import { useMarketingFetch } from '~/composables/marketing/useMarketingFetch'

const TAXONOMY_SCOPE = 'taxonomies'
const TERM_SCOPE = 'terms'

export function useCmsTaxonomies(siteId: MaybeRefOrGetter<string | null | undefined>) {
  const api = useCmsApi()
  const site = computed(() => toValue(siteId) || '')

  const taxonomyList = useMarketingFetch<CmsItem<CmsTaxonomy[]>>({
    key: () => cmsCacheKey(api.tenantId.value, TAXONOMY_SCOPE, site.value),
    handler: () => api.request<CmsItem<CmsTaxonomy[]>>('/api/cms/taxonomies', { query: { siteId: site.value } }),
    default: () => ({ data: [] }),
    enabled: () => api.hasTenant.value && Boolean(site.value),
  })

  const termList = useMarketingFetch<CmsItem<CmsTerm[]>>({
    key: () => cmsCacheKey(api.tenantId.value, TERM_SCOPE, site.value),
    handler: () => api.request<CmsItem<CmsTerm[]>>('/api/cms/terms', { query: { siteId: site.value } }),
    default: () => ({ data: [] }),
    enabled: () => api.hasTenant.value && Boolean(site.value),
  })

  const taxonomies = computed(() => taxonomyList.data.value.data ?? [])
  const terms = computed(() => termList.data.value.data ?? [])

  function rememberTaxonomy(taxonomy: CmsTaxonomy) {
    const current = taxonomyList.data.value.data ?? []
    const next = current.some(item => item.id === taxonomy.id)
      ? current.map(item => (item.id === taxonomy.id ? taxonomy : item))
      : [...current, taxonomy]
    taxonomyList.data.value = { data: next }
  }

  function rememberTerm(term: CmsTerm) {
    const current = termList.data.value.data ?? []
    const next = current.some(item => item.id === term.id)
      ? current.map(item => (item.id === term.id ? term : item))
      : [...current, term].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    termList.data.value = { data: next }
  }

  function dropCaches(tenant: string | null) {
    invalidateCmsCache(tenant, TAXONOMY_SCOPE, TERM_SCOPE)
  }

  async function createTaxonomy(input: Omit<CmsCreateTaxonomyInput, 'siteId'>): Promise<CmsTaxonomy> {
    const tenant = api.tenantId.value
    const response = await api.request<CmsItem<CmsTaxonomy>>('/api/cms/taxonomies', {
      method: 'POST',
      body: { ...input, siteId: site.value },
    })
    dropCaches(tenant)
    if (tenant === api.tenantId.value)
      rememberTaxonomy(response.data)
    return response.data
  }

  async function updateTaxonomy(taxonomyId: string, input: CmsUpdateTaxonomyInput): Promise<CmsTaxonomy> {
    const tenant = api.tenantId.value
    const response = await api.request<CmsItem<CmsTaxonomy>>(`/api/cms/taxonomies/${taxonomyId}`, {
      method: 'PATCH',
      body: input,
    })
    dropCaches(tenant)
    if (tenant === api.tenantId.value)
      rememberTaxonomy(response.data)
    return response.data
  }

  async function deleteTaxonomy(taxonomyId: string): Promise<void> {
    const tenant = api.tenantId.value
    await api.request(`/api/cms/taxonomies/${taxonomyId}`, { method: 'DELETE' })
    dropCaches(tenant)
    if (tenant === api.tenantId.value) {
      taxonomyList.data.value = { data: (taxonomyList.data.value.data ?? []).filter(item => item.id !== taxonomyId) }
      termList.data.value = { data: (termList.data.value.data ?? []).filter(item => item.taxonomyId !== taxonomyId) }
    }
  }

  async function createTerm(input: Omit<CmsCreateTermInput, 'siteId'>): Promise<CmsTerm> {
    const tenant = api.tenantId.value
    const response = await api.request<CmsItem<CmsTerm>>('/api/cms/terms', {
      method: 'POST',
      body: { ...input, siteId: site.value },
    })
    dropCaches(tenant)
    if (tenant === api.tenantId.value) {
      rememberTerm(response.data)
      if (!taxonomies.value.some(item => item.id === response.data.taxonomyId))
        await taxonomyList.refresh()
    }
    return response.data
  }

  async function updateTerm(termId: string, input: CmsUpdateTermInput): Promise<CmsTerm> {
    const tenant = api.tenantId.value
    const response = await api.request<CmsItem<CmsTerm>>(`/api/cms/terms/${termId}`, {
      method: 'PATCH',
      body: input,
    })
    dropCaches(tenant)
    if (tenant === api.tenantId.value)
      rememberTerm(response.data)
    return response.data
  }

  async function deleteTerm(termId: string): Promise<void> {
    const tenant = api.tenantId.value
    await api.request(`/api/cms/terms/${termId}`, { method: 'DELETE' })
    dropCaches(tenant)
    if (tenant === api.tenantId.value)
      termList.data.value = { data: (termList.data.value.data ?? []).filter(item => item.id !== termId) }
  }

  function termsOf(kind: CmsTaxonomyKind): CmsTerm[] {
    return terms.value.filter(term => term.kind === kind)
  }

  return {
    taxonomies,
    terms,
    pending: computed(() => taxonomyList.pending.value || termList.pending.value),
    showSkeleton: computed(() => taxonomyList.showSkeleton.value || termList.showSkeleton.value),
    loadError: computed(() => visibleCmsError(taxonomyList.error.value) ?? visibleCmsError(termList.error.value)),
    refresh: async () => {
      await Promise.all([taxonomyList.refresh(), termList.refresh()])
    },
    termsOf,
    createTaxonomy,
    updateTaxonomy,
    deleteTaxonomy,
    createTerm,
    updateTerm,
    deleteTerm,
  }
}
