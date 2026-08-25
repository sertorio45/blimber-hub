import { z } from 'zod'
import { normalizeGoogleAdsTemplateId } from '~/constants/marketing-report-templates'
import {
  pickGoogleAdsConversionActionsForScope,
  pickGoogleAdsSeriesForScope,
  type GoogleAdsCampaignScopeId,
} from '~/lib/marketing/google-ads-report-scope'
import {
  extractGoogleAdsErrorMessage,
  googleAdsApiUrl,
  googleAdsSearchHeaders,
  listGoogleAdsAccounts,
} from '~/server/utils/google-ads'
import { fetchGoogleAdsReportData } from '~/server/utils/marketing-reports'
import type { GoogleAdsOverviewBlock } from '~/types/marketing-reports'
import {
  formatCustomerIdLabel,
  resolveGoogleAdsCredentials,
  resolveGoogleAdsIntegrationRow,
  summarizeGoogleAdsIntegration,
} from './integration'
import type { GoogleAdsToolContext } from './types'
import { GoogleAdsToolError } from './types'

const uuidLike = z.string().uuid()

export const googleAdsTenantSchema = z.object({
  tenantId: uuidLike.describe('UUID do tenant (empresa). Obrigatório — nunca misturar tenants.'),
})

export const adsGoogleStatusSchema = googleAdsTenantSchema

export const adsGoogleListAccountsSchema = googleAdsTenantSchema

export const adsGoogleListCampaignsSchema = googleAdsTenantSchema.extend({
  limit: z.number().int().min(1).max(200).optional().default(50),
  status: z.enum(['ENABLED', 'PAUSED', 'REMOVED']).optional(),
})

