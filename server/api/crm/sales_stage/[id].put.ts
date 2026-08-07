import { serverSupabaseServiceRole } from '#supabase/server'

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  try {
    const client = await serverSupabaseServiceRole(event)
    const body = await readBody(event)
    const id = getRouterParam(event, 'id') || body?.id
    if (!id)
      throw createError({ statusCode: 400, message: 'ID é obrigatório' })
    let tenantId = body?.tenant_id || event.context.auth?.tenantId
    if (!tenantId) {
      const {
        data: { user },
      } = await client.auth.getUser()
      if (user && user.user_metadata?.tenant_id) {
        tenantId = user.user_metadata.tenant_id
      }
    }
    if (!tenantId) {
      throw createError({ statusCode: 400, message: 'Não foi possível identificar o tenant_id' })
    }

    const { data: existing, error: fetchError } = await client
      .from('crm_sales_stage')
      .select('id, tenant_id, funnel_id, is_default')
      .eq('id', id)
      .maybeSingle()

    if (fetchError) {
      throw createError({ statusCode: 500, message: fetchError.message || 'Falha ao buscar sales stage' })
    }
    if (!existing) {
      throw createError({ statusCode: 404, message: 'Estágio não encontrado' })
    }

    // Default/shared stages may have null tenant_id — authorize via parent funnel instead.
    if (existing.tenant_id && existing.tenant_id !== tenantId) {
      throw createError({ statusCode: 403, message: 'Acesso negado ao estágio' })
    }
    if (!existing.tenant_id) {
      if (!existing.funnel_id) {
        throw createError({ statusCode: 403, message: 'Acesso negado ao estágio' })
      }
      const { data: funnel, error: funnelError } = await client
        .from('crm_funnel')
        .select('id, tenant_id, is_default')
        .eq('id', existing.funnel_id)
        .maybeSingle()
      if (funnelError) {
        throw createError({ statusCode: 500, message: funnelError.message || 'Falha ao validar funil' })
      }
      if (!funnel || (!funnel.is_default && funnel.tenant_id !== tenantId)) {
        throw createError({ statusCode: 403, message: 'Acesso negado ao estágio' })
      }
    }

    const updateData: Record<string, unknown> = {}
    const orderVal = body?.order !== undefined ? Number(body.order) : undefined
    if (orderVal !== undefined && !Number.isNaN(orderVal))
      updateData.order = orderVal
    if (body?.name !== undefined)
      updateData.name = body.name
    if (body?.color !== undefined)
      updateData.color = body.color
    if (body?.description !== undefined)
      updateData.description = body.description
    // Backfill tenant when updating a shared/default stage from a concrete tenant context
    if (!existing.tenant_id)
      updateData.tenant_id = tenantId

    if (Object.keys(updateData).length === 0) {
      throw createError({ statusCode: 400, message: 'Nenhum campo válido para atualizar' })
    }

    const { data, error } = await client
      .from('crm_sales_stage')
      .update(updateData)
      .eq('id', id)
      .select()
      .maybeSingle()

    if (error) {
      throw createError({ statusCode: 500, message: error.message || 'Falha ao atualizar sales stage' })
    }
    if (!data) {
      throw createError({ statusCode: 404, message: 'Estágio não encontrado ou sem permissão para este tenant' })
    }
    return { statusCode: 200, body: data }
  }
  catch (error: any) {
    const status = error.statusCode || error.status || 500
    const message = error.message || error.data?.message || 'Erro interno do servidor'
    throw createError({ statusCode: status, message })
  }
})
