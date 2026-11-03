import { useSupabaseClient } from '#imports'

import { computed, ref } from 'vue'

import { resolveRoleFromSession } from '~/utils/resolve-user-role'

export function useRole() {
  const userRole = ref<string | null>(null)

  async function fetchUserRole() {
    const client = useSupabaseClient()
    const {
      data: { session },
    } = await client.auth.getSession()

    if (!session?.access_token) {
      userRole.value = null
      return
    }

    let tenantId = null
    try {
      const { useTenantStore } = await import('~/stores/tenant')
      tenantId = useTenantStore().tenantId
    }
    catch {}

    userRole.value = await resolveRoleFromSession(client, tenantId, session)
  }

  const isAdmin = computed(() => userRole.value === 'admin')
  const isCliente = computed(() => userRole.value === 'cliente')
  const isFuncionario = computed(() => userRole.value === 'funcionario')

  function hasRole(role: string | string[]): boolean {
    if (!userRole.value)
      return false
    if (Array.isArray(role))
      return role.includes(userRole.value)
    return userRole.value === role
  }

  return {
    userRole,
    fetchUserRole,
    isAdmin,
    isCliente,
    isFuncionario,
    hasRole,
  }
}
