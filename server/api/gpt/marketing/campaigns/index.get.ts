import { defineEventHandler } from 'h3'
import {
  optionalInt,
  optionalString,
  queryRecord,
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'

/** Lista campanhas EDITORIAIS (social_campaigns) — não Meta Ads. */
export default defineEventHandler(async (event) => {
  const q = queryRecord(event)
  return runMarketingGptTool(event, 'marketing_list_campaigns', {
    tenantId: optionalString(q.tenantId),
    status: optionalString(q.status),
    search: optionalString(q.search),
    limit: optionalInt(q.limit),
  })
})
