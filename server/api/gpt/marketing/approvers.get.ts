import { defineEventHandler } from 'h3'
import {
  optionalString,
  queryRecord,
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'

/** Lista aprovadores elegíveis do tenant. */
export default defineEventHandler(async (event) => {
  const q = queryRecord(event)
  return runMarketingGptTool(event, 'marketing_list_approvers', {
    tenantId: optionalString(q.tenantId),
  })
})
