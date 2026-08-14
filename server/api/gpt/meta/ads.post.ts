import { defineEventHandler, readBody } from 'h3'
import { runMetaGptTool } from '~/server/utils/meta-gpt-api'

/**
 * Cria AdCreative (link/page) + Ad no adset do tenant.
 * Default PAUSED + dryRun=true. Exige confirm + confirmTenantId.
 * Requer page_id + page token na integração. ACTIVE exige confirmActive=true.
 * trackingSpecs / pixelId / offlineDatasetId / conversionDomain são opcionais.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({})) as Record<string, unknown>
  return runMetaGptTool(event, 'meta_create_ad', body)
})
