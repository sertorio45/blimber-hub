import { defineEventHandler, readBody } from 'h3'
import {
  optionalBool,
  optionalString,
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'

/** Cria post editorial (draft). dryRun default true. */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as Record<string, unknown>
  return runMarketingGptTool(event, 'marketing_create_post', {
    tenantId: optionalString(body.tenantId),
    title: optionalString(body.title),
    content: optionalString(body.content) ?? '',
    artText: body.artText === null ? null : optionalString(body.artText),
    cta: body.cta === null ? null : optionalString(body.cta),
    hashtags: Array.isArray(body.hashtags) ? body.hashtags : undefined,
    campaignId: body.campaignId === null ? null : optionalString(body.campaignId),
    scheduledAt: body.scheduledAt === null ? null : optionalString(body.scheduledAt),
    timezone: optionalString(body.timezone),
    assetIds: Array.isArray(body.assetIds) ? body.assetIds : undefined,
    referenceAssetIds: Array.isArray(body.referenceAssetIds) ? body.referenceAssetIds : undefined,
    accountId: optionalString(body.accountId),
    platform: optionalString(body.platform),
    format: optionalString(body.format),
    caption: optionalString(body.caption),
    actorUserId: optionalString(body.actorUserId),
    confirmTenantId: optionalString(body.confirmTenantId),
    confirm: body.confirm === true ? true : body.confirm,
    dryRun: optionalBool(body.dryRun),
  })
})
