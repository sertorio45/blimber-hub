import { defineEventHandler } from 'h3'
import { ADS_GOOGLE_TOOL_DESCRIPTORS } from '~/lib/blimber-mcp'
import { GOOGLE_ADS_TOOL_DESCRIPTIONS, type GoogleAdsToolName } from '~/lib/google-ads'
import { assertBlimberMcpApiKey } from '~/server/utils/blimber-gpt-auth'

/**
 * Ads Google namespace catalog.
 * Implementation = lib/google-ads; REST read = /api/gpt/ads/google/*.
 */
export default defineEventHandler((event) => {
  assertBlimberMcpApiKey(event)

  const tools = (Object.keys(GOOGLE_ADS_TOOL_DESCRIPTIONS) as GoogleAdsToolName[]).map(name => ({
    name,
    description: GOOGLE_ADS_TOOL_DESCRIPTIONS[name],
    httpBase: '/api/gpt/ads/google',
  }))

  return {
    server: 'blimber-ads-google',
    version: '1.0.0',
    status: 'ready',
    note: 'Namespace ads.google. HTTP canônico: /api/gpt/ads/google/*.',
    tools,
    registry: ADS_GOOGLE_TOOL_DESCRIPTORS,
  }
})
