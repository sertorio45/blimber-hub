import { defineEventHandler, getRouterParam, readBody } from 'h3'
import {
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'
import {
  optionalBool,
  optionalString,
} from '~/server/utils/meta-gpt-api'

/**
 * Hard-delete de campanha editorial. dryRun default true.
 * Prefer POST …/delete from ChatGPT (DELETE body is often stripped).
 */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => ({}))) as Record<string, unknown>
  return runMarketingGptTool(event, 'marketing_delete_campaign', {
    tenantId: optionalString(body.tenantId),
    campaignId: getRouterParam(event, 'campaignId'),
    actorUserId: optionalString(body.actorUserId),
    confirmTenantId: optionalString(body.confirmTenantId),
    confirm: body.confirm === true ? true : body.confirm,
    dryRun: optionalBool(body.dryRun),
  })
})
