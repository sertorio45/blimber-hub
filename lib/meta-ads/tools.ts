import type { SupabaseLike } from './integration'

import type { MetaCampaignStatusUpdate, MetaGraphFetch, MetaInsightLevel } from './types'
import { z } from 'zod'
import {
  actPath,
  buildMetaDateQuery,
  defaultMetaGraphFetch,
  metaGraphUrl,
  normalizeMetaAdAccountId,
} from './graph'
import {
  listMarketingIntegrations,
  resolveMetaAccessToken,
  resolveMetaCredentials,

} from './integration'
import { MetaAdsToolError } from './types'

export type { SupabaseLike } from './integration'

const uuidLike = z.string().min(1)

export const tenantContextSchema = z.object({
  tenantId: uuidLike.describe('UUID do tenant (empresa). Obrigatório — nunca misturar tenants.'),
  adAccountId: z.string().optional().describe('Conta de anúncios Meta sem prefixo act_. Usa a da integração se omitido.'),
})

export const metaListIntegrationsSchema = tenantContextSchema.pick({ tenantId: true })

export const metaListAdAccountsSchema = tenantContextSchema.pick({ tenantId: true })

export const metaListCampaignsSchema = tenantContextSchema.extend({
  limit: z.number().int().min(1).max(200).optional().default(50),
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED']).optional(),
})

export const metaGetCampaignSchema = tenantContextSchema.extend({
  campaignId: z.string().min(1),
})

export const metaListAdsetsSchema = tenantContextSchema.extend({
  campaignId: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional().default(50),
})

export const metaListAdsSchema = tenantContextSchema.extend({
  campaignId: z.string().optional(),
  adsetId: z.string().optional(),
  activeOnly: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(200).optional().default(50),
})

export const metaGetInsightsSchema = tenantContextSchema.extend({
  level: z.enum(['account', 'campaign', 'adset', 'ad']).optional().default('campaign'),
  datePreset: z
    .enum(['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'last_90d', 'custom'])
    .optional()
    .default('last_7d'),
  dateStart: z.string().optional(),
  dateEnd: z.string().optional(),
  metrics: z.array(z.string()).optional(),
  objectId: z.string().optional().describe('Opcional: id da campanha/adset/ad para insights do nó.'),
  limit: z.number().int().min(1).max(200).optional().default(50),
})

export const metaUpdateCampaignStatusSchema = tenantContextSchema.extend({
  campaignId: z.string().min(1),
  status: z.enum(['ACTIVE', 'PAUSED']),
  /** Must equal tenantId — explicit confirmation guard against cross-tenant mistakes. */
  confirmTenantId: z.string().min(1),
  /** Must be true — forces intentional write. */
  confirm: z.literal(true),
})

export type MetaToolName =
  | 'meta_list_integrations'
  | 'meta_list_ad_accounts'
  | 'meta_list_campaigns'
  | 'meta_get_campaign'
  | 'meta_list_adsets'
  | 'meta_list_ads'
  | 'meta_get_insights'
  | 'meta_update_campaign_status'

export interface MetaToolContext {
  client: SupabaseLike
  graphFetch?: MetaGraphFetch
}

const DEFAULT_INSIGHT_FIELDS
  = 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,impressions,clicks,spend,reach,ctr,cpc,cpm,actions,purchase_roas'

function filteringForStatus(status?: string) {
  if (!status)
    return undefined
  return JSON.stringify([{ field: 'effective_status', operator: 'IN', value: [status] }])
}

async function withCreds(
  ctx: MetaToolContext,
  tenantId: string,
  adAccountId: string | undefined,
) {
  return resolveMetaCredentials(ctx.client, tenantId, adAccountId)
}

function fetchGraph(ctx: MetaToolContext): MetaGraphFetch {
  return ctx.graphFetch || defaultMetaGraphFetch
}

export async function metaListIntegrations(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaListIntegrationsSchema.parse(raw)
  const integrations = await listMarketingIntegrations(ctx.client, input.tenantId)
  return {
    tenantId: input.tenantId,
    integrations,
  }
}

export async function metaListAdAccounts(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaListAdAccountsSchema.parse(raw)
  const tokenCtx = await resolveMetaAccessToken(ctx.client, input.tenantId)
  const graph = fetchGraph(ctx)
  const res = await graph(metaGraphUrl(tokenCtx.apiVersion, '/me/adaccounts'), {
    query: {
      fields: 'id,name,account_status,currency,timezone_name',
      limit: 100,
      access_token: tokenCtx.accessToken,
    },
  })

  return {
    tenantId: input.tenantId,
    configuredAdAccountId: tokenCtx.publicConfig.ad_account_id || null,
    adAccounts: (res?.data || []).map((row: any) => ({
      id: normalizeMetaAdAccountId(String(row.id || '')),
      name: row.name || row.id,
      account_status: row.account_status,
      currency: row.currency ?? null,
      timezone_name: row.timezone_name ?? null,
    })),
  }
}

export async function metaListCampaigns(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaListCampaignsSchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)
  const query: Record<string, string | number | undefined> = {
    fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,created_time,updated_time',
    limit: input.limit,
    access_token: creds.accessToken,
  }
  const filtering = filteringForStatus(input.status)
  if (filtering)
    query.filtering = filtering

  const res = await graph(metaGraphUrl(creds.apiVersion, `/${actPath(creds.adAccountId)}/campaigns`), {
    query,
  })

  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    campaigns: res?.data || [],
    paging: res?.paging || null,
  }
}

