import { defineEventHandler } from 'h3'
import { buildBlimberMcpRegistry } from '~/lib/blimber-mcp'
import { assertBlimberMcpApiKey } from '~/server/utils/blimber-gpt-auth'

/**
 * Unified catalog: platform + marketing + ads.meta (+ google/crm stubs).
 * Meta Graph write logic stays in lib/meta-ads; HTTP REST remains /api/gpt/meta/*.
 */
export default defineEventHandler((event) => {
  assertBlimberMcpApiKey(event)

  const registry = buildBlimberMcpRegistry()
  const ready = registry.tools.filter(t => t.status === 'ready' || t.status === 'alias')

  return {
    ...registry,
    primary: 'ChatGPT Custom GPT Actions (unified hub)',
    transport: {
      openapi: 'gpt/blimber/openapi.yaml',
      metaOpenapiCoexist: 'gpt/blimber-meta/openapi.yaml',
      httpMarketing: '/api/gpt/marketing/*',
      httpMeta: '/api/gpt/meta/*',
      httpAdsMetaAlias: '/api/gpt/ads/meta/*',
      httpAdsGoogle: '/api/gpt/ads/google/status',
      httpTenants: '/api/gpt/tenants',
    },
    namespaces: {
      platform: registry.tools.filter(t => t.domain === 'platform').map(t => t.name),
      marketing: registry.tools.filter(t => t.domain === 'marketing').map(t => t.name),
      'ads.meta': registry.tools.filter(t => t.domain === 'ads.meta' && t.status === 'ready').map(t => t.name),
      'ads.google': registry.tools.filter(t => t.domain === 'ads.google').map(t => t.name),
      crm: registry.tools.filter(t => t.domain === 'crm').map(t => t.name),
    },
    readyCount: ready.length,
  }
})
