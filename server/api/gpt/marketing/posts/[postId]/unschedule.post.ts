import { defineEventHandler, getRouterParam, readBody } from 'h3'
import {
  parseConfirmTrue,
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'
import {
  optionalBool,
  optionalString,
} from '~/server/utils/meta-gpt-api'

/** Cancela agendamento (jobs + publication_status=not_scheduled). dryRun default true. */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as Record<string, unknown>
  return runMarketingGptTool(event, 'marketing_unschedule_post', {
    tenantId: optionalString(body.tenantId),
    postId: getRouterParam(event, 'postId'),
    clearScheduledAt: body.clearScheduledAt === true,
    actorUserId: optionalString(body.actorUserId),
    confirmTenantId: optionalString(body.confirmTenantId),
    confirm: parseConfirmTrue(body.confirm),
    dryRun: optionalBool(body.dryRun),
  })
})
