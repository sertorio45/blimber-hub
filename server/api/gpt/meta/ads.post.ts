import { defineEventHandler, readBody } from 'h3'
import { runMetaGptTool } from '~/server/utils/meta-gpt-api'

/**
 * Cria AdCreative (link/page) + Ad no adset do tenant.
 * Default PAUSED + dryRun=true. Exige confirm + confirmTenantId.
 * Requer page_id + page token na integração. ACTIVE exige confirmActive=true.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({})) as Record<string, unknown>
  return runMetaGptTool(event, 'meta_create_ad', {
    tenantId: body.tenantId,
    adAccountId: body.adAccountId,
    adsetId: body.adsetId,
    name: body.name,
    linkUrl: body.linkUrl,
    message: body.message,
    headline: body.headline,
    description: body.description,
    callToAction: body.callToAction,
    imageUrl: body.imageUrl,
    imageHash: body.imageHash,
    creativeName: body.creativeName,
    status: body.status,
    confirmTenantId: body.confirmTenantId,
    confirm: body.confirm,
    confirmActive: body.confirmActive,
    dryRun: body.dryRun,
  })
})
