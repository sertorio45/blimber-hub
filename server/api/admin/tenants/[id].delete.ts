import { getRouterParam } from 'h3'

import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'

import { isStaffRole } from '~/constants/roles'
import { deleteAdminTenant } from '~/server/utils/admin-tenant'
import { recordAuditEvent } from '~/server/utils/audit-events'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user)
    throw createError({ statusCode: 401, statusMessage: 'Não autenticado' })

  const globalRole = (user.app_metadata as { role?: string })?.role
    || (user.user_metadata as { role?: string })?.role

  if (!isStaffRole(globalRole))
    throw createError({ statusCode: 403, statusMessage: 'Acesso negado' })

  const tenantId = String(getRouterParam(event, 'id'))
  const client = await serverSupabaseServiceRole(event)

  const deleted = await deleteAdminTenant(client, tenantId)

  await recordAuditEvent(event, client, {
    // Tenant is gone: audit_events.tenant_id references tenant(id), so a
    // deleted tenant id would violate the FK and silently drop the event.
    tenantId: null,
    actorId: user.id,
    action: 'tenant.deleted',
    entityType: 'tenant',
    entityId: deleted.id,
    before: deleted,
  })

  return { success: true, data: deleted }
})
