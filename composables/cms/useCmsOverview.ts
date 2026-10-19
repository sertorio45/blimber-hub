import type { MaybeRefOrGetter } from 'vue'
import type { CmsDocumentSummary, CmsItem, CmsSite } from '~/lib/cms/contracts'

import { computed, toValue } from 'vue'

import { cmsCacheKey, useCmsApi, visibleCmsError } from '~/composables/cms/useCmsApi'
import { useMarketingFetch } from '~/composables/marketing/useMarketingFetch'

export interface CmsOverviewCounts {
  pages: number
  publications: number
  articles: number
  news: number
  published: number
  drafts: number
}

export interface CmsOverview {
  site: CmsSite | null
  counts: CmsOverviewCounts
  recent: CmsDocumentSummary[]
}

const EMPTY_COUNTS: CmsOverviewCounts = { pages: 0, publications: 0, articles: 0, news: 0, published: 0, drafts: 0 }

export function useCmsOverview(siteId?: MaybeRefOrGetter<string | null | undefined>) {
  const api = useCmsApi()

  const { data, pending, showSkeleton, error, refresh } = useMarketingFetch<CmsOverview | null>({
    key: () => cmsCacheKey(api.tenantId.value, 'overview', toValue(siteId) ?? 'default'),
    handler: async () => {
      const response = await api.request<CmsItem<CmsOverview>>('/api/cms/overview', {
        query: { siteId: toValue(siteId) ?? undefined },
      })
      return response.data
    },
    default: () => null,
    enabled: () => api.hasTenant.value,
    ttlMs: 30_000,
  })

  const site = computed(() => data.value?.site ?? null)
  const counts = computed(() => data.value?.counts ?? EMPTY_COUNTS)
  const recent = computed(() => data.value?.recent ?? [])
  const loadError = computed(() => visibleCmsError(error.value))

  return {
    overview: data,
    site,
    counts,
    recent,
    pending,
    showSkeleton,
    loadError,
    refresh,
  }
}
