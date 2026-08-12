import { defineEventHandler, getRouterParam, readBody } from 'h3'
import {
  optionalBool,
  optionalString,
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'

/** Soft-delete de 1 post editorial. dryRun default true. */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event) || {}) as Record<string, unknown>
  return runMarketingGptTool(event, 'marketing_delete_post', {
    tenantId: optionalString(body.tenantId),
    postId: getRouterParam(event, 'postId'),
    actorUserId: optionalString(body.actorUserId),
    confirmTenantId: optionalString(body.confirmTenantId),
    confirm: body.confirm === true ? true : body.confirm,
    dryRun: optionalBool(body.dryRun),
  })
})
