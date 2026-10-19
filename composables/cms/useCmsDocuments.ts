import type { MaybeRefOrGetter } from 'vue'
import type {
  CmsCreateDocumentInput,
  CmsDocument,
  CmsDocumentKind,
  CmsDocumentSummary,
  CmsItem,
  CmsPage,
  CmsPublicationType,
  CmsPublicStatus,
} from '~/lib/cms/contracts'

import { refDebounced } from '@vueuse/core'
import { computed, ref, toValue, watch } from 'vue'

import { cmsCacheKey, invalidateCmsCache, normalizeCmsError, useCmsApi, visibleCmsError } from '~/composables/cms/useCmsApi'
import { useMarketingFetch } from '~/composables/marketing/useMarketingFetch'
import { CMS_LIMITS } from '~/lib/cms/contracts'

export type CmsStatusFilter = CmsPublicStatus | 'all'
export type CmsTypeFilter = CmsPublicationType | 'all'

const LIST_SCOPE: Record<CmsDocumentKind, string> = {
  page: 'pages',
  publication: 'publications',
}

const LIST_ENDPOINT: Record<CmsDocumentKind, string> = {
  page: '/api/cms/pages',
  publication: '/api/cms/publications',
}

/** Create/trash without a list instance (dialogs, editor). Lists and overview are invalidated per tenant. */
export function useCmsDocumentMutations() {
  const api = useCmsApi()

  function invalidateLists(tenant: string | null) {
    invalidateCmsCache(tenant, LIST_SCOPE.page, LIST_SCOPE.publication, 'overview')
  }

  async function createDocument(input: CmsCreateDocumentInput): Promise<CmsDocument> {
    const tenant = api.tenantId.value
    const response = await api.request<CmsItem<CmsDocument>>('/api/cms/documents', { method: 'POST', body: input })
    invalidateLists(tenant)
    return response.data
  }

  async function trashDocument(documentId: string): Promise<void> {
    const tenant = api.tenantId.value
    await api.request(`/api/cms/documents/${documentId}`, { method: 'DELETE' })
    invalidateLists(tenant)
  }

  return { createDocument, trashDocument, invalidateLists }
}

export interface UseCmsDocumentsOptions {
  kind: CmsDocumentKind
  siteId: MaybeRefOrGetter<string | null | undefined>
  pageSize?: number
}

export function useCmsDocuments(options: UseCmsDocumentsOptions) {
  const api = useCmsApi()
  const mutations = useCmsDocumentMutations()
  const limit = options.pageSize ?? CMS_LIMITS.defaultPageSize

  const status = ref<CmsStatusFilter>('all')
  const type = ref<CmsTypeFilter>('all')
  const search = ref('')
  const debouncedSearch = refDebounced(computed(() => search.value.trim()), 300)

  function query(cursor?: string | null) {
    return {
      siteId: toValue(options.siteId) ?? undefined,
      status: status.value === 'all' ? undefined : status.value,
      type: options.kind === 'publication' && type.value !== 'all' ? type.value : undefined,
      search: debouncedSearch.value || undefined,
      cursor: cursor ?? undefined,
      limit,
    }
  }

  const listKey = computed(() => cmsCacheKey(
    api.tenantId.value,
    LIST_SCOPE[options.kind],
    toValue(options.siteId),
    status.value,
    options.kind === 'publication' ? type.value : '',
    debouncedSearch.value,
  ))

  // First page is cached (instant back-navigation); further pages stay in memory for the current key only.
  const firstPage = useMarketingFetch<CmsPage<CmsDocumentSummary>>({
    key: () => listKey.value,
    handler: () => api.request<CmsPage<CmsDocumentSummary>>(LIST_ENDPOINT[options.kind], { query: query() }),
    default: () => ({ data: [], nextCursor: null }),
    enabled: () => api.hasTenant.value && Boolean(toValue(options.siteId)),
  })

  const extraItems = ref<CmsDocumentSummary[]>([])
  const extraCursor = ref<string | null | undefined>(undefined)
  const loadingMore = ref(false)
  const loadMoreError = ref<string | null>(null)
  const removedIds = ref<Set<string>>(new Set())

  watch(listKey, () => {
    extraItems.value = []
    extraCursor.value = undefined
    loadMoreError.value = null
    removedIds.value = new Set()
  })

  const items = computed(() => {
    const seen = new Set<string>()
    const merged: CmsDocumentSummary[] = []
    for (const item of [...firstPage.data.value.data, ...extraItems.value]) {
      if (seen.has(item.id) || removedIds.value.has(item.id))
        continue
      seen.add(item.id)
      merged.push(item)
    }
    return merged
  })

  const nextCursor = computed(() => (extraCursor.value === undefined ? firstPage.data.value.nextCursor : extraCursor.value))
  const hasMore = computed(() => Boolean(nextCursor.value))

  async function loadMore() {
    const cursor = nextCursor.value
    if (!cursor || loadingMore.value)
      return
    const keyAtStart = listKey.value
    loadingMore.value = true
    loadMoreError.value = null
    try {
      const page = await api.request<CmsPage<CmsDocumentSummary>>(LIST_ENDPOINT[options.kind], { query: query(cursor) })
      if (keyAtStart !== listKey.value)
        return
      extraItems.value = [...extraItems.value, ...page.data]
      extraCursor.value = page.nextCursor
    }
    catch (error: unknown) {
      if (keyAtStart === listKey.value) {
        const normalized = visibleCmsError(error)
        loadMoreError.value = normalized?.message ?? null
      }
    }
    finally {
      loadingMore.value = false
    }
  }

  async function trash(documentId: string) {
    await mutations.trashDocument(documentId)
    removedIds.value = new Set([...removedIds.value, documentId])
  }

  async function refresh() {
    extraItems.value = []
    extraCursor.value = undefined
    removedIds.value = new Set()
    await firstPage.refresh()
  }

  const hasFilters = computed(() => status.value !== 'all' || type.value !== 'all' || Boolean(debouncedSearch.value))
  const loadError = computed(() => visibleCmsError(firstPage.error.value))
  const isSearching = computed(() => search.value.trim() !== debouncedSearch.value)

  function clearFilters() {
    status.value = 'all'
    type.value = 'all'
    search.value = ''
  }

  return {
    items,
    status,
    type,
    search,
    hasFilters,
    isSearching,
    hasMore,
    loadingMore,
    loadMoreError,
    pending: firstPage.pending,
    showSkeleton: firstPage.showSkeleton,
    revalidating: firstPage.revalidating,
    loadError,
    loadMore,
    refresh,
    clearFilters,
    trash,
    createDocument: mutations.createDocument,
    normalizeError: normalizeCmsError,
  }
}