export async function metaGetCampaign(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaGetCampaignSchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)
  const campaign = await graph(metaGraphUrl(creds.apiVersion, `/${input.campaignId}`), {
    query: {
      fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,created_time,updated_time,account_id',
      access_token: creds.accessToken,
    },
  })

  const accountFromCampaign = campaign?.account_id
    ? normalizeMetaAdAccountId(String(campaign.account_id))
    : null
  if (accountFromCampaign && accountFromCampaign !== creds.adAccountId) {
    throw new MetaAdsToolError(
      'CAMPAIGN_TENANT_MISMATCH',
      'Campanha não pertence à ad account do tenant.',
      403,
    )
  }

  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    campaign,
  }
}

export async function metaListAdsets(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaListAdsetsSchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)
  const path = input.campaignId
    ? `/${input.campaignId}/adsets`
    : `/${actPath(creds.adAccountId)}/adsets`

  const res = await graph(metaGraphUrl(creds.apiVersion, path), {
    query: {
      fields: 'id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,optimization_goal,billing_event',
      limit: input.limit,
      access_token: creds.accessToken,
    },
  })

  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    campaignId: input.campaignId || null,
    adsets: res?.data || [],
    paging: res?.paging || null,
  }
}

export async function metaListAds(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaListAdsSchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)

  let path = `/${actPath(creds.adAccountId)}/ads`
  if (input.adsetId)
    path = `/${input.adsetId}/ads`
  else if (input.campaignId)
    path = `/${input.campaignId}/ads`

  const query: Record<string, string | number | undefined> = {
    fields: 'id,name,effective_status,status,campaign_id,adset_id,creative{id,name,thumbnail_url}',
    limit: input.limit,
    access_token: creds.accessToken,
  }
  if (input.activeOnly)
    query.filtering = filteringForStatus('ACTIVE')

  const res = await graph(metaGraphUrl(creds.apiVersion, path), { query })

  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    campaignId: input.campaignId || null,
    adsetId: input.adsetId || null,
    ads: res?.data || [],
    paging: res?.paging || null,
  }
}

export async function metaGetInsights(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaGetInsightsSchema.parse(raw)
  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)
  const dateQ = buildMetaDateQuery(input.datePreset, input.dateStart, input.dateEnd)
  const fields = (input.metrics?.length ? input.metrics.join(',') : DEFAULT_INSIGHT_FIELDS)
  const level = input.level as MetaInsightLevel

  const path = input.objectId
    ? `/${input.objectId}/insights`
    : `/${actPath(creds.adAccountId)}/insights`

  const query: Record<string, string | number | undefined> = {
    fields,
    access_token: creds.accessToken,
    limit: input.limit,
    ...dateQ,
  }
  if (!input.objectId && level !== 'account')
    query.level = level

  const res = await graph(metaGraphUrl(creds.apiVersion, path), { query })

  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    level,
    datePreset: input.datePreset,
    dateStart: input.dateStart || null,
    dateEnd: input.dateEnd || null,
    objectId: input.objectId || null,
    insights: res?.data || [],
    paging: res?.paging || null,
  }
}

