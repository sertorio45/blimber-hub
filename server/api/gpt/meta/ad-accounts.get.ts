import { defineEventHandler } from 'h3'
import {
  optionalString,
  queryRecord,
  runMetaGptTool,
} from '~/server/utils/meta-gpt-api'

/** Lista ad accounts acessíveis pelo OAuth Meta do tenant. */
export default defineEventHandler(async (event) => {
  const q = queryRecord(event)
  return runMetaGptTool(event, 'meta_list_ad_accounts', {
    tenantId: optionalString(q.tenantId),
  })
})
