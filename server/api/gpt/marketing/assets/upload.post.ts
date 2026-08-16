import { defineEventHandler } from 'h3'
import {
  optionalBool,
  optionalString,
  parseConfirmTrue,
  readGptMutationBody,
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'

/** Upload para a Biblioteca (sourceUrl HTTPS preferencial). dryRun default true. */
export default defineEventHandler(async (event) => {
  const body = await readGptMutationBody(event)
  return runMarketingGptTool(event, 'marketing_upload_asset', {
    tenantId: optionalString(body.tenantId),
    sourceUrl: optionalString(body.sourceUrl),
    sourceBase64: optionalString(body.sourceBase64),
    name: optionalString(body.name),
    mimeType: optionalString(body.mimeType),
    purpose: optionalString(body.purpose),
    category: body.category === null ? null : optionalString(body.category),
    formatHint: optionalString(body.formatHint),
    campaignId: body.campaignId === null ? null : optionalString(body.campaignId),
    actorUserId: optionalString(body.actorUserId),
    confirmTenantId: optionalString(body.confirmTenantId),
    confirm: parseConfirmTrue(body.confirm),
    dryRun: optionalBool(body.dryRun),
  })
})
