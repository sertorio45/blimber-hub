import { defineEventHandler } from 'h3'
import {
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'
import {
  optionalInt,
  optionalString,
  queryRecord,
} from '~/server/utils/meta-gpt-api'

/** Lista posts editoriais (social_posts). */
export default defineEventHandler(async (event) => {
  const q = queryRecord(event)
  return runMarketingGptTool(event, 'marketing_list_posts', {
    tenantId: optionalString(q.tenantId),
    page: optionalInt(q.page),
    pageSize: optionalInt(q.pageSize),
    status: optionalString(q.status),
    campaignId: optionalString(q.campaignId),
    search: optionalString(q.search),
  })
})
