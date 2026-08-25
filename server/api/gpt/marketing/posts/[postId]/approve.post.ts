import { defineEventHandler, getRouterParam, readBody } from 'h3'
import {
  parseConfirmTrue,
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'
import {
  optionalBool,
  optionalString,
} from '~/server/utils/meta-gpt-api'

/** Aprova / decide editorial de um post (dryRun default true). */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as Record<string, unknown>
  return runMarketingGptTool(event, 'marketing_approve_post', {
    tenantId: optionalString(body.tenantId),
    postId: getRouterParam(event, 'postId'),
    decision: optionalString(body.decision),
    comment: body.comment === null ? null : optionalString(body.comment),
    justification: optionalString(body.justification),
    requestId: optionalString(body.requestId),
    actorUserId: optionalString(body.actorUserId),
    confirmTenantId: optionalString(body.confirmTenantId),
    confirm: parseConfirmTrue(body.confirm),
    dryRun: optionalBool(body.dryRun),
  })
})
