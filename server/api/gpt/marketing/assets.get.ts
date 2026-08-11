import { defineEventHandler } from 'h3'
import {
  optionalInt,
  optionalString,
  queryRecord,
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'

/** Lista assets da Biblioteca de mídia (sem upload binário). */
export default defineEventHandler(async (event) => {
  const q = queryRecord(event)
  return runMarketingGptTool(event, 'marketing_list_assets', {
    tenantId: optionalString(q.tenantId),
    limit: optionalInt(q.limit),
    search: optionalString(q.search),
    purpose: optionalString(q.purpose),
    mime: optionalString(q.mime),
    campaignId: optionalString(q.campaignId),
  })
})
