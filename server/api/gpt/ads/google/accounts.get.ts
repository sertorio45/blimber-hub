import { defineEventHandler } from 'h3'
import {
  optionalString,
  queryRecord,
  runGoogleGptTool,
} from '~/server/utils/google-gpt-api'

/** Contas Google Ads acessíveis via OAuth do tenant. */
export default defineEventHandler(async (event) => {
  const q = queryRecord(event)
  return runGoogleGptTool(event, 'ads_google_list_accounts', {
    tenantId: optionalString(q.tenantId),
  })
})
