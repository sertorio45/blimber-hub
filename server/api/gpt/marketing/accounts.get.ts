import { defineEventHandler } from 'h3'
import {
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'
import {
  optionalString,
  queryRecord,
} from '~/server/utils/meta-gpt-api'

/** Lista contas sociais ativas do tenant. */
export default defineEventHandler(async (event) => {
  const q = queryRecord(event)
  return runMarketingGptTool(event, 'marketing_list_social_accounts', {
    tenantId: optionalString(q.tenantId),
  })
})
