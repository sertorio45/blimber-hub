import { defineEventHandler } from 'h3'
import {
  optionalString,
  queryRecord,
  runGoogleGptTool,
} from '~/server/utils/google-gpt-api'

/** Relatório Google Ads (KPIs, série diária, conversões por ação). */
export default defineEventHandler(async (event) => {
  const q = queryRecord(event)
  return runGoogleGptTool(event, 'ads_google_get_report', {
    tenantId: optionalString(q.tenantId),
    datePreset: optionalString(q.datePreset),
    dateStart: optionalString(q.dateStart),
    dateEnd: optionalString(q.dateEnd),
    campaignId: optionalString(q.campaignId),
    templateId: optionalString(q.templateId),
  })
})
