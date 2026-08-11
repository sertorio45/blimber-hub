import { defineEventHandler } from 'h3'
import {
  optionalString,
  queryRecord,
  runMetaGptTool,
} from '~/server/utils/meta-gpt-api'

/** Lista marketing_integrations do tenant (sem tokens). */
export default defineEventHandler(async (event) => {
  const q = queryRecord(event)
  return runMetaGptTool(event, 'meta_list_integrations', {
    tenantId: optionalString(q.tenantId),
  })
})
