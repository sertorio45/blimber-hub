import { defineEventHandler } from 'h3'
import {
  optionalInt,
  optionalString,
  queryRecord,
  runMetaGptTool,
} from '~/server/utils/meta-gpt-api'

/** Lista Saved Audiences (Ads Manager) da ad account do tenant. */
export default defineEventHandler(async (event) => {
  const q = queryRecord(event)
  return runMetaGptTool(event, 'meta_list_saved_audiences', {
    tenantId: optionalString(q.tenantId),
    adAccountId: optionalString(q.adAccountId),
    limit: optionalInt(q.limit),
    name: optionalString(q.name),
    nameContains: optionalString(q.nameContains),
  })
})
