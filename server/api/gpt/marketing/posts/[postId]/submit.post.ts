import { defineEventHandler, getRouterParam, readBody } from 'h3'
import {
  optionalStringArray,
  parseConfirmTrue,
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'
import {
  optionalBool,
  optionalString,
} from '~/server/utils/meta-gpt-api'

/** Envia post para aprovação do cliente (dryRun default true). */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as Record<string, unknown>
  return runMarketingGptTool(event, 'marketing_submit_post', {
    tenantId: optionalString(body.tenantId),
    postId: getRouterParam(event, 'postId'),
    approverIds: optionalStringArray(body.approverIds) ?? [],
    dueAt: body.dueAt === null ? null : optionalString(body.dueAt),
    workflowId: body.workflowId === null ? null : optionalString(body.workflowId),
    stage: optionalString(body.stage),
    actorUserId: optionalString(body.actorUserId),
    confirmTenantId: optionalString(body.confirmTenantId),
    confirm: parseConfirmTrue(body.confirm),
    dryRun: optionalBool(body.dryRun),
  })
})
