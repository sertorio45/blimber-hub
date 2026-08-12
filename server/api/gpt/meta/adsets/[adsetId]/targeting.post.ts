import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { runMetaGptTool } from '~/server/utils/meta-gpt-api'

/**
 * Atualiza targeting do adset via template BR_* OU targeting customizado (XOR).
 * dryRun default true. Exige confirm + confirmTenantId.
 */
export default defineEventHandler(async (event) => {
  const adsetId = getRouterParam(event, 'adsetId')
  if (!adsetId) {
    throw createError({ statusCode: 400, statusMessage: 'adsetId obrigatório' })
  }

  const body = await readBody(event).catch(() => ({})) as Record<string, unknown>
  return runMetaGptTool(event, 'meta_update_adset_targeting', {
    tenantId: body.tenantId,
    adAccountId: body.adAccountId,
    adsetId,
    targetingTemplate: body.targetingTemplate,
    targeting: body.targeting,
    confirmTenantId: body.confirmTenantId,
    confirm: body.confirm,
    dryRun: body.dryRun,
  })
})
