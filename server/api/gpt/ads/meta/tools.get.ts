import { defineEventHandler } from 'h3'
import { listAdsMetaAliasDescriptors } from '~/lib/blimber-mcp'
import { META_TOOL_DESCRIPTIONS, type MetaToolName } from '~/lib/meta-ads'
import { assertBlimberMcpApiKey } from '~/server/utils/blimber-gpt-auth'

/**
 * Ads Meta namespace catalog.
 * Implementation = lib/meta-ads; REST write/read = /api/gpt/meta/* (unchanged).
 * Unified aliases use ads_meta_* names via invoke or registry.
 */
export default defineEventHandler((event) => {
  assertBlimberMcpApiKey(event)

  const legacy = (Object.keys(META_TOOL_DESCRIPTIONS) as MetaToolName[]).map(name => ({
    name,
    description: META_TOOL_DESCRIPTIONS[name],
    httpBase: '/api/gpt/meta',
  }))

  return {
    server: 'blimber-ads-meta',
    version: '1.0.0',
    status: 'ready',
    note: 'Namespace ads.meta. HTTP canônico: /api/gpt/meta/*. ChatGPT: gpt/blimber/openapi-ads.yaml.',
    tools: legacy,
    aliases: listAdsMetaAliasDescriptors(),
  }
})
