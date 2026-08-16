import { defineEventHandler, getRouterParam, readBody } from 'h3'
import {
  optionalBool,
  optionalString,
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'

/** Atualiza post editorial (draft). dryRun default true. */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as Record<string, unknown>
  return runMarketingGptTool(event, 'marketing_update_post', {
    tenantId: optionalString(body.tenantId),
    postId: getRouterParam(event, 'postId'),
    title: optionalString(body.title),
    content: optionalString(body.content),
    artText: body.artText === null ? null : optionalString(body.artText),
    cta: body.cta === null ? null : optionalString(body.cta),
    hashtags: Array.isArray(body.hashtags) ? body.hashtags : undefined,
    campaignId: body.campaignId === null ? null : optionalString(body.campaignId),
    scheduledAt: body.scheduledAt === null ? null : optionalString(body.scheduledAt),
    timezone: optionalString(body.timezone),
    variants: Array.isArray(body.variants) ? body.variants : undefined,
    referenceAssetIds: Array.isArray(body.referenceAssetIds) ? body.referenceAssetIds : undefined,
    sourceUrls: Array.isArray(body.sourceUrls) ? body.sourceUrls : undefined,
    sourceBase64: Array.isArray(body.sourceBase64) ? body.sourceBase64 : undefined,
    editorialStatus: optionalString(body.editorialStatus),
    status: optionalString(body.status),
    comment: body.comment === null ? null : optionalString(body.comment),
    justification: optionalString(body.justification),
    actorUserId: optionalString(body.actorUserId),
    confirmTenantId: optionalString(body.confirmTenantId),
    confirm: body.confirm === true ? true : body.confirm,
    dryRun: optionalBool(body.dryRun),
  })
})
