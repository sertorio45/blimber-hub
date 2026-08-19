import { defineEventHandler } from 'h3'
import {
  optionalBool,
  optionalInt,
  optionalString,
  queryRecord,
  runMetaGptTool,
} from '~/server/utils/meta-gpt-api'

/** Lista conjuntos de anúncios (adsets). */
export default defineEventHandler(async (event) => {
  const q = queryRecord(event)
  return runMetaGptTool(event, 'meta_list_adsets', {
    tenantId: optionalString(q.tenantId),
    adAccountId: optionalString(q.adAccountId),
    campaignId: optionalString(q.campaignId),
    limit: optionalInt(q.limit),
    detailLevel: optionalString(q.detailLevel),
    includeTargeting: optionalBool(q.includeTargeting),
  })
})
