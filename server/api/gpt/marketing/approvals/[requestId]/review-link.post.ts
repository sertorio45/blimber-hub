import { defineEventHandler, getRouterParam, readBody } from 'h3'
import {
  optionalBool,
  optionalInt,
  optionalString,
  optionalStringArray,
  parseConfirmTrue,
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'

/** Gera link mágico de aprovação (dryRun default true). */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as Record<string, unknown>
  return runMarketingGptTool(event, 'marketing_create_review_link', {
    tenantId: optionalString(body.tenantId),
    requestId: getRouterParam(event, 'requestId'),
    expiresInHours: optionalInt(body.expiresInHours),
    maxUses: body.maxUses === null ? null : optionalInt(body.maxUses),
    allowedActions: optionalStringArray(body.allowedActions),
    afterDecision: optionalString(body.afterDecision),
    actorUserId: optionalString(body.actorUserId),
    confirmTenantId: optionalString(body.confirmTenantId),
    confirm: parseConfirmTrue(body.confirm),
    dryRun: optionalBool(body.dryRun),
  })
})
