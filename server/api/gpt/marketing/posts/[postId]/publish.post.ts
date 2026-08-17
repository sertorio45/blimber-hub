import { defineEventHandler, getRouterParam, readBody } from 'h3'
import {
  optionalBool,
  optionalString,
  parseConfirmTrue,
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'

/** Publica agora (enqueueApprovedPost publishNow). dryRun default true. */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as Record<string, unknown>
  return runMarketingGptTool(event, 'marketing_publish_post', {
    tenantId: optionalString(body.tenantId),
    postId: getRouterParam(event, 'postId'),
    actorUserId: optionalString(body.actorUserId),
    confirmTenantId: optionalString(body.confirmTenantId),
    confirm: parseConfirmTrue(body.confirm),
    dryRun: optionalBool(body.dryRun),
  })
})
