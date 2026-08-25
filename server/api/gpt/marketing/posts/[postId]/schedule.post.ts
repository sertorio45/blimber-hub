import { defineEventHandler, getRouterParam, readBody } from 'h3'
import {
  parseConfirmTrue,
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'
import {
  optionalBool,
  optionalString,
} from '~/server/utils/meta-gpt-api'

/** Agenda o post (enqueueApprovedPost). dryRun default true. */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as Record<string, unknown>
  return runMarketingGptTool(event, 'marketing_schedule_post', {
    tenantId: optionalString(body.tenantId),
    postId: getRouterParam(event, 'postId'),
    scheduledAt: optionalString(body.scheduledAt),
    timezone: optionalString(body.timezone),
    actorUserId: optionalString(body.actorUserId),
    confirmTenantId: optionalString(body.confirmTenantId),
    confirm: parseConfirmTrue(body.confirm),
    dryRun: optionalBool(body.dryRun),
  })
})
