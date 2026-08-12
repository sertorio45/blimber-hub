import { ORGANIZATION_HEADER, TENANT_HEADER } from '~/constants/workspace'

/**
 * Sends the requested workspace on API calls. These headers are a *request* for
 * a scope: the Nitro resolver validates both ids against memberships, portfolio
 * links and contracted modules before honouring them.
 */
export default defineNuxtPlugin(() => {
  const session = useSupabaseSession()

  globalThis.$fetch = $fetch.create({
    onRequest({ request, options }) {
      const url = typeof request === 'string' ? request : String(request)
      if (!url.includes('/api/'))
        return

      const tenantStore = useTenantStore()
      const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData

      const headers = options.headers instanceof Headers
        ? options.headers
        : new Headers(options.headers as HeadersInit)

      if (isFormData) {
        // Never set Content-Type on multipart — the browser must add the boundary.
        headers.delete('content-type')
        headers.delete('Content-Type')
      }

      if (session.value?.access_token && !headers.has('Authorization'))
        headers.set('Authorization', `Bearer ${session.value.access_token}`)

      if (tenantStore.tenantId && !headers.has(TENANT_HEADER))
        headers.set(TENANT_HEADER, tenantStore.tenantId)

      if (tenantStore.organizationId && !headers.has(ORGANIZATION_HEADER))
        headers.set(ORGANIZATION_HEADER, tenantStore.organizationId)

      options.headers = headers
    },
  })
})
