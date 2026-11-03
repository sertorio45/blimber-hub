import { serverSupabaseServiceRole } from '#supabase/server'
import { createError, getQuery, getRouterParam } from 'h3'

import { mapFlowExecutionRow, mapFlowRow } from '~/composables/whatsapp/useWhatsAppMapper'
import { getCanvasFromViewport } from '~/server/utils/whatsapp/flow-canvas'
import { resolveWhatsAppTenantContext } from '~/server/utils/whatsapp/context'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'id is required' })

  const query = getQuery(event)
  const { tenantId } = await resolveWhatsAppTenantContext(event, query.tenant_id as string | undefined)
  const client = serverSupabaseServiceRole(event)

  const [flowResult, executionsResult] = await Promise.all([
    client
      .from('whatsapp_flow')
      .select('id, tenant_id, name, description, status, trigger_type, trigger_config, viewport, version, created_at, updated_at')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    client
      .from('whatsapp_flow_execution')
      .select('id, flow_id, conversation_id, contact_id, status, current_node_id, context, started_at, completed_at, created_at')
      .eq('flow_id', id)
      .order('started_at', { ascending: false })
      .limit(10),
  ])

  const flow = flowResult.data
  if (flowResult.error || !flow)
    throw createError({ statusCode: 404, statusMessage: 'Flow not found' })

  const canvas = getCanvasFromViewport(flow.viewport as Record<string, unknown>)

  return {
    data: mapFlowRow(flow as any),
    canvas,
    recentExecutions: (executionsResult.data || []).map(mapFlowExecutionRow),
  }
})
