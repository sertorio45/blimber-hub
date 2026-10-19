import { getRouterParam, readBody } from 'h3'
import { z } from 'zod'

import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'

import { ACCEPTED_TENANT_MODULE_INPUT_NAMES } from '~/constants/modules'
import { isStaffRole } from '~/constants/roles'
import { recordAuditEvent } from '~/server/utils/audit-events'
import { getTenantModulesState, syncTenantModules } from '~/server/utils/tenant-modules'

const schema = z.object({
  modules: z.array(z.enum(ACCEPTED_TENANT_MODULE_INPUT_NAMES)).min(1),
})

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user)
    throw createError({ statusCode: 401, statusMessage: 'Não autenticado' })

  const globalRole = (user.app_metadata as { role?: string })?.role
    || (user.user_metadata as { role?: string })?.role

  if (!isStaffRole(globalRole))
    throw createError({ statusCode: 403, statusMessage: 'Acesso negado' })

  const tenantId = String(getRouterParam(event, 'id'))
  const input = schema.parse(await readBody(event))
  const client = await serverSupabaseServiceRole(event)

  const { data: tenant, error: tenantError } = await client
    .from('tenant')
    .select('id, name, slug')
    .eq('id', tenantId)
    .maybeSingle()

  if (tenantError)
    throw createError({ statusCode: 400, statusMessage: tenantError.message })
  if (!tenant)
    throw createError({ statusCode: 404, statusMessage: 'Empresa não encontrada' })

  const before = await getTenantModulesState(client, tenantId)
  const after = await syncTenantModules(client, tenantId, input.modules)

  await recordAuditEvent(event, client, {
    tenantId,
    actorId: user.id,
    action: 'tenant.modules.update',
    entityType: 'tenant',
    entityId: tenantId,
    before,
    after,
  })

  return {
    tenant,
    ...after,
  }
})
