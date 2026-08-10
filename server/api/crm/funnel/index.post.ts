import { serverSupabaseServiceRole } from '#supabase/server'
import { createError, defineEventHandler, readBody } from 'h3'

const DEFAULT_STAGE_TEMPLATES = [
  { key: 'new', name: 'Novo', color: '#3b82f6', description: 'Estágio inicial', is_default: true },
  { key: 'won', name: 'Ganho', color: '#22c55e', description: 'Negócio fechado', is_default: true },
  { key: 'lost', name: 'Perdido', color: '#ef4444', description: 'Negócio perdido', is_default: true },
] as const

export default defineEventHandler(async (event) => {
  try {
    const client = await serverSupabaseServiceRole(event)
    const body = await readBody(event)
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

    const pipelineToInsert = {
      name: body.name,
      description: body.description,
      is_default: false,
      is_active: body.is_active ?? true,
      priority: body.priority ?? 0,
      tenant_id: tenantId,
    }

    if (!pipelineToInsert.name) {
      throw createError({ statusCode: 400, message: 'Nome é obrigatório' })
    }

    const { data, error } = await client
      .from('crm_funnel')
      .insert([pipelineToInsert])
      .select()
      .single()

    if (error) {
      throw createError({ statusCode: 500, message: error.message || 'Falha ao criar funil' })
    }

    // Prefer explicit stages order from client; otherwise Novo → customs → Ganho → Perdido.
    type IncomingStage = {
      name?: string
      color?: string
      description?: string
      order?: number
      is_default?: boolean
      key?: string
    }

    let allStages: Array<{
      name: string
      order: number
      color: string
      description: string
      tenant_id: string
      funnel_id: string
      is_default: boolean
    }>

    if (Array.isArray(body.stages) && body.stages.length > 0) {
      allStages = (body.stages as IncomingStage[])
        .filter(stage => stage?.name?.trim())
        .map((stage, idx) => ({
          name: stage.name!.trim(),
          order: typeof stage.order === 'number' ? stage.order : idx + 1,
          color: stage.color || '#8b5cf6',
          description: stage.description || '',
          tenant_id: tenantId,
          funnel_id: data.id,
          is_default: Boolean(stage.is_default),
        }))
    }
    else {
      const customStages = Array.isArray(body.customStages)
        ? (body.customStages as IncomingStage[])
            .filter(stage => stage?.name?.trim())
            .map(stage => ({
              name: stage.name!.trim(),
              color: stage.color || '#8b5cf6',
              description: stage.description || '',
              is_default: false as const,
            }))
        : []

      const assembled = [
        DEFAULT_STAGE_TEMPLATES[0],
        ...customStages,
        DEFAULT_STAGE_TEMPLATES[1],
        DEFAULT_STAGE_TEMPLATES[2],
      ]

      allStages = assembled.map((stage, idx) => ({
        name: stage.name,
        order: idx + 1,
        color: stage.color,
        description: stage.description,
        tenant_id: tenantId,
        funnel_id: data.id,
        is_default: 'is_default' in stage ? Boolean(stage.is_default) : false,
      }))
    }

    const { data: stages, error: stageError } = await client
      .from('crm_sales_stage')
      .insert(allStages)
      .select()

    if (stageError) {
      throw createError({ statusCode: 500, message: stageError.message || 'Falha ao criar stages' })
    }

    const sorted = [...(stages || [])].sort((a, b) => (a.order || 0) - (b.order || 0))
    return { statusCode: 201, body: { funnel: data, stages: sorted } }
  }
  catch (error: any) {
    throw createError({ statusCode: error.statusCode || 500, message: error.message || 'Erro interno do servidor' })
  }
})
