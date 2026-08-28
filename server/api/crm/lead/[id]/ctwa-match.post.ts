import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'

import { createError, defineEventHandler, readBody } from 'h3'

import { applyCtwaAttributionToLead } from '~/server/utils/crm/apply-ctwa-attribution'
import {
  canAccessTenantModule,
  isWrongTenantForScopedUser,
  resolveTenantApiAuth,
} from '~/server/utils/tenant-access'

/**
 * Match recent WhatsApp CTWA attribution by phone and apply to the lead.
 * Called after manual lead+contact create (client inserts via Supabase).
 */
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user)
    throw createError({ statusCode: 401, message: 'Não autorizado' })

  const { role, tenantId } = resolveTenantApiAuth(user, event.context.auth?.tenantId)
  if (!canAccessTenantModule(role))
    throw createError({ statusCode: 403, message: 'Acesso negado' })

  const leadId = event.context.params?.id
  const body = await readBody(event).catch(() => ({} as Record<string, unknown>))
  const effectiveTenantId = String(body?.tenant_id || tenantId || '')
  if (!leadId || !effectiveTenantId)
    throw createError({ statusCode: 400, message: 'leadId e tenant_id são obrigatórios' })

  if (isWrongTenantForScopedUser(role, tenantId, effectiveTenantId))
    throw createError({ statusCode: 403, message: 'Acesso negado' })

  const client = await serverSupabaseServiceRole(event)
  const phone = typeof body?.phone === 'string' ? body.phone : null

  const result = await applyCtwaAttributionToLead(client, {
    tenantId: effectiveTenantId,
    leadId,
    phone,
    enqueueLeadEvent: true,
    enrichGraph: true,
  })

  let lead = null
  if (result.matched) {
    const { data } = await client
      .from('crm_lead')
      .select('*')
      .eq('id', leadId)
      .eq('tenant_id', effectiveTenantId)
      .maybeSingle()
    lead = data
  }

  return { ok: true, ...result, lead }
})
