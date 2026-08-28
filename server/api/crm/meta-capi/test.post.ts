import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'

import { createError, defineEventHandler, readBody } from 'h3'

import { sendMetaCapiTestEvent } from '~/server/utils/crm/meta-capi'
import {
  assertScopedTenantAccess,
  assertTenantModuleAccess,
  resolveTenantApiAuth,
} from '~/server/utils/tenant-access'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user)
    throw createError({ statusCode: 401, statusMessage: 'Não autorizado' })

  const body = await readBody(event)
  const { role, tenantId: userTenantId } = resolveTenantApiAuth(user as any, event.context.auth?.tenantId)
  assertTenantModuleAccess(role)

  const tenantId = body?.tenant_id || userTenantId
  if (!tenantId)
    throw createError({ statusCode: 400, statusMessage: 'Tenant ID é obrigatório' })
  assertScopedTenantAccess(role, userTenantId, tenantId)

  const client = await serverSupabaseServiceRole(event)

  try {
    const result = await sendMetaCapiTestEvent(client, tenantId, {
      mode: body?.mode === 'ctwa' ? 'ctwa' : 'default',
      eventName: body?.event_name === 'Purchase' ? 'Purchase' : 'Lead',
    })
    return { data: result }
  }
  catch (error: any) {
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || error.message || 'Falha no evento de teste',
    })
  }
})
