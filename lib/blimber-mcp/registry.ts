/**
 * Unified tool catalog for Blimber MCP / Custom GPT Actions.
 */

import { META_TOOL_DESCRIPTIONS, type MetaToolName } from '../meta-ads'
import { ADS_GOOGLE_TOOL_DESCRIPTORS } from './ads/google'
import { listAdsMetaAliasDescriptors } from './ads/meta'
import { MARKETING_TOOL_DESCRIPTIONS, type MarketingToolName } from './marketing-tools'
import type { BlimberMcpToolDescriptor } from './types'

export const BLIMBER_MCP_VERSION = '0.1.0'

const CRM_STUB_TOOLS: BlimberMcpToolDescriptor[] = [
  {
    name: 'crm_status',
    domain: 'crm',
    description: 'Stub: CRM unificado ainda não disponível via MCP.',
    status: 'planned',
    notes: 'Fase futura — sem writes CRM nesta base.',
  },
]

export function listPlatformToolDescriptors(): BlimberMcpToolDescriptor[] {
  return [
    {
      name: 'searchTenants',
      domain: 'platform',
      description: 'Busca tenant por nome/slug → id, name, slug (sem tokens).',
      status: 'ready',
      httpPath: '/api/gpt/tenants',
      httpMethod: 'GET',
      arguments: ['q', 'name?', 'organizationId?', 'limit?'],
      notes: 'Também em /api/gpt/meta/tenants (pack Meta legado).',
    },
    {
      name: 'listBlimberTools',
      domain: 'platform',
      description: 'Catálogo unificado de tools por domínio (marketing, ads.meta, crm stub…).',
      status: 'ready',
      httpPath: '/api/gpt/tools',
      httpMethod: 'GET',
    },
  ]
}

export function listMarketingToolDescriptors(): BlimberMcpToolDescriptor[] {
  const hints: Partial<Record<MarketingToolName, { path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' }>> = {
    marketing_list_social_accounts: { path: '/api/gpt/marketing/accounts', method: 'GET' },
    marketing_list_assets: { path: '/api/gpt/marketing/assets', method: 'GET' },
    marketing_get_brand_context: { path: '/api/gpt/marketing/brand-context', method: 'GET' },
    marketing_list_posts: { path: '/api/gpt/marketing/posts', method: 'GET' },
    marketing_get_post: { path: '/api/gpt/marketing/posts/{postId}', method: 'GET' },
    marketing_create_post: { path: '/api/gpt/marketing/posts', method: 'POST' },
    marketing_update_post: { path: '/api/gpt/marketing/posts/{postId}', method: 'PUT' },
    marketing_approve_post: { path: '/api/gpt/marketing/posts/{postId}/approve', method: 'POST' },
    marketing_schedule_post: { path: '/api/gpt/marketing/posts/{postId}/schedule', method: 'POST' },
    marketing_publish_post: { path: '/api/gpt/marketing/posts/{postId}/publish', method: 'POST' },
    marketing_unschedule_post: { path: '/api/gpt/marketing/posts/{postId}/unschedule', method: 'POST' },
    marketing_delete_post: { path: '/api/gpt/marketing/posts/{postId}/delete', method: 'POST' },
    marketing_delete_asset: { path: '/api/gpt/marketing/assets/{assetId}/delete', method: 'POST' },
    marketing_upload_asset: { path: '/api/gpt/marketing/assets/upload', method: 'POST' },
    marketing_list_campaigns: { path: '/api/gpt/marketing/campaigns', method: 'GET' },
    marketing_get_campaign: { path: '/api/gpt/marketing/campaigns/{campaignId}', method: 'GET' },
    marketing_create_campaign: { path: '/api/gpt/marketing/campaigns', method: 'POST' },
    marketing_update_campaign: { path: '/api/gpt/marketing/campaigns/{campaignId}', method: 'PUT' },
  }

  return (Object.keys(MARKETING_TOOL_DESCRIPTIONS) as MarketingToolName[]).map((name) => {
    const http = hints[name]
    return {
      name,
      domain: 'marketing' as const,
      description: MARKETING_TOOL_DESCRIPTIONS[name],
      status: 'ready' as const,
      httpPath: http?.path,
      httpMethod: http?.method,
    }
  })
}

export function listLegacyMetaToolDescriptors(): BlimberMcpToolDescriptor[] {
  return (Object.keys(META_TOOL_DESCRIPTIONS) as MetaToolName[]).map(name => ({
    name,
    domain: 'ads.meta' as const,
    description: META_TOOL_DESCRIPTIONS[name],
    status: 'ready' as const,
    httpPath: '/api/gpt/meta/*',
    notes: 'Implementação em lib/meta-ads. ChatGPT: gpt/blimber/openapi-ads.yaml.',
  }))
}

export function buildBlimberMcpRegistry(): {
  server: string
  version: string
  domains: string[]
  tools: BlimberMcpToolDescriptor[]
} {
  const tools: BlimberMcpToolDescriptor[] = [
    ...listPlatformToolDescriptors(),
    ...listMarketingToolDescriptors(),
    ...listLegacyMetaToolDescriptors(),
    ...listAdsMetaAliasDescriptors(),
    ...ADS_GOOGLE_TOOL_DESCRIPTORS,
    ...CRM_STUB_TOOLS,
  ]

  return {
    server: 'blimber',
    version: BLIMBER_MCP_VERSION,
    domains: ['platform', 'marketing', 'ads.meta', 'ads.google', 'brand', 'crm'],
    tools,
  }
}
