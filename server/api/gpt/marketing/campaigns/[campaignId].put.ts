import { defineEventHandler, getRouterParam, readBody } from 'h3'
import {
  optionalBool,
  optionalString,
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'

/** Atualiza campanha editorial. dryRun default true. */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as Record<string, unknown>
  return runMarketingGptTool(event, 'marketing_update_campaign', {
    tenantId: optionalString(body.tenantId),
    campaignId: getRouterParam(event, 'campaignId'),
    name: optionalString(body.name),
    objective: optionalString(body.objective),
    status: optionalString(body.status),
    startsAt: body.startsAt === null ? null : optionalString(body.startsAt),
    endsAt: body.endsAt === null ? null : optionalString(body.endsAt),
    briefingSummary: optionalString(body.briefingSummary),
    confirmTenantId: optionalString(body.confirmTenantId),
    confirm: body.confirm === true ? true : body.confirm,
    dryRun: optionalBool(body.dryRun),
  })
})
