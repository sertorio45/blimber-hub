import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'

interface StagePayload {
  id?: string
  name?: string
  color?: string
  description?: string
  order?: number
  is_default?: boolean
}

export default defineEventHandler(async (event) => {
  try {
    const user = await serverSupabaseUser(event)
    if (!user) {
      throw createError({ statusCode: 401, message: 'Não autorizado' })
    }
    const client = await serverSupabaseServiceRole(event)
    const id = getRouterParam(event, 'id')
    if (!id) {
      throw createError({ statusCode: 400, message: 'ID do funil é obrigatório' })
    }
    const body = await readBody(event)
    // Buscar tenantId do contexto ou body
    let tenantId = body.tenant_id || event.context.auth?.tenantId
    if (!tenantId) {
      const { data: { user } } = await client.auth.getUser()
      if (user && user.user_metadata?.tenant_id) {
        tenantId = user.user_metadata.tenant_id
      }
    }
    if (!tenantId) {
      throw createError({ statusCode: 400, message: 'Não foi possível identificar o tenant_id' })
    }
    // Verificar se o registro existe e pertence ao tenant
    const { data: existing, error: existError } = await client
      .from('crm_funnel')
      .select('id, tenant_id, is_default')
      .eq('id', id)
      .single()
    if (existError || !existing) {
      throw createError({ statusCode: 404, message: 'Funil não encontrado' })
    }
    if (!existing.is_default && existing.tenant_id !== tenantId) {
      throw createError({ statusCode: 403, message: 'Acesso negado ao funil' })
    }
    // Atualizar apenas campos permitidos
    const updateData = {
      name: body.name,
      description: body.description,
      is_active: body.is_active,
      priority: body.priority,
    }
    const { data: funnel, error } = await client
      .from('crm_funnel')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()
    if (error) {
      throw createError({ statusCode: 500, message: error.message || 'Falha ao atualizar funil' })
    }

    // Prefer full stages list (preserves user order including Novo/Ganho/Perdido);
    // fall back to legacy customStages-only payload.
    const stagesPayload: StagePayload[] = Array.isArray(body.stages)
      ? body.stages
      : Array.isArray(body.customStages)
        ? body.customStages
        : []

    const { data: currentStages, error: fetchStagesError } = await client
      .from('crm_sales_stage')
      .select('id, is_default, tenant_id')
      .eq('funnel_id', id)
    if (fetchStagesError) {
      throw createError({ statusCode: 500, message: fetchStagesError.message || 'Erro ao buscar stages atuais' })
    }

    const currentById = new Map((currentStages || []).map(stage => [stage.id as string, stage]))
    const sentIds = stagesPayload.filter(stage => stage.id).map(stage => String(stage.id))

    // Only delete non-default custom stages omitted from the payload
    const toDelete = (currentStages || [])
      .filter(stage => !stage.is_default && !sentIds.includes(stage.id as string))
      .map(stage => stage.id as string)

    if (toDelete.length > 0) {
      const { error: delError } = await client
        .from('crm_sales_stage')
        .delete()
        .in('id', toDelete)
      if (delError) {
        throw createError({ statusCode: 500, message: delError.message || 'Erro ao remover stages antigos' })
      }
    }

    for (const [idx, stage] of stagesPayload.entries()) {
      if (!stage.name || !stage.name.trim())
        continue

      const order = typeof stage.order === 'number' && !Number.isNaN(stage.order)
        ? stage.order
        : idx + 1

      if (stage.id && currentById.has(stage.id)) {
        const existingStage = currentById.get(stage.id)!
        const updateObj: Record<string, unknown> = {
          order,
          description: stage.description || '',
        }
        // Keep default stage names stable; allow rename only on custom stages
        if (!existingStage.is_default)
          updateObj.name = stage.name.trim()
        if (stage.color)
          updateObj.color = stage.color
        if (!existingStage.tenant_id)
          updateObj.tenant_id = tenantId

        const { error: updError } = await client
          .from('crm_sales_stage')
          .update(updateObj)
          .eq('id', stage.id)
        if (updError) {
          throw createError({ statusCode: 500, message: updError.message || 'Erro ao atualizar stage' })
        }
      }
      else if (!stage.id) {
        const insertObj = {
          name: stage.name.trim(),
          order,
          description: stage.description || '',
          color: stage.color || '#cccccc',
          tenant_id: tenantId,
          funnel_id: id,
          is_default: false,
        }
        const { error: insError } = await client
          .from('crm_sales_stage')
          .insert(insertObj)
        if (insError) {
          throw createError({ statusCode: 500, message: insError.message || 'Erro ao criar novo stage' })
        }
      }
    }

    const { data: stages, error: stagesError } = await client
      .from('crm_sales_stage')
      .select('*')
      .eq('funnel_id', id)
      .order('order', { ascending: true })
    if (stagesError) {
      throw createError({ statusCode: 500, message: stagesError.message || 'Erro ao buscar stages atualizados' })
    }
    return { statusCode: 200, body: { funnel, stages } }
  }
  catch (error: any) {
    throw createError({ statusCode: error.statusCode || 500, message: error.message || 'Erro interno do servidor' })
  }
})
