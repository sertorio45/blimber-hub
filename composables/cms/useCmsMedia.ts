import type { CmsItem, CmsPage } from '~/lib/cms/contracts'
import type { MediaAssetUsages } from '~/server/utils/media-asset-deletion'
import type { MediaAssetWithPreview } from '~/server/utils/media/service'

import { refDebounced } from '@vueuse/core'
import { computed, ref, watch } from 'vue'

import { cmsCacheKey, invalidateCmsCache, useCmsApi, visibleCmsError } from '~/composables/cms/useCmsApi'
import { useMarketingFetch } from '~/composables/marketing/useMarketingFetch'

export type CmsMediaAsset = MediaAssetWithPreview & {
  size_bytes?: number | null
  sizeBytes?: number | null
}

export type CmsMediaUsages = MediaAssetUsages

export interface CmsMediaUpload {
  id: string
  name: string
  status: 'uploading' | 'error'
  error?: string
}

const MEDIA_SCOPE = 'media'

export function cmsMediaUsageCount(usages: CmsMediaUsages | null | undefined): number {
  return (usages?.socialPosts.length ?? 0) + (usages?.cmsDocuments.length ?? 0)
}

/** 409 `asset_in_use` puts `{ usages }` on `error.details`. */
export function cmsMediaUsagesFromDetails(details: unknown): CmsMediaUsages | null {
  if (!details || typeof details !== 'object')
    return null
  const usages = (details as { usages?: Partial<CmsMediaUsages> }).usages
  if (!usages || typeof usages !== 'object')
    return null
  return {
    socialPosts: Array.isArray(usages.socialPosts) ? usages.socialPosts : [],
    cmsDocuments: Array.isArray(usages.cmsDocuments) ? usages.cmsDocuments : [],
  }
}

export function useCmsMedia() {
  const api = useCmsApi()

  const search = ref('')
  const debouncedSearch = refDebounced(computed(() => search.value.trim()), 300)
  const listKey = computed(() => cmsCacheKey(api.tenantId.value, MEDIA_SCOPE, debouncedSearch.value))

  const firstPage = useMarketingFetch<CmsPage<CmsMediaAsset>>({
    key: () => listKey.value,
    handler: () => api.request<CmsPage<CmsMediaAsset>>('/api/cms/media', {
      query: { search: debouncedSearch.value || undefined, limit: 48 },
    }),
    default: () => ({ data: [], nextCursor: null }),
    enabled: () => api.hasTenant.value,
  })

  const prepended = ref<CmsMediaAsset[]>([])
  const extra = ref<CmsMediaAsset[]>([])
  const extraCursor = ref<string | null | undefined>(undefined)
  const removedIds = ref<Set<string>>(new Set())
  const loadingMore = ref(false)
  const loadMoreError = ref<string | null>(null)
  const uploads = ref<CmsMediaUpload[]>([])

  function resetLocal() {
    prepended.value = []
    extra.value = []
    extraCursor.value = undefined
    removedIds.value = new Set()
    loadMoreError.value = null
  }

  watch(listKey, resetLocal)
  watch(api.tenantId, () => {
    uploads.value = []
  })

  const assets = computed(() => {
    const seen = new Set<string>()
    const merged: CmsMediaAsset[] = []
    for (const asset of [...prepended.value, ...firstPage.data.value.data, ...extra.value]) {
      if (seen.has(asset.id) || removedIds.value.has(asset.id))
        continue
      seen.add(asset.id)
      merged.push(asset)
    }
    return merged
  })

  const nextCursor = computed(() => (extraCursor.value === undefined ? firstPage.data.value.nextCursor : extraCursor.value))

  async function loadMore() {
    const cursor = nextCursor.value
    if (!cursor || loadingMore.value)
      return
    const keyAtStart = listKey.value
    loadingMore.value = true
    loadMoreError.value = null
    try {
      const page = await api.request<CmsPage<CmsMediaAsset>>('/api/cms/media', {
        query: { search: debouncedSearch.value || undefined, cursor, limit: 48 },
      })
      if (keyAtStart !== listKey.value)
        return
      extra.value = [...extra.value, ...page.data]
      extraCursor.value = page.nextCursor
    }
    catch (error: unknown) {
      if (keyAtStart === listKey.value)
        loadMoreError.value = visibleCmsError(error)?.message ?? null
    }
    finally {
      loadingMore.value = false
    }
  }

  async function upload(file: File): Promise<CmsMediaAsset | null> {
    const tenant = api.tenantId.value
    const entry: CmsMediaUpload = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: file.name, status: 'uploading' }
    uploads.value = [...uploads.value, entry]
    const body = new FormData()
    body.append('file', file)
    try {
      const response = await api.request<CmsItem<CmsMediaAsset>>('/api/cms/media', { method: 'POST', body })
      invalidateCmsCache(tenant, MEDIA_SCOPE)
      uploads.value = uploads.value.filter(item => item.id !== entry.id)
      if (tenant === api.tenantId.value)
        prepended.value = [response.data, ...prepended.value]
      return response.data
    }
    catch (error: unknown) {
      const normalized = visibleCmsError(error)
      if (!normalized) {
        uploads.value = uploads.value.filter(item => item.id !== entry.id)
        return null
      }
      uploads.value = uploads.value.map(item => (item.id === entry.id ? { ...item, status: 'error', error: normalized.message } : item))
      return null
    }
  }

  function dismissUpload(id: string) {
    uploads.value = uploads.value.filter(item => item.id !== id)
  }

  async function getAsset(assetId: string) {
    const response = await api.request<CmsItem<CmsMediaAsset & { usages: CmsMediaUsages }>>(`/api/cms/media/${assetId}`)
    return response.data
  }

  /** Throws the normalized error; a 409 `asset_in_use` carries `details.usages`. */
  async function remove(assetId: string) {
    const tenant = api.tenantId.value
    await api.request(`/api/cms/media/${assetId}`, { method: 'DELETE' })
    invalidateCmsCache(tenant, MEDIA_SCOPE)
    removedIds.value = new Set([...removedIds.value, assetId])
  }

  async function refresh() {
    resetLocal()
    await firstPage.refresh()
  }

  return {
    assets,
    search,
    isSearching: computed(() => search.value.trim() !== debouncedSearch.value),
    hasSearch: computed(() => Boolean(debouncedSearch.value)),
    hasMore: computed(() => Boolean(nextCursor.value)),
    loadingMore,
    loadMoreError,
    uploads,
    pending: firstPage.pending,
    showSkeleton: firstPage.showSkeleton,
    loadError: computed(() => visibleCmsError(firstPage.error.value)),
    loadMore,
    upload,
    dismissUpload,
    getAsset,
    remove,
    refresh,
  }
}
