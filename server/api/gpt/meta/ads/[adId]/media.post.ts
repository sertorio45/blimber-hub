import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { runMetaGptTool } from '~/server/utils/meta-gpt-api'

/**
 * Atualiza mídia do anúncio (imageUrl|imageHash) via novo AdCreative + swap.
 * dryRun default true. Exige confirm + confirmTenantId. Sem video/upload binário.
 */
export default defineEventHandler(async (event) => {
  const adId = getRouterParam(event, 'adId')
  if (!adId) {
    throw createError({ statusCode: 400, statusMessage: 'adId obrigatório' })
  }

  const body = await readBody(event).catch(() => ({})) as Record<string, unknown>
  return runMetaGptTool(event, 'meta_update_ad_media', {
    tenantId: body.tenantId,
    adAccountId: body.adAccountId,
    adId,
    imageUrl: body.imageUrl,
    imageHash: body.imageHash,
    creativeName: body.creativeName,
    confirmTenantId: body.confirmTenantId,
    confirm: body.confirm,
    dryRun: body.dryRun,
  })
})