export async function metaUpdateCampaignStatus(
  ctx: MetaToolContext,
  raw: unknown,
) {
  const input = metaUpdateCampaignStatusSchema.parse(raw)

  if (input.confirmTenantId !== input.tenantId) {
    throw new MetaAdsToolError(
      'CONFIRM_TENANT_MISMATCH',
      'confirmTenantId deve ser idêntico a tenantId.',
      400,
    )
  }

  const creds = await withCreds(ctx, input.tenantId, input.adAccountId)
  const graph = fetchGraph(ctx)

  // Ownership check before mutation
  await metaGetCampaign(ctx, {
    tenantId: input.tenantId,
    adAccountId: input.adAccountId,
    campaignId: input.campaignId,
  })

  const status = input.status as MetaCampaignStatusUpdate
  const updated = await graph(metaGraphUrl(creds.apiVersion, `/${input.campaignId}`), {
    method: 'POST',
    query: {
      access_token: creds.accessToken,
    },
    body: { status },
  })

  return {
    tenantId: input.tenantId,
    adAccountId: creds.adAccountId,
    campaignId: input.campaignId,
    status,
    success: Boolean(updated?.success ?? true),
    warning: 'Mutação aplicada na Meta Graph API. Verifique o Ads Manager se necessário.',
  }
}

type ToolHandler = (ctx: MetaToolContext, raw: unknown) => Promise<unknown>

export const META_TOOL_HANDLERS: Record<MetaToolName, ToolHandler> = {
  meta_list_integrations: metaListIntegrations,
  meta_list_ad_accounts: metaListAdAccounts,
  meta_list_campaigns: metaListCampaigns,
  meta_get_campaign: metaGetCampaign,
  meta_list_adsets: metaListAdsets,
  meta_list_ads: metaListAds,
  meta_get_insights: metaGetInsights,
  meta_update_campaign_status: metaUpdateCampaignStatus,
}

export const META_TOOL_SCHEMAS: Record<MetaToolName, z.ZodTypeAny> = {
  meta_list_integrations: metaListIntegrationsSchema,
  meta_list_ad_accounts: metaListAdAccountsSchema,
  meta_list_campaigns: metaListCampaignsSchema,
  meta_get_campaign: metaGetCampaignSchema,
  meta_list_adsets: metaListAdsetsSchema,
  meta_list_ads: metaListAdsSchema,
  meta_get_insights: metaGetInsightsSchema,
  meta_update_campaign_status: metaUpdateCampaignStatusSchema,
}

export const META_TOOL_DESCRIPTIONS: Record<MetaToolName, string> = {
  meta_list_integrations:
    'Lista marketing_integrations do tenant (status, ad_account, sem tokens).',
  meta_list_ad_accounts:
    'Lista ad accounts acessíveis pelo token Meta OAuth do tenant.',
  meta_list_campaigns:
    'Lista campanhas Meta Ads da ad account do tenant (leitura).',
  meta_get_campaign:
    'Obtém detalhe de uma campanha Meta. Valida ownership da ad account.',
  meta_list_adsets:
    'Lista conjuntos de anúncios (adsets) da conta ou de uma campanha.',
  meta_list_ads:
    'Lista anúncios Meta (conta, campanha ou adset).',
  meta_get_insights:
    'Consulta insights/métricas Meta (nível account|campaign|adset|ad + período).',
  meta_update_campaign_status:
    'PAUSA ou ATIVA uma campanha (ACTIVE|PAUSED). Exige confirm=true e confirmTenantId=tenantId. Sem delete em massa.',
}

export async function invokeMetaTool(
  name: MetaToolName,
  ctx: MetaToolContext,
  args: unknown,
) {
  const handler = META_TOOL_HANDLERS[name]
  if (!handler)
    throw new MetaAdsToolError('UNKNOWN_TOOL', `Tool desconhecida: ${name}`, 404)
  return handler(ctx, args)
}

export function formatToolError(error: unknown) {
  if (error instanceof MetaAdsToolError) {
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
      message: error instanceof Error ? error.message : 'Erro desconhecido',
      statusCode: 500,
    },
  }
}
