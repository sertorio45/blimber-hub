import { createSharedComposable } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, watch } from 'vue'

import { CmsRequestError, DEFAULT_CMS_ERROR_MESSAGES, normalizeCmsError } from '~/composables/cms/cmsErrors'
import { resetCmsSessions } from '~/composables/cms/cmsSession'
import { invalidateMarketingCache } from '~/composables/marketing/useMarketingFetch'
import { TENANT_HEADER } from '~/constants/workspace'

import { useTenantStore } from '~/stores/tenant'

export { CmsRequestError, isCmsAbort, normalizeCmsError, visibleCmsError } from '~/composables/cms/cmsErrors'
export type { CmsApiError, CmsClientErrorCode } from '~/composables/cms/cmsErrors'

// ---- Cache keys ----

export const CMS_CACHE_PREFIX = 'cms'

/** Every CMS cache key starts with the tenant id, so one company's payload is never served to another. */
export function cmsCacheKey(tenantId: string | null | undefined, ...parts: Array<string | number | null | undefined>): string {
  return [CMS_CACHE_PREFIX, tenantId || 'none', ...parts.map(part => part ?? '')].join(':')
}

export function invalidateCmsCache(tenantId: string | null | undefined, ...scopes: string[]): void {
  const base = cmsCacheKey(tenantId)
  if (!scopes.length) {
    invalidateMarketingCache(`${base}:`)
    return
  }
  invalidateMarketingCache(scopes.map(scope => `${base}:${scope}`))
}

// ---- In-flight requests ----

const inFlight = new Set<AbortController>()

export function abortCmsRequests(): void {
  for (const controller of inFlight)
    controller.abort()
  inFlight.clear()
  // Drop editor state before any route-leave flush can save into the new company.
  resetCmsSessions()
}

/**
 * Single watcher per app: switching company aborts every CMS request still in
 * flight and drops the previous company's cached payloads.
 */
const useCmsTenantGuard = createSharedComposable(() => {
  const { tenantId } = storeToRefs(useTenantStore())
  watch(tenantId, (next, previous) => {
    if (previous && next !== previous) {
      abortCmsRequests()
      invalidateCmsCache(previous)
    }
  })
  return { tenantId }
})

type CmsMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface CmsRequestOptions {
  method?: CmsMethod
  query?: Record<string, string | number | boolean | null | undefined>
  body?: unknown
  signal?: AbortSignal
}

function cleanQuery(query?: CmsRequestOptions['query']): Record<string, string | number | boolean> | undefined {
  if (!query)
    return undefined
  const result: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '')
      continue
    result[key] = value
  }
  return result
}

export function useCmsApi() {
  const { tenantId } = useCmsTenantGuard()
  const hasTenant = computed(() => Boolean(tenantId.value))

  async function request<T>(url: string, options: CmsRequestOptions = {}): Promise<T> {
    // Snapshot the tenant: the header and any cache key built by the caller must agree.
    const scopedTenant = tenantId.value
    if (!scopedTenant)
      throw new CmsRequestError({ status: 0, code: 'no_tenant', message: DEFAULT_CMS_ERROR_MESSAGES.no_tenant! })

    const controller = new AbortController()
    const external = options.signal
    if (external) {
      if (external.aborted)
        controller.abort()
      else
        external.addEventListener('abort', () => controller.abort(), { once: true })
    }
    inFlight.add(controller)

    try {
      return await $fetch<T>(url, {
        method: options.method ?? 'GET',
        query: cleanQuery(options.query),
        headers: { [TENANT_HEADER]: scopedTenant },
        signal: controller.signal,
        body: options.body as FormData | Record<string, unknown> | undefined,
      }) as T
    }
    catch (error: unknown) {
      throw new CmsRequestError(normalizeCmsError(error))
    }
    finally {
      inFlight.delete(controller)
    }
  }

  return {
    tenantId,
    hasTenant,
    request,
  }
}
