import { defineEventHandler } from 'h3'
import {
  optionalInt,
  optionalString,
  queryRecord,
  runMetaGptTool,
} from '~/server/utils/meta-gpt-api'

/** Lista campanhas Meta Ads da ad account do tenant. */
export default defineEventHandler(async (event) => {
  const q = queryRecord(event)
  return runMetaGptTool(event, 'meta_list_campaigns', {
    tenantId: optionalString(q.tenantId),
    adAccountId: optionalString(q.adAccountId),
    limit: optionalInt(q.limit),
    status: optionalString(q.status),
  })
})
