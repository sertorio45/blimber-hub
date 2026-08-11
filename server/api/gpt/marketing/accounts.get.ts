import { defineEventHandler } from 'h3'
import {
  optionalString,
  queryRecord,
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'

/** Lista contas sociais ativas do tenant. */
export default defineEventHandler(async (event) => {
  const q = queryRecord(event)
  return runMarketingGptTool(event, 'marketing_list_social_accounts', {
    tenantId: optionalString(q.tenantId),
  })
})
