import type { WorkspaceContextResponse, WorkspaceContextTenant } from '~/types/workspace'
import { useSupabaseClient } from '#imports'

import { computed, ref, watch } from 'vue'

import { isStaffRole, isTenantScopedRole } from '~/constants/roles'
import { useWorkspace } from '~/composables/useWorkspace'
import { useTenantStore } from '~/stores/tenant'

/**
 * Tenant selection for the UI. Every switch goes through the workspace resolver,
 * so the browser can only *ask* for a workspace — the server decides.
 *
 * Does not auto-fetch on mount: guest pages (login) call useTenant for helpers
 * only. Authenticated bootstrap lives in tenant-init plugin, useTenantPage,
 * and the post-login path in useAuth / SignIn.
 */

const tenantId = ref<string | null>(null)
const tenants = ref<WorkspaceContextTenant[]>([])

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_PATTERN.test(value)
}

function fetchStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object')
    return undefined
  const e = error as { statusCode?: number, status?: number, response?: { status?: number } }
  return e.statusCode ?? e.status ?? e.response?.status
}

const currentTenant = computed(() => {
  return tenants.value.find(item => item.id === tenantId.value) || null
})

if (import.meta.client) {
  window.addEventListener('tenant-changed', async (event: Event) => {
    const nextId = (event as CustomEvent).detail?.tenantId
    if (!isUuid(nextId))
      return
    await useWorkspace().switchContext({ tenantId: nextId })
  })
}

export function useTenant() {
  const tenantStore = useTenantStore()
  const supabase = useSupabaseClient()
  const workspace = useWorkspace()

  watch(() => workspace.context.value, (context) => {
    tenantId.value = context?.tenant?.id ?? null
    tenants.value = context?.tenants ?? []
  }, { immediate: true })

  watch(() => tenantStore.tenantId, (value) => {
    if (value !== tenantId.value && isUuid(value))
      tenantId.value = value
  }, { immediate: true })

  async function listTenants(): Promise<WorkspaceContextTenant[]> {
    const response = await $fetch<{ tenants: WorkspaceContextTenant[] }>('/api/tenants/accessible')
    tenants.value = response.tenants || []
    return tenants.value
  }

  async function setCurrentTenantById(id: string) {
    if (!isUuid(id))
      return
    await workspace.switchContext({ tenantId: id })
  }

  async function setCurrentTenantBySlug(slug: string) {
    const { data, error } = await supabase.from('tenant').select('id').eq('slug', slug).single()
    if (error)
      throw error
    const resolvedId = (data as { id?: string } | null)?.id
    if (!resolvedId)
      throw new Error('Tenant não encontrado')
    await workspace.switchContext({ tenantId: resolvedId })
  }

  function setTenant(newTenantId: string) {
    void setCurrentTenantById(newTenantId)
  }

  /**
   * Kept for the sign-in flow. The tenant now comes from the server-resolved
   * context instead of being trusted straight out of the JWT.
   */
  async function setTenantFromJWT() {
    await workspace.load()
  }

  /**
   * Loads workspace when a session exists. No-op for guests; swallows 401 so
   * login/register never surface an unhandled mounted error.
   * Uses getSession (not only the user ref) so post-login bootstrap still runs
   * if the reactive user has not caught up yet.
   */
  async function bootstrapTenantContext(): Promise<WorkspaceContextResponse | null> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session)
      return null

    try {
      const context = await workspace.load()
      if (!context.tenant && context.tenants.length)
        await workspace.switchContext({ tenantId: context.tenants[0].id })
      return context
    }
    catch (error) {
      if (fetchStatus(error) === 401)
        return null
      throw error
    }
  }

  function restoreLastTenant() {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session)
        return
      try {
        await workspace.load()
      }
      catch (error) {
        if (fetchStatus(error) !== 401)
          console.error('Falha ao restaurar tenant:', error)
      }
    })()
  }

  return {
    tenantId,
    setTenant,
    clearTenant: tenantStore.clearTenant,
    listTenants,
    restoreLastTenant,
    setCurrentTenantById,
    setCurrentTenantBySlug,
    currentTenant,
    setTenantFromJWT,
    bootstrapTenantContext,
    setTenantId: (id: string | null) => (isUuid(id) ? setCurrentTenantById(id) : Promise.resolve()),
    tenants,
    isStaffRole,
    isTenantScopedRole,
  }
}
