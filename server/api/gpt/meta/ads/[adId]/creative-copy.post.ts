import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { runMetaGptTool } from '~/server/utils/meta-gpt-api'

/**
 * Atualiza copy do anúncio via novo AdCreative + swap.
 * dryRun default true. Exige confirm + confirmTenantId + Page.
 */
export default defineEventHandler(async (event) => {
  const adId = getRouterParam(event, 'adId')
  if (!adId) {
    throw createError({ statusCode: 400, statusMessage: 'adId obrigatório' })
  }

  const body = await readBody(event).catch(() => ({})) as Record<string, unknown>
  return runMetaGptTool(event, 'meta_update_ad_creative_copy', {
    tenantId: body.tenantId,
    adAccountId: body.adAccountId,
    adId,
    message: body.message,
    headline: body.headline,
    description: body.description,
    callToAction: body.callToAction,
    linkUrl: body.linkUrl,
    creativeName: body.creativeName,
    confirmTenantId: body.confirmTenantId,
    confirm: body.confirm,
    dryRun: body.dryRun,
  })
})