export const adsGoogleGetReportSchema = googleAdsTenantSchema.extend({
  datePreset: z
    .enum(['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'last_90d', 'custom'])
    .optional()
    .default('last_30d'),
  dateStart: z.string().optional(),
  dateEnd: z.string().optional(),
  campaignId: z
    .string()
    .optional()
    .describe('Opcional: id da campanha Google Ads. Omitido = visão da conta (template).'),
  templateId: z
    .string()
    .optional()
    .describe('Template de relatório (overview, search, performance_max, …). Default overview.'),
})

export type GoogleAdsToolName =
  | 'ads_google_status'
  | 'ads_google_list_accounts'
  | 'ads_google_list_campaigns'
  | 'ads_google_get_report'

export const GOOGLE_ADS_TOOL_DESCRIPTIONS: Record<GoogleAdsToolName, string> = {
  ads_google_status:
    'Status da integração Google Ads do tenant: OAuth, customer_id, developer token e prontidão para leitura.',
  ads_google_list_accounts:
    'Lista contas Google Ads acessíveis via OAuth do tenant (sem expor tokens).',
  ads_google_list_campaigns:
    'Lista campanhas Google Ads da conta conectada: id, nome, status, canal e orçamento básico.',
  ads_google_get_report:
    'Relatório Google Ads (KPIs, série diária, conversões por ação) reutilizando o pipeline da UI.',
}

export const GOOGLE_ADS_TOOL_SCHEMAS = {
  ads_google_status: adsGoogleStatusSchema,
  ads_google_list_accounts: adsGoogleListAccountsSchema,
  ads_google_list_campaigns: adsGoogleListCampaignsSchema,
  ads_google_get_report: adsGoogleGetReportSchema,
} as const

function extractGoogleAdsSearchResults(response: unknown): any[] {
  if (!response)
    return []
  if (Array.isArray(response))
    return response.flatMap((chunk: any) => chunk?.results || [])
  if (typeof response === 'object' && Array.isArray((response as any).results))
    return (response as any).results
  return []
}

async function runGoogleAdsSearch(
  customerId: string,
  headers: Record<string, string>,
  query: string,
): Promise<{ results: any[], error: string | null }> {
  try {
    const response = await $fetch<any>(
      googleAdsApiUrl(`customers/${customerId}/googleAds:search`),
      { method: 'POST', headers, body: { query } },
    )
    return { results: extractGoogleAdsSearchResults(response), error: null }
  }
  catch (error: unknown) {
    const message = extractGoogleAdsErrorMessage(error as Parameters<typeof extractGoogleAdsErrorMessage>[0])
    return { results: [], error: message }
  }
}

function mapListCampaignRow(row: any) {
  const amountMicros = Number(
    row.campaignBudget?.amountMicros
    || row.campaign_budget?.amount_micros
    || 0,
  )
  return {
    id: String(row.campaign?.id || ''),
    name: row.campaign?.name ? String(row.campaign.name) : null,
    status: row.campaign?.status ? String(row.campaign.status) : null,
    channel_type: String(
      row.campaign?.advertisingChannelType
      || row.campaign?.advertising_channel_type
      || '',
    ).toUpperCase() || null,
    budget: amountMicros > 0
      ? {
          amount_micros: amountMicros,
          amount: amountMicros / 1_000_000,
          type: row.campaignBudget?.type || row.campaign_budget?.type || null,
          period: row.campaignBudget?.period || row.campaign_budget?.period || null,
        }
      : null,
  }
}

function metricsFromCampaignRow(row: GoogleAdsOverviewBlock['campaigns'][number]) {
  return {
    impressions: row.impressions,
    clicks: row.clicks,
    cost: row.cost,
    conversions: row.conversions,
    conversions_value: row.conversions_value,
    ctr: row.ctr,
    cpc: row.cpc,
    cost_per_conversion: row.cost_per_conversion,
    roas: row.cost > 0 && row.conversions_value > 0 ? row.conversions_value / row.cost : null,
  }
}

function applyReportCampaignScope(
  report: GoogleAdsOverviewBlock,
  campaignId?: string | null,
) {
  const scopeId: GoogleAdsCampaignScopeId = campaignId && campaignId !== 'all'
    ? String(campaignId)
    : 'all'

  const allowedCampaignIds = report.campaigns.map(c => c.id).filter(Boolean)
  const series = pickGoogleAdsSeriesForScope({
    series: report.series,
    seriesByCampaign: report.series_by_campaign,
    campaignId: scopeId,
  })
  const conversion_actions = pickGoogleAdsConversionActionsForScope({
    actions: report.conversion_actions,
    campaignId: scopeId,
    allowedCampaignIds,
  })

  if (scopeId === 'all') {
    return {
      ...report,
      scope: { campaign_id: 'all' as const },
      series,
      conversion_actions,
    }
  }

  const row = report.campaigns.find(c => String(c.id) === scopeId)
  if (!row) {
    throw new GoogleAdsToolError(
      'CAMPAIGN_NOT_FOUND',
      `Campanha ${scopeId} não encontrada no período/template selecionado.`,
      404,
    )
  }

  return {
    ...report,
    scope: { campaign_id: scopeId },
    metrics: metricsFromCampaignRow(row),
    previous_metrics: null,
    deltas: null,
    series,
    conversion_actions,
  }
}

export async function adsGoogleStatus(ctx: GoogleAdsToolContext, raw: unknown) {
  const input = adsGoogleStatusSchema.parse(raw)
  const row = await resolveGoogleAdsIntegrationRow(ctx.client, input.tenantId)
  const summary = summarizeGoogleAdsIntegration(row)

  let token_valid = false
  if (row && summary.has_oauth) {
    try {
      const creds = await resolveGoogleAdsCredentials(ctx.client, input.tenantId, {
        requireCustomerId: false,
        requireActive: false,
      })
      token_valid = Boolean(creds.accessToken)
    }
    catch {
      token_valid = false
    }
  }

  return {
    tenantId: input.tenantId,
    provider: 'google_ads' as const,
    connected: summary.has_oauth,
    is_active: summary.is_active,
    integration_id: summary.id || null,
    has_oauth: summary.has_oauth,
    token_valid,
    customer_id: summary.publicConfig.customer_id || null,
    customer_id_formatted: formatCustomerIdLabel(summary.publicConfig.customer_id),
    needs_account: summary.needs_account,
    developer_token_configured: summary.developer_token_configured,
    ready: summary.ready && token_valid,
    token_expires_at: summary.token_expires_at,
    masked_token: summary.masked_token,
    notes: summary.notes,
  }
}

export async function adsGoogleListAccounts(ctx: GoogleAdsToolContext, raw: unknown) {
  const input = adsGoogleListAccountsSchema.parse(raw)
  const creds = await resolveGoogleAdsCredentials(ctx.client, input.tenantId, {
    requireCustomerId: false,
  })

  const { accounts, warning } = await listGoogleAdsAccounts(
    creds.accessToken,
    creds.developerToken!,
  )

  return {
    tenantId: input.tenantId,
    selected_customer_id: creds.customerId,
    accounts,
    warning,
  }
}

export async function adsGoogleListCampaigns(ctx: GoogleAdsToolContext, raw: unknown) {
  const input = adsGoogleListCampaignsSchema.parse(raw)
  const creds = await resolveGoogleAdsCredentials(ctx.client, input.tenantId)
  const headers = googleAdsSearchHeaders(creds.accessToken, creds.developerToken!)

  const statusFilter = input.status
    ? `AND campaign.status = '${input.status}'`
    : `AND campaign.status != 'REMOVED'`

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign_budget.amount_micros,
      campaign_budget.type,
      campaign_budget.period
    FROM campaign
    WHERE campaign.id > 0
      ${statusFilter}
    ORDER BY campaign.name
    LIMIT ${input.limit}
  `

  const { results, error } = await runGoogleAdsSearch(creds.customerId!, headers, query)
  if (error && !results.length) {
    throw new GoogleAdsToolError('GOOGLE_ADS_API_ERROR', error, 502)
  }

  return {
    tenantId: input.tenantId,
    customer_id: creds.customerId,
    campaigns: results.map(mapListCampaignRow).filter(c => c.id),
    api_warning: error || null,
  }
}

export async function adsGoogleGetReport(ctx: GoogleAdsToolContext, raw: unknown) {
  const input = adsGoogleGetReportSchema.parse(raw)
  const creds = await resolveGoogleAdsCredentials(ctx.client, input.tenantId)

  if (input.datePreset === 'custom' && (!input.dateStart || !input.dateEnd)) {
    throw new GoogleAdsToolError(
      'DATE_RANGE_REQUIRED',
      'dateStart e dateEnd são obrigatórios quando datePreset=custom.',
      400,
    )
  }

  const templateId = normalizeGoogleAdsTemplateId(input.templateId)
  const dateOpts = {
    datePreset: input.datePreset,
    dateStart: input.dateStart || '',
    dateEnd: input.dateEnd || '',
  }

  const report = await fetchGoogleAdsReportData(creds.config, dateOpts, templateId)

  if (report.error && !report.connected) {
    throw new GoogleAdsToolError('GOOGLE_ADS_REPORT_ERROR', report.error, 502)
  }

  const scoped = applyReportCampaignScope(report, input.campaignId)

  return {
    tenantId: input.tenantId,
    customer_id: scoped.customer_id,
    period: {
      preset: input.datePreset,
      date_start: input.datePreset === 'custom' ? input.dateStart : null,
      date_end: input.datePreset === 'custom' ? input.dateEnd : null,
    },
    template_id: templateId,
    report: scoped,
  }
}

export const GOOGLE_ADS_TOOL_HANDLERS = {
  ads_google_status: adsGoogleStatus,
  ads_google_list_accounts: adsGoogleListAccounts,
  ads_google_list_campaigns: adsGoogleListCampaigns,
  ads_google_get_report: adsGoogleGetReport,
} as const

export async function invokeGoogleAdsTool(
  name: GoogleAdsToolName,
  ctx: GoogleAdsToolContext,
  args: unknown,
) {
  const handler = GOOGLE_ADS_TOOL_HANDLERS[name]
  if (!handler)
    throw new GoogleAdsToolError('NOT_IMPLEMENTED', `Tool Google Ads não implementada: ${name}`, 501)
  return handler(ctx, args)
}

export function formatGoogleAdsToolError(error: unknown) {
  if (error instanceof GoogleAdsToolError) {
    return {
      ok: false as const,
      error: {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        details: error.details,
      },
    }
  }
  if (error instanceof z.ZodError) {
    return {
      ok: false as const,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Input inválido',
        statusCode: 400,
        details: error.flatten(),
      },
    }
  }
  return {
    ok: false as const,
    error: {
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Erro interno',
      statusCode: 500,
    },
  }
}
