import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { runMetaGptTool } from '~/server/utils/meta-gpt-api'

/**
 * Pausa ou ativa um adset (ACTIVE|PAUSED).
 * Exige confirm=true e confirmTenantId === tenantId.
 */
export default defineEventHandler(async (event) => {
  const adsetId = getRouterParam(event, 'adsetId')
  if (!adsetId) {
    throw createError({ statusCode: 400, statusMessage: 'adsetId obrigatório' })
  }

  const body = await readBody(event).catch(() => ({})) as Record<string, unknown>
  return runMetaGptTool(event, 'meta_update_adset_status', {
    tenantId: body.tenantId,
    adAccountId: body.adAccountId,
    adsetId,
    status: body.status,
    confirmTenantId: body.confirmTenantId,
    confirm: body.confirm,
    dryRun: body.dryRun,
  })
})
