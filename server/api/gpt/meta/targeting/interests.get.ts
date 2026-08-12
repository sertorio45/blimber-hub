import { defineEventHandler } from 'h3'
import {
  optionalInt,
  optionalString,
  queryRecord,
  runMetaGptTool,
} from '~/server/utils/meta-gpt-api'

/** Busca interesses Meta (Graph type=adinterest) para targeting custom. */
export default defineEventHandler(async (event) => {
  const q = queryRecord(event)
  return runMetaGptTool(event, 'meta_search_interests', {
    tenantId: optionalString(q.tenantId),
    q: optionalString(q.q),
    limit: optionalInt(q.limit),
    locale: optionalString(q.locale),
  })
})
