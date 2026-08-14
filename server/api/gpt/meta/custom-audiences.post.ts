import { defineEventHandler, readBody } from 'h3'
import { runMetaGptTool } from '~/server/utils/meta-gpt-api'

/**
 * Cria custom audience Meta (engagement IG/Page, website, lead, lista, LAL).
 * dryRun default true. Exige confirm=true e confirmTenantId === tenantId.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({})) as Record<string, unknown>
  return runMetaGptTool(event, 'meta_create_custom_audience', {
    tenantId: body.tenantId,
    adAccountId: body.adAccountId,
    name: body.name,
    description: body.description,
    sourceType: body.sourceType,
    event: body.event,
    retentionDays: body.retentionDays,
    instagramAccountId: body.instagramAccountId,
    pageId: body.pageId,
    pixelId: body.pixelId,
    leadFormId: body.leadFormId,
    urlContains: body.urlContains,
    originAudienceId: body.originAudienceId,
    lookalikeRatio: body.lookalikeRatio,
    lookalikeCountry: body.lookalikeCountry,
    prefill: body.prefill,
    duplicateStrategy: body.duplicateStrategy,
    users: body.users,
    confirmTenantId: body.confirmTenantId,
    confirm: body.confirm,
    dryRun: body.dryRun,
  })
})
