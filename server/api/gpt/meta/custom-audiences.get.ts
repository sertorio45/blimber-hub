import { defineEventHandler } from 'h3'
import {
  optionalInt,
  optionalString,
  queryRecord,
  runMetaGptTool,
} from '~/server/utils/meta-gpt-api'

/** Lista custom audiences da ad account do tenant. */
export default defineEventHandler(async (event) => {
  const q = queryRecord(event)
  return runMetaGptTool(event, 'meta_list_custom_audiences', {
    tenantId: optionalString(q.tenantId),
    adAccountId: optionalString(q.adAccountId),
    limit: optionalInt(q.limit),
  })
})
