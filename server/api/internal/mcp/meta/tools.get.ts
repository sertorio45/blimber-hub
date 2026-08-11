import type { MetaToolName } from '~/lib/meta-ads'
import { defineEventHandler } from 'h3'
import { META_TOOL_DESCRIPTIONS } from '~/lib/meta-ads'
import { assertMetaGptApiKey } from '~/server/utils/meta-gpt-auth'

const TOOL_INPUT_HINTS: Record<MetaToolName, string[]> = {
  meta_list_integrations: ['tenantId'],
  meta_list_ad_accounts: ['tenantId'],
  meta_list_campaigns: ['tenantId', 'adAccountId?', 'limit?', 'status?'],
  meta_get_campaign: ['tenantId', 'campaignId', 'adAccountId?'],
  meta_list_adsets: ['tenantId', 'campaignId?', 'adAccountId?', 'limit?'],
  meta_list_ads: ['tenantId', 'campaignId?', 'adsetId?', 'activeOnly?', 'adAccountId?', 'limit?'],
  meta_get_insights: [
    'tenantId',
    'level?',
    'datePreset?',
    'dateStart?',
    'dateEnd?',
    'metrics?',
    'objectId?',
    'adAccountId?',
    'limit?',
  ],
  meta_update_campaign_status: [
    'tenantId',
    'campaignId',
    'status (ACTIVE|PAUSED)',
    'confirmTenantId (=tenantId)',
    'confirm (=true)',
    'adAccountId?',
  ],
}

/**
 * Legacy catalog. Prefer GET /api/gpt/meta/tools for ChatGPT Actions.
 * Auth required (same API key as invoke).
 */
export default defineEventHandler((event) => {
  assertMetaGptApiKey(event)

  const tools = (Object.keys(META_TOOL_DESCRIPTIONS) as MetaToolName[]).map(name => ({
    name,
    description: META_TOOL_DESCRIPTIONS[name],
    arguments: TOOL_INPUT_HINTS[name],
  }))

  return {
    server: 'blimber-meta',
    version: '0.1.0',
    deprecated: 'Use /api/gpt/meta/* and gpt/blimber-meta/openapi.yaml for ChatGPT.',
    transport: {
      primary: 'POST /api/gpt/meta/* (OpenAPI ChatGPT Actions)',
      http: 'POST /api/internal/mcp/meta/invoke',
      stdio: 'pnpm mcp:meta',
    },
    tools,
  }
})
