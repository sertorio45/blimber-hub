import { defineEventHandler, readBody } from 'h3'
import { runMetaGptTool } from '~/server/utils/meta-gpt-api'

/**
 * Preview de exclusão em massa (IDs explícitos + level).
 * Retorna tabela + previewToken. Sem POST/DELETE na Graph.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({})) as Record<string, unknown>
  return runMetaGptTool(event, 'meta_preview_bulk_delete', {
    tenantId: body.tenantId,
    adAccountId: body.adAccountId,
    level: body.level,
    ids: body.ids,
    deleteMode: body.deleteMode,
  })
})
