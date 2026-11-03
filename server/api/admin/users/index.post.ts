import { createError, readBody } from 'h3'

import {
  assertAdminCanAssignRole,
  requireStaffUser,
  resolveActorStaffRole,
} from '~/server/utils/admin-auth'
import { createAdminTenant, seedTenantAllModules } from '~/server/utils/admin-tenant'
import { createBlimberServiceRoleClient } from '~/server/utils/blimber-service-client'
import { syncUserTenantRolesMetadata } from '~/server/utils/tenant-team'
import { serverSupabaseServiceRole } from '#supabase/server'

type AdminUserRole = 'admin' | 'funcionario' | 'cliente' | 'atendente'

interface CreateAdminUserBody {
  email?: string
  password?: string
  name?: string
  role?: AdminUserRole
  tenant_id?: string | null
  create_tenant?: boolean
  tenant_name?: string
}

function getAdminClient() {
  const client = createBlimberServiceRoleClient()
  if (!client)
    throw createError({ statusCode: 500, statusMessage: 'Supabase service role não configurado' })
  return client
}

function roleRequiresTenant(role: AdminUserRole) {
  return role === 'cliente' || role === 'atendente'
}

export default defineEventHandler(async (event) => {
  const actor = await requireStaffUser(event)
  const actorRole = resolveActorStaffRole(actor)

  const supabase = getAdminClient()
  const client = await serverSupabaseServiceRole(event)

  try {
    const body = await readBody<CreateAdminUserBody>(event)
    const email = String(body.email || '').trim()
    const password = String(body.password || '')
    const name = String(body.name || '').trim()
    const role = (body.role || 'cliente') as AdminUserRole

    assertAdminCanAssignRole(actorRole, role)

    if (!email || !password || !name)
      throw createError({ statusCode: 400, statusMessage: 'E-mail, senha e nome são obrigatórios' })

    let tenantId = body.tenant_id?.trim() || null

    if (body.create_tenant) {
      const tenant = await createAdminTenant(client, String(body.tenant_name || ''))
      tenantId = tenant.id
      await seedTenantAllModules(client, tenant.id)
    }

    if (roleRequiresTenant(role) && !tenantId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Selecione uma empresa existente ou crie uma nova para este usuário',
      })
    }

    const { data: newUser, error: createUserError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
        ...(tenantId ? { tenant_id: tenantId } : {}),
      },
      app_metadata: role === 'admin' || role === 'funcionario'
        ? { role }
        : {},
    })

    if (createUserError || !newUser.user)
      throw createError({ statusCode: 400, statusMessage: createUserError?.message || 'Erro ao criar usuário' })

    const userId = newUser.user.id

    if (tenantId && roleRequiresTenant(role)) {
      const { error: roleError } = await client
        .from('user_tenant_role')
        .insert({
          user_id: userId,
          tenant_id: tenantId,
          role,
        })

      if (roleError) {
        await supabase.auth.admin.deleteUser(userId)
        throw createError({ statusCode: 400, statusMessage: roleError.message })
      }

      await syncUserTenantRolesMetadata(userId)
    }

    return {
      success: true,
      message: 'Usuário criado com sucesso',
      user: newUser,
      tenant_id: tenantId,
    }
  }
  catch (error: any) {
    if (error?.statusCode)
      throw error

    return {
      success: false,
      error: error.message || 'Erro ao criar usuário',
    }
  }
})
