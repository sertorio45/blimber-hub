import { getRouterParam, readBody } from 'h3'
import { z } from 'zod'

import { ACCEPTED_TENANT_MODULE_INPUT_NAMES } from '~/constants/modules'
import { assertAgencyOrganization, listAccessibleManagedClientIds } from '~/server/utils/agency-ops'
import { recordAuditEvent } from '~/server/utils/audit-events'
import { syncTenantModules } from '~/server/utils/tenant-modules'
import { requireWorkspaceContext } from '~/server/utils/workspace-context'

const paramsSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
})

const schema = z.object({
  displayName: z.string().trim().min(1).max(160).optional(),
  logoUrl: z.string().url().nullable().optional(),
  internalOwnerUserId: z.string().uuid().nullable().optional(),
  modules: z.array(z.enum(ACCEPTED_TENANT_MODULE_INPUT_NAMES)).optional(),
  metadata: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const params = paramsSchema.parse({
    id: getRouterParam(event, 'id'),
    tenantId: getRouterParam(event, 'tenantId'),
  })
  const input = schema.parse(await readBody(event))

  const context = await requireWorkspaceContext(event, {
    organizationId: params.id,
    capability: 'agency.clients.manage',
  })

  assertAgencyOrganization(context)

  const reachable = await listAccessibleManagedClientIds(context, params.id)
  if (!reachable.includes(params.tenantId)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Cliente fora do seu alcance nesta agência',
    })
  }

  const { data: link } = await context.client
    .from('organization_tenants')
    .select('*')
    .eq('organization_id', params.id)
    .eq('tenant_id', params.tenantId)
    .eq('relationship_type', 'managed')
    .maybeSingle()

  if (!link)
    throw createError({ statusCode: 404, statusMessage: 'Cliente não encontrado' })

  const patch: Record<string, unknown> = {}
  if (input.displayName !== undefined)
    patch.display_name = input.displayName
  if (input.logoUrl !== undefined)
    patch.logo_url = input.logoUrl
  if (input.internalOwnerUserId !== undefined)
    patch.internal_owner_user_id = input.internalOwnerUserId
  if (input.metadata !== undefined)
    patch.metadata = { ...(link.metadata || {}), ...input.metadata }
  if (input.isActive !== undefined) {
    patch.is_active = input.isActive
    patch.ended_at = input.isActive ? null : new Date().toISOString()
  }

  const { data, error } = await context.client
    .from('organization_tenants')
    .update(patch)
    .eq('id', link.id)
    .select('*')
    .single()

  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })

  if (input.modules) {
    await syncTenantModules(context.client, params.tenantId, input.modules)
  }

  await recordAuditEvent(event, context.client, {
    tenantId: params.tenantId,
    organizationId: params.id,
    actorId: context.userId,
    action: 'agency.client.update',
    entityType: 'organization_tenant',
    entityId: link.id,
    before: link,
    after: data,
  })

  return { data }
})
