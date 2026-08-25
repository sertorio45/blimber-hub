import { defineEventHandler } from 'h3'
import {
  optionalInt,
  optionalString,
  queryRecord,
  runGoogleGptTool,
} from '~/server/utils/google-gpt-api'

/** Lista campanhas Google Ads da conta conectada do tenant. */
export default defineEventHandler(async (event) => {
  const q = queryRecord(event)
  return runGoogleGptTool(event, 'ads_google_list_campaigns', {
    tenantId: optionalString(q.tenantId),
    limit: optionalInt(q.limit),
    status: optionalString(q.status),
  })
})
