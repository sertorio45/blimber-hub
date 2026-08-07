import { serverSupabaseServiceRole } from '#supabase/server'

import { createError, defineEventHandler, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  try {
    const client = await serverSupabaseServiceRole(event)
    const body = await readBody(event)
    if (!body.id)
      throw createError({ statusCode: 400, statusMessage: 'ID é obrigatório' })
    let tenantId = body.tenant_id || event.context.auth?.tenantId
    if (!tenantId) {
      const {
        data: { user },
      } = await client.auth.getUser()
      if (user && user.user_metadata?.tenant_id) {
        tenantId = user.user_metadata.tenant_id
      }
    }
    if (!tenantId) {
      throw createError({ statusCode: 400, statusMessage: 'Não foi possível identificar o tenant_id' })
    }

    const updateData = { ...body }
    delete updateData.id
    delete updateData.tenant_id

    // When moving funnel/stage together, ensure the stage belongs to the funnel.
    const nextFunnelId = typeof updateData.funnel_id === 'string' ? updateData.funnel_id : null
    const nextStageId = typeof updateData.sales_stage_id === 'string' ? updateData.sales_stage_id : null

    if (nextFunnelId) {
      const { data: funnel, error: funnelError } = await client
        .from('crm_funnel')
        .select('id, tenant_id, is_default')
        .eq('id', nextFunnelId)
        .maybeSingle()

      if (funnelError) {
        throw createError({ statusCode: 400, statusMessage: funnelError.message })
      }
      if (!funnel) {
        throw createError({ statusCode: 404, statusMessage: 'Funil não encontrado' })
      }
      if (!funnel.is_default && funnel.tenant_id !== tenantId) {
        throw createError({ statusCode: 403, statusMessage: 'Funil não pertence a este tenant' })
      }
    }

    if (nextStageId) {
      const { data: stage, error: stageError } = await client
        .from('crm_sales_stage')
        .select('id, funnel_id, tenant_id, is_default')
        .eq('id', nextStageId)
        .maybeSingle()

      if (stageError) {
        throw createError({ statusCode: 400, statusMessage: stageError.message })
      }
      if (!stage) {
        throw createError({ statusCode: 404, statusMessage: 'Estágio não encontrado' })
      }
      if (!stage.is_default && stage.tenant_id && stage.tenant_id !== tenantId) {
        throw createError({ statusCode: 403, statusMessage: 'Estágio não pertence a este tenant' })
      }
      if (nextFunnelId && stage.funnel_id !== nextFunnelId) {
        throw createError({
          statusCode: 400,
          statusMessage: 'O estágio selecionado não pertence ao funil escolhido',
        })
      }
    }

    const { data, error } = await client
      .from('crm_lead')
      .update(updateData)
      .eq('id', body.id)
      .eq('tenant_id', tenantId)
      .select()
      .single()
    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message || 'Falha ao atualizar lead' })
    }

    // Meta CAPI: semi-manual only (selected won leads). No auto Purchase on status change.
    return { statusCode: 200, body: data }
  }
  catch (error: any) {
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || error.message || 'Erro interno do servidor',
    })
  }
})
