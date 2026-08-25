import { createError, defineEventHandler, readBody } from 'h3'
import { z } from 'zod'

import { normalizeReportLayout } from '~/lib/marketing/report-layout'
import { requireSocialContext } from '~/server/utils/social-context'

const blockSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    'kpi_primary',
    'kpi_detail',
    'trend_chart',
    'campaigns_table',
    'conversions_table',
    'networks_table',
    'insights',
  ]),
  enabled: z.boolean().optional(),
  metricKeys: z.array(z.string().min(1)).optional(),
  title: z.string().optional(),
})

const bodySchema = z.object({
  provider: z.enum(['meta', 'google_ads']),
  template_base_id: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  layout: z.object({
    version: z.literal(1).optional(),
    templateBaseId: z.string().optional(),
    blocks: z.array(blockSchema).min(1),
  }).optional(),
  /** When true, deletes the saved layout (restore default). */
  restore_default: z.boolean().optional(),
})

/**
 * PUT /api/marketing/report-layouts
 * Upsert custom layout for tenant + provider + template, or restore default.
 */
export default defineEventHandler(async (event) => {
  const { client, tenantId } = await requireSocialContext(event, 'marketing.social.reports')
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Dados inválidos para o layout do relatório',
    })
  }

  const { provider, template_base_id, restore_default } = parsed.data

  if (restore_default) {
    const { error } = await client
      .from('marketing_report_layouts')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('provider', provider)
      .eq('template_base_id', template_base_id)

    if (error)
      throw createError({ statusCode: 400, statusMessage: error.message })

    return {
      data: null,
      restored: true,
    }
  }

  if (!parsed.data.layout) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Layout obrigatório para salvar',
    })
  }

  const layout = normalizeReportLayout(provider, template_base_id, {
    ...parsed.data.layout,
    version: 1,
    templateBaseId: parsed.data.layout.templateBaseId || template_base_id,
  })

  const now = new Date().toISOString()
  const payload = {
    tenant_id: tenantId,
    provider,
    template_base_id,
    layout,
    name: parsed.data.name?.trim() || 'Personalizado',
    updated_at: now,
  }

  const { data, error } = await client
    .from('marketing_report_layouts')
    .upsert(payload, { onConflict: 'tenant_id,provider,template_base_id' })
    .select('id, tenant_id, provider, template_base_id, layout, name, created_at, updated_at')
    .single()

  if (error)
    throw createError({ statusCode: 400, statusMessage: error.message })

  return {
    data: {
      ...data,
      layout: normalizeReportLayout(provider, template_base_id, data.layout),
    },
    restored: false,
  }
})
