import { defineEventHandler, getRouterParam } from 'h3'
import {
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'
import {
  optionalString,
  queryRecord,
} from '~/server/utils/meta-gpt-api'

/** Detalhe de campanha editorial + posts vinculados. */
export default defineEventHandler(async (event) => {
  const q = queryRecord(event)
  return runMarketingGptTool(event, 'marketing_get_campaign', {
    tenantId: optionalString(q.tenantId),
    campaignId: getRouterParam(event, 'campaignId'),
  })
})
