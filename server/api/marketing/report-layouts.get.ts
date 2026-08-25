import { createError, defineEventHandler, getQuery } from 'h3'
import { z } from 'zod'

import { requireSocialContext } from '~/server/utils/social-context'
import { normalizeReportLayout } from '~/lib/marketing/report-layout'
import { isMarketingReportLayoutProvider } from '~/types/marketing-report-layout'

const querySchema = z.object({
  provider: z.enum(['meta', 'google_ads']).optional(),
  template_base_id: z.string().min(1).optional(),
})

/**
 * GET /api/marketing/report-layouts
 * Lists saved layouts for the active tenant (optionally filtered).
 */
export default defineEventHandler(async (event) => {
  const { client, tenantId } = await requireSocialContext(event, 'marketing.social.reports')
  const parsed = querySchema.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Parâmetros inválidos',
    })
  }

  let query = client
    .from('marketing_report_layouts')
    .select('id, tenant_id, provider, template_base_id, layout, name, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false })

  if (parsed.data.provider)
    query = query.eq('provider', parsed.data.provider)
  if (parsed.data.template_base_id)
    query = query.eq('template_base_id', parsed.data.template_base_id)

  const { data, error } = await query
  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })

  const rows = (data || []).map((row: any) => {
    const provider = isMarketingReportLayoutProvider(row.provider) ? row.provider : 'meta'
    const templateBaseId = String(row.template_base_id || 'overview')
    return {
      ...row,
      layout: normalizeReportLayout(provider, templateBaseId, row.layout),
    }
  })

  return { data: rows }
})
