export default defineNuxtRouteMiddleware(async (to, _from) => {
  const user = useSupabaseUser()
  const client = useSupabaseClient()

  // Se não há usuário logado ou o route não tem definições de roles necessárias
  if (!user.value || !to.meta.requiredRoles) {
    return
  }

  // Rotas públicas que não precisam de autenticação/role
  const publicPages = ['/login', '/login-basic', '/register', '/forgot-password', '/reset-password', '/403', '/404', '/confirm']

  try {
    // Obter o token da sessão
    const {
      data: { session },
    } = await client.auth.getSession()

    if (!session?.access_token) {
      if (!publicPages.includes(to.path)) {
        return navigateTo('/login')
      }
      return
    }

    // Decodificar o JWT para obter as informações da role
    let tenantId = null
    try {
      const { useTenantStore } = await import('~/stores/tenant')
      tenantId = useTenantStore().tenantId
    }
    catch {}

    const { resolveRoleFromSession } = await import('~/utils/resolve-user-role')
    const userRole = await resolveRoleFromSession(client, tenantId, session)

    const requiredRoles = Array.isArray(to.meta.requiredRoles) ? to.meta.requiredRoles : [to.meta.requiredRoles]

    // Se não encontrou role, só bloqueia se não for rota pública
    if (!userRole) {
      if (!publicPages.includes(to.path)) {
        return navigateTo('/403')
      }
      return
    }

    // Verificar se o usuário tem a role necessária
    if (!requiredRoles.includes(userRole)) {
      console.warn(`Acesso negado: usuário tem role ${userRole}, mas precisa de ${requiredRoles.join(', ')}`)
      return navigateTo('/403')
    }
  }
  catch (error) {
    console.error('Erro ao verificar permissões:', error)
    if (!publicPages.includes(to.path)) {
      return navigateTo('/')
    }
  }
})
