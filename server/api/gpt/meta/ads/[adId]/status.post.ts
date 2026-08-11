import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { runMetaGptTool } from '~/server/utils/meta-gpt-api'

/**
 * Pausa ou ativa um anúncio (ACTIVE|PAUSED).
 * Exige confirm=true e confirmTenantId === tenantId.
 */
export default defineEventHandler(async (event) => {
  const adId = getRouterParam(event, 'adId')
  if (!adId) {
    throw createError({ statusCode: 400, statusMessage: 'adId obrigatório' })
  }

  const body = await readBody(event).catch(() => ({})) as Record<string, unknown>
  return runMetaGptTool(event, 'meta_update_ad_status', {
    tenantId: body.tenantId,
    adAccountId: body.adAccountId,
    adId,
    status: body.status,
    confirmTenantId: body.confirmTenantId,
    confirm: body.confirm,
    dryRun: body.dryRun,
  })
})
