import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { runMetaGptTool } from '~/server/utils/meta-gpt-api'

/**
 * Atualiza tracking_specs / conversion_domain do anúncio (Pixel + Dataset offline).
 * dryRun default true. Exige confirm + confirmTenantId.
 */
export default defineEventHandler(async (event) => {
  const adId = getRouterParam(event, 'adId')
  if (!adId)
    throw createError({ statusCode: 400, statusMessage: 'adId obrigatório' })

  const body = await readBody(event).catch(() => ({})) as Record<string, unknown>
  return runMetaGptTool(event, 'meta_update_ad_tracking', {
    ...body,
    adId,
  })
})
