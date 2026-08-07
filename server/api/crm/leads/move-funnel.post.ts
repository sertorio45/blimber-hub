import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { createError, defineEventHandler, readBody } from 'h3'

import {
  canAccessTenantModule,
  isWrongTenantForScopedUser,
  resolveTenantApiAuth,
} from '~/server/utils/tenant-access'
import { resolveLeadStatusOnStageMove } from '~/utils/crm/sales-stage'

interface MoveFunnelBody {
  tenant_id?: string
  lead_ids?: string[]
  funnel_id?: string
  sales_stage_id?: string
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Não autorizado' })
  }

  const body = await readBody<MoveFunnelBody>(event)
  const { role, tenantId } = resolveTenantApiAuth(user, event.context.auth?.tenantId)
  const effectiveTenantId = body.tenant_id || tenantId

  if (!effectiveTenantId) {
    throw createError({ statusCode: 400, statusMessage: 'Tenant ID é obrigatório' })
  }

  if (!canAccessTenantModule(role)) {
    throw createError({ statusCode: 403, statusMessage: 'Acesso negado' })
  }

  if (isWrongTenantForScopedUser(role, tenantId, effectiveTenantId)) {
    throw createError({ statusCode: 403, statusMessage: 'Acesso negado' })
  }

  const leadIds = Array.isArray(body.lead_ids)
    ? [...new Set(body.lead_ids.filter((id): id is string => typeof id === 'string' && id.length > 0))]
    : []
  const funnelId = typeof body.funnel_id === 'string' ? body.funnel_id : ''
  const salesStageId = typeof body.sales_stage_id === 'string' ? body.sales_stage_id : ''

  if (!leadIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'Selecione ao menos um lead' })
  }
  if (!funnelId) {
    throw createError({ statusCode: 400, statusMessage: 'Funil de destino é obrigatório' })
  }
  if (!salesStageId) {
    throw createError({ statusCode: 400, statusMessage: 'Estágio de destino é obrigatório' })
  }

  const client = await serverSupabaseServiceRole(event)

  const { data: funnel, error: funnelError } = await client
    .from('crm_funnel')
    .select('id, tenant_id, is_default')
    .eq('id', funnelId)
    .maybeSingle()

  if (funnelError) {
    throw createError({ statusCode: 400, statusMessage: funnelError.message })
  }
  if (!funnel) {
    throw createError({ statusCode: 404, statusMessage: 'Funil de destino não encontrado' })
  }
  if (!funnel.is_default && funnel.tenant_id !== effectiveTenantId) {
    throw createError({ statusCode: 403, statusMessage: 'Funil não pertence a este tenant' })
  }

  const { data: stage, error: stageError } = await client
    .from('crm_sales_stage')
    .select('id, name, funnel_id, tenant_id, is_default')
    .eq('id', salesStageId)
    .maybeSingle()

  if (stageError) {
    throw createError({ statusCode: 400, statusMessage: stageError.message })
  }
  if (!stage) {
    throw createError({ statusCode: 404, statusMessage: 'Estágio de destino não encontrado' })
  }
  if (stage.funnel_id !== funnelId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'O estágio selecionado não pertence ao funil de destino',
    })
  }
  if (!stage.is_default && stage.tenant_id && stage.tenant_id !== effectiveTenantId) {
    throw createError({ statusCode: 403, statusMessage: 'Estágio não pertence a este tenant' })
  }

  const { data: existingLeads, error: leadsError } = await client
    .from('crm_lead')
    .select('id, status')
    .eq('tenant_id', effectiveTenantId)
    .in('id', leadIds)

  if (leadsError) {
    throw createError({ statusCode: 400, statusMessage: leadsError.message })
  }

  const foundIds = new Set((existingLeads || []).map(lead => lead.id))
  const missing = leadIds.filter(id => !foundIds.has(id))
  if (missing.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Um ou mais leads não foram encontrados neste tenant',
    })
  }

  // Preserve Meta CAPI / won-lost semantics: derive status from destination stage.
  const updatesByStatus = new Map<string, { ids: string[], closed_at: string | null }>()

  for (const lead of existingLeads || []) {
    const resolved = resolveLeadStatusOnStageMove(
      stage.name,
      lead.status as 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost' | null,
    )
    const key = `${resolved.status}__${resolved.closed_at ?? 'null'}`
    const bucket = updatesByStatus.get(key) || { ids: [], closed_at: resolved.closed_at }
    bucket.ids.push(lead.id)
    updatesByStatus.set(key, bucket)
  }

  let moved = 0
  for (const [key, bucket] of updatesByStatus.entries()) {
    const status = key.split('__')[0] as
      | 'new'
      | 'contacted'
      | 'qualified'
      | 'proposal'
      | 'negotiation'
      | 'won'
      | 'lost'

    const { data, error } = await client
      .from('crm_lead')
      .update({
        funnel_id: funnelId,
        sales_stage_id: salesStageId,
        status,
        closed_at: bucket.closed_at,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', effectiveTenantId)
      .in('id', bucket.ids)
      .select('id')

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message || 'Falha ao mover leads',
      })
    }

    moved += data?.length || 0
  }

  // Meta CAPI remains semi-manual — do not auto-fire Purchase on bulk moves.
  return {
    moved,
    funnel_id: funnelId,
    sales_stage_id: salesStageId,
  }
})
