import { defineEventHandler } from 'h3'
import {
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'
import {
  optionalInt,
  optionalString,
  queryRecord,
} from '~/server/utils/meta-gpt-api'

/** Lista solicitações de aprovação do tenant. */
export default defineEventHandler(async (event) => {
  const q = queryRecord(event)
  return runMarketingGptTool(event, 'marketing_list_approvals', {
    tenantId: optionalString(q.tenantId),
    status: optionalString(q.status),
    stage: optionalString(q.stage),
    limit: optionalInt(q.limit),
  })
})
