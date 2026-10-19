import type { MaybeRefOrGetter } from 'vue'
import type { CmsApiError } from '~/composables/cms/useCmsApi'
import type { CmsDocument, CmsItem, CmsPage, CmsRevision, CmsSaveDraftInput } from '~/lib/cms/contracts'

import { ref, shallowRef, toValue, watch } from 'vue'

import { normalizeCmsError, useCmsApi, visibleCmsError } from '~/composables/cms/useCmsApi'
import { useCmsDocumentMutations } from '~/composables/cms/useCmsDocuments'

export type CmsRevisionSummary = Omit<CmsRevision, 'snapshot'>

export interface CmsPublishResult {
  revisionId: string
  revisionNumber: number
  path: string
  publishedAt: string
}

/**
 * The editor always loads the document from the network (no SWR cache): a
 * stale `editVersion` would turn the first autosave into a version conflict.
 */
export function useCmsDocument(documentId: MaybeRefOrGetter<string>) {
  const api = useCmsApi()
  const mutations = useCmsDocumentMutations()

  const document = shallowRef<CmsDocument | null>(null)
  const pending = ref(false)
  const loadError = ref<CmsApiError | null>(null)
  let loadToken = 0

  function url(suffix = '') {
    return `/api/cms/documents/${toValue(documentId)}${suffix}`
  }

  async function fetchLatest(): Promise<CmsDocument> {
    const response = await api.request<CmsItem<CmsDocument>>(url())
    return response.data
  }

  async function load(): Promise<CmsDocument | null> {
    const token = ++loadToken
    pending.value = true
    loadError.value = null
    try {
      const latest = await fetchLatest()
      if (token !== loadToken)
        return null
      document.value = latest
      return latest
    }
    catch (error: unknown) {
      if (token === loadToken)
        loadError.value = visibleCmsError(error)
      return null
    }
    finally {
      if (token === loadToken)
        pending.value = false
    }
  }

  /** Forget everything about the current document (company switch, route change). */
  function clear() {
    loadToken++
    document.value = null
    loadError.value = null
    pending.value = false
  }

  async function saveDraft(input: CmsSaveDraftInput): Promise<CmsDocument> {
    const response = await api.request<CmsItem<CmsDocument>>(url('/draft'), { method: 'PUT', body: input })
    document.value = response.data
    return response.data
  }

  async function publish(expectedVersion: number): Promise<CmsPublishResult> {
    const response = await api.request<CmsItem<CmsPublishResult>>(url('/publish'), {
      method: 'POST',
      body: { expectedVersion },
    })
    mutations.invalidateLists(api.tenantId.value)
    return response.data
  }

  async function unpublish(): Promise<void> {
    await api.request(url('/unpublish'), { method: 'POST' })
    mutations.invalidateLists(api.tenantId.value)
  }

  async function trash(): Promise<void> {
    await mutations.trashDocument(toValue(documentId))
  }

  async function listRevisions(cursor?: string | null): Promise<CmsPage<CmsRevisionSummary>> {
    return api.request<CmsPage<CmsRevisionSummary>>(url('/revisions'), { query: { cursor: cursor ?? undefined } })
  }

  async function restoreRevision(revisionId: string, expectedVersion: number): Promise<void> {
    await api.request(url(`/revisions/${revisionId}/restore`), { method: 'POST', body: { expectedVersion } })
    mutations.invalidateLists(api.tenantId.value)
  }

  watch(() => toValue(documentId), (next, previous) => {
    if (next !== previous)
      clear()
  })

  return {
    document,
    pending,
    loadError,
    load,
    clear,
    fetchLatest,
    saveDraft,
    publish,
    unpublish,
    trash,
    listRevisions,
    restoreRevision,
    normalizeError: normalizeCmsError,
  }
}
