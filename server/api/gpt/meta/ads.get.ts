import { defineEventHandler } from 'h3'
import {
  optionalBool,
  optionalInt,
  optionalString,
  queryRecord,
  runMetaGptTool,
} from '~/server/utils/meta-gpt-api'

/** Lista anúncios Meta (conta, campanha ou adset). */
export default defineEventHandler(async (event) => {
  const q = queryRecord(event)
  return runMetaGptTool(event, 'meta_list_ads', {
    tenantId: optionalString(q.tenantId),
    adAccountId: optionalString(q.adAccountId),
    campaignId: optionalString(q.campaignId),
    adsetId: optionalString(q.adsetId),
    activeOnly: optionalBool(q.activeOnly),
    limit: optionalInt(q.limit),
  })
})
