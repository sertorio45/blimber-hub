import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { runMetaGptTool } from '~/server/utils/meta-gpt-api'

/**
 * Pausa ou ativa uma campanha (ACTIVE|PAUSED).
 * Exige confirm=true e confirmTenantId === tenantId.
 */
export default defineEventHandler(async (event) => {
  const campaignId = getRouterParam(event, 'campaignId')
  if (!campaignId) {
    throw createError({ statusCode: 400, statusMessage: 'campaignId obrigatório' })
  }

  const body = await readBody(event).catch(() => ({})) as Record<string, unknown>
  return runMetaGptTool(event, 'meta_update_campaign_status', {
    tenantId: body.tenantId,
    adAccountId: body.adAccountId,
    campaignId,
    status: body.status,
    confirmTenantId: body.confirmTenantId,
    confirm: body.confirm,
  })
})
