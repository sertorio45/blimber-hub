import { defineEventHandler, readBody } from 'h3'
import { runMetaGptTool } from '~/server/utils/meta-gpt-api'

/**
 * Executa exclusão em massa após preview.
 * Exige previewToken + confirm + confirmTenantId + confirmDelete; dryRun default true.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({})) as Record<string, unknown>
  return runMetaGptTool(event, 'meta_execute_bulk_delete', {
    tenantId: body.tenantId,
    adAccountId: body.adAccountId,
    level: body.level,
    ids: body.ids,
    previewToken: body.previewToken,
    deleteMode: body.deleteMode,
    confirmDelete: body.confirmDelete,
    confirmTenantId: body.confirmTenantId,
    confirm: body.confirm,
    dryRun: body.dryRun,
  })
})
