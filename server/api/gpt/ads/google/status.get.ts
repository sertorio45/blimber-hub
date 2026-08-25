import { defineEventHandler } from 'h3'
import {
  optionalString,
  queryRecord,
  runGoogleGptTool,
} from '~/server/utils/google-gpt-api'

/** Status da integração Google Ads do tenant (OAuth, customer_id, prontidão). */
export default defineEventHandler(async (event) => {
  const q = queryRecord(event)
  return runGoogleGptTool(event, 'ads_google_status', {
    tenantId: optionalString(q.tenantId),
  })
})
