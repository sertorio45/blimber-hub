import { useSupabaseClient, useSupabaseUser } from '#imports'

import { useTenant } from '~/composables/useTenant'
import { decodeJwtPayload, resolveRoleFromSession } from '~/utils/resolve-user-role'

export function useAuth() {
  const client = useSupabaseClient()
  const user = useSupabaseUser()
  const router = useRouter()
  const loading = ref(false)
  const error = ref<string | null>(null)
  const userRole = ref<string | null>(null)
  // Resolve in setup so login() never calls useTenant after await (lifecycle warn).
  const { bootstrapTenantContext } = useTenant()

  // Função para decodificar JWT
  function decodeJWT(token: string) {
    return decodeJwtPayload(token)
  }

  // Função para atualizar o papel do usuário
  const updateUserRole = async () => {
    if (!user.value) {
      userRole.value = null
      return
    }

    try {
      const {
        data: { session },
      } = await client.auth.getSession()

      if (session?.access_token) {
        let tenantId = null
        try {
          const { useTenantStore } = await import('~/stores/tenant')
          tenantId = useTenantStore().tenantId
        }
        catch {}

        const role = await resolveRoleFromSession(client, tenantId)
        if (role) {
          userRole.value = role
        }
      }
    }
    catch (error) {
      console.error('Erro ao buscar papel do usuário:', error)
      userRole.value = null
    }
  }

  // Inicializar o papel do usuário
  onMounted(() => {
    updateUserRole()
  })

  // Monitorar mudanças no usuário
  watch(user, (newUser) => {
    if (newUser) {
      updateUserRole()
    }
    else {
      userRole.value = null
    }
  })

  // Configurar realtime para monitorar mudanças na tabela users
  onMounted(() => {
    const channel = client
      .channel('users_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'users',
        },
        (payload: any) => {
          // Se a mudança for no usuário atual, atualize o papel
          if (payload.new?.id === user.value?.id) {
            updateUserRole()
          }
        },
      )
      .subscribe()

    // Limpar subscription quando o componente for desmontado
    onUnmounted(() => {
      channel.unsubscribe()
    })
  })

  // Verificar se o usuário tem um papel específico
  const hasRole = (role: string) => {
    return userRole.value === role
  }

  // Verificar se o usuário tem um dos papéis especificados
  const hasAnyRole = (roles: string[]) => {
    return roles.includes(userRole.value || '')
  }

  // Função para login
  const login = async (email: string, password: string) => {
    loading.value = true
    error.value = null

    try {
      const { data, error: authError } = await client.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        const message = authError.message === 'Invalid login credentials'
          ? 'E-mail ou senha inválidos'
          : authError.message
        error.value = message
        return { success: false, error: message }
      }

      // Após login bem-sucedido, verifique o role do usuário
      await updateUserRole()

      // Workspace bootstrap is best-effort: a context API failure must not
      // undo an already-successful Supabase session.
      try {
        await bootstrapTenantContext()
      }
      catch (bootstrapError) {
        console.error('Falha ao carregar contexto do workspace após login:', bootstrapError)
      }

      return { success: true, data }
    }
    catch (err: any) {
      error.value = err.message
      return { success: false, error: err.message }
    }
    finally {
      loading.value = false
    }
  }

  // Função para logout
  const logout = async () => {
    loading.value = true
    error.value = null
    userRole.value = null

    try {
      const { error: logoutError } = await client.auth.signOut()

      if (logoutError) {
        error.value = logoutError.message
        return { success: false, error: logoutError.message }
      }

      router.push('/login')
      return { success: true }
    }
    catch (err: any) {
      error.value = err.message
      return { success: false, error: err.message }
    }
    finally {
      loading.value = false
    }
  }

  // Função para verificar se o usuário está autenticado
  const isAuthenticated = computed(() => !!user.value)

  // Função para obter o usuário atual
  const currentUser = computed(() => user.value)

  // Função para obter o role atual
  const currentRole = computed(() => userRole.value)

  // Solicita e-mail de recuperação de senha
  const resetPassword = async (email: string) => {
    loading.value = true
    error.value = null

    try {
      // /confirm normalizes every callback shape (hash, token_hash, PKCE code)
      // before handing the user over to /reset-password.
      const redirectTo = import.meta.client
        ? `${window.location.origin}/confirm?flow=recovery`
        : undefined

      const { error: resetError } = await client.auth.resetPasswordForEmail(email, {
        redirectTo,
      })

      if (resetError) {
        error.value = resetError.message
        return { success: false, error: resetError.message }
      }

      return { success: true }
    }
    catch (err: any) {
      error.value = err.message
      return { success: false, error: err.message }
    }
    finally {
      loading.value = false
    }
  }

  // Define nova senha após o link de recuperação ou convite.
  const updatePassword = async (
    password: string,
    options?: { signOutAfter?: boolean },
  ) => {
    loading.value = true
    error.value = null

    try {
      const { error: updateError } = await client.auth.updateUser({ password })

      if (updateError) {
        error.value = updateError.message
        return { success: false, error: updateError.message }
      }

      // Recovery flow signs out so the user logs in with the new password.
      // Invite flow keeps the session and enters the app.
      if (options?.signOutAfter !== false)
        await client.auth.signOut()

      return { success: true }
    }
    catch (err: any) {
      error.value = err.message
      return { success: false, error: err.message }
    }
    finally {
      loading.value = false
    }
  }

  // Função para verificar a sessão atual
  const checkSession = async () => {
    const { data } = await client.auth.getSession()
    if (data.session?.access_token) {
      await updateUserRole()
    }
    return !!data.session
  }

  return {
    login,
    logout,
    resetPassword,
    updatePassword,
    isAuthenticated,
    currentUser,
    currentRole,
    checkSession,
    loading,
    error,
    hasRole,
    hasAnyRole,
    updateUserRole,
  }
}
