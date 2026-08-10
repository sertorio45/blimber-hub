import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { defineEventHandler, getQuery } from 'h3'

import {
  canAccessTenantModule,
  isWrongTenantForScopedUser,
  resolveTenantApiAuth,
} from '~/server/utils/tenant-access'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)

  if (!user)
    return { status: 401, message: 'Não autorizado' }

  const { role, tenantId } = resolveTenantApiAuth(user, event.context.auth?.tenantId)
  const client = await serverSupabaseServiceRole(event)
  const { funnel_id, active_only, tenant_id: queryTenantId } = getQuery(event)
  const effectiveTenantId = (queryTenantId as string) || tenantId

  if (!effectiveTenantId)
    return { status: 400, message: 'Tenant ID é obrigatório' }

  if (!canAccessTenantModule(role))
    return { status: 403, message: 'Acesso negado' }

  if (isWrongTenantForScopedUser(role, tenantId, effectiveTenantId))
    return { status: 403, message: 'Acesso negado' }

  let activeFunnelIds: string[] = []
  if (active_only === 'true') {
    const { data: activeFunnels } = await client
      .from('crm_funnel')
      .select('id')
      .eq('is_active', true)
      .or(`is_default.eq.true,tenant_id.eq.${effectiveTenantId}`)

    activeFunnelIds = activeFunnels?.map(p => p.id) || []
  }

  let query = client.from('crm_sales_stage').select('*')
    .or(`is_default.eq.true,tenant_id.eq.${effectiveTenantId}`)

  if (funnel_id)
    query = query.eq('funnel_id', String(funnel_id))

  if (active_only === 'true' && activeFunnelIds.length > 0)
    query = query.in('funnel_id', activeFunnelIds)

  // Kanban / organize UI must respect user-defined order (not is_default pinning).
  const { data, error } = await query.order('order', { ascending: true })

  if (error)
    return { status: 400, message: error.message }

  return data
})
