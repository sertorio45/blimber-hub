import { defineEventHandler } from 'h3'
import {
  runMarketingGptTool,
} from '~/server/utils/blimber-gpt-api'
import {
  optionalString,
  queryRecord,
} from '~/server/utils/meta-gpt-api'

/** Calendário editorial (marketing_post_schedules) no intervalo start/end. */
export default defineEventHandler(async (event) => {
  const q = queryRecord(event)
  return runMarketingGptTool(event, 'marketing_list_calendar', {
    tenantId: optionalString(q.tenantId),
    start: optionalString(q.start),
    end: optionalString(q.end),
    campaignId: optionalString(q.campaignId),
    platform: optionalString(q.platform),
  })
})
