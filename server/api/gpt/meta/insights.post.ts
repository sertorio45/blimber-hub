import { defineEventHandler, readBody } from 'h3'
import { runMetaGptTool } from '~/server/utils/meta-gpt-api'

/** Insights/métricas Meta (nível + período). Preferir POST por body rico. */
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({})) as Record<string, unknown>
  return runMetaGptTool(event, 'meta_get_insights', {
    tenantId: body.tenantId,
    adAccountId: body.adAccountId,
    level: body.level,
    datePreset: body.datePreset,
    dateStart: body.dateStart,
    dateEnd: body.dateEnd,
    metrics: body.metrics,
    objectId: body.objectId,
    limit: body.limit,
  })
})
