/**
 * ads.google namespace: thin MCP surface over lib/google-ads.
 */

import {
  formatGoogleAdsToolError,
  GOOGLE_ADS_TOOL_DESCRIPTIONS,
  invokeGoogleAdsTool,
  type GoogleAdsToolContext,
  type GoogleAdsToolName,
} from '../../google-ads'
import type { BlimberMcpToolDescriptor } from '../types'

export const ADS_GOOGLE_TOOL_NAMES = Object.keys(GOOGLE_ADS_TOOL_DESCRIPTIONS) as GoogleAdsToolName[]

const HTTP_PATHS: Partial<Record<GoogleAdsToolName, { path: string, method: 'GET' | 'POST' }>> = {
  ads_google_status: { path: '/api/gpt/ads/google/status', method: 'GET' },
  ads_google_list_accounts: { path: '/api/gpt/ads/google/accounts', method: 'GET' },
  ads_google_list_campaigns: { path: '/api/gpt/ads/google/campaigns', method: 'GET' },
  ads_google_get_report: { path: '/api/gpt/ads/google/report', method: 'GET' },
}

export const ADS_GOOGLE_TOOL_DESCRIPTORS: BlimberMcpToolDescriptor[] = ADS_GOOGLE_TOOL_NAMES.map((name) => {
  const http = HTTP_PATHS[name]
  return {
    name,
    domain: 'ads.google',
    description: GOOGLE_ADS_TOOL_DESCRIPTIONS[name],
    status: 'ready' as const,
    httpPath: http?.path,
    httpMethod: http?.method,
    arguments: name === 'ads_google_status'
      ? ['tenantId']
      : ['tenantId', '…'],
    notes: 'Implementação em lib/google-ads. Leitura only — sem writes OAuth/campanha nesta fase.',
  }
})

export {
  adsGoogleStatusSchema,
  adsGoogleListAccountsSchema,
  adsGoogleListCampaignsSchema,
  adsGoogleGetReportSchema,
} from '../../google-ads'

export async function invokeAdsGoogleTool(
  name: string,
  ctx: GoogleAdsToolContext,
  args: unknown,
) {
  if (!(name in GOOGLE_ADS_TOOL_DESCRIPTIONS)) {
    return formatGoogleAdsToolError(new Error(`Tool Google Ads desconhecida: ${name}`))
  }
  try {
    const data = await invokeGoogleAdsTool(name as GoogleAdsToolName, ctx, args)
    return { ok: true as const, tool: name, data }
  }
  catch (error) {
    return formatGoogleAdsToolError(error)
  }
}

/** @deprecated Use invokeAdsGoogleTool with context */
export async function adsGoogleStatus(ctx: GoogleAdsToolContext, args: unknown) {
  const result = await invokeAdsGoogleTool('ads_google_status', ctx, args)
  if (!result.ok)
    throw new Error(result.error.message)
  return result.data
}
