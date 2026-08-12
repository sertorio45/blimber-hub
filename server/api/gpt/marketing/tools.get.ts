import { defineEventHandler } from 'h3'
import {
  MARKETING_TOOL_DESCRIPTIONS,
  type MarketingToolName,
} from '~/lib/blimber-mcp'
import { assertBlimberMcpApiKey } from '~/server/utils/blimber-gpt-auth'

const TOOL_INPUT_HINTS: Record<MarketingToolName, string[]> = {
  marketing_list_social_accounts: ['tenantId'],
  marketing_list_assets: ['tenantId', 'limit?', 'search?', 'purpose?', 'mime?', 'campaignId?'],
  marketing_get_brand_context: ['tenantId'],
  marketing_list_posts: ['tenantId', 'page?', 'pageSize?', 'status?', 'campaignId?', 'search?'],
  marketing_get_post: ['tenantId', 'postId'],
  marketing_create_post: [
    'tenantId',
    'title',
    'confirmTenantId',
    'confirm',
    'content?',
    'campaignId?',
    'hashtags?',
    'referenceAssetIds?',
    'accountId+platform?',
    'dryRun? (default true)',
    'actorUserId?',
  ],
  marketing_update_post: [
    'tenantId',
    'postId',
    'confirmTenantId',
    'confirm',
    'title?',
    'content?',
    'campaignId?',
    'dryRun? (default true)',
    'actorUserId?',
  ],
  marketing_list_campaigns: ['tenantId', 'status?', 'search?', 'limit?'],
  marketing_get_campaign: ['tenantId', 'campaignId'],
  marketing_create_campaign: [
    'tenantId',
    'name',
    'confirmTenantId',
    'confirm',
    'objective?',
    'status?',
    'briefingSummary?',
    'dryRun? (default true)',
    'actorUserId?',
  ],
  marketing_update_campaign: [
    'tenantId',
    'campaignId',
    'confirmTenantId',
    'confirm',
    'name?',
    'status?',
    'briefingSummary?',
    'dryRun? (default true)',
    'actorUserId?',
  ],
}

export default defineEventHandler((event) => {
  assertBlimberMcpApiKey(event)

  const tools = (Object.keys(MARKETING_TOOL_DESCRIPTIONS) as MarketingToolName[]).map(name => ({
    name,
    description: MARKETING_TOOL_DESCRIPTIONS[name],
    arguments: TOOL_INPUT_HINTS[name],
  }))

  return {
    server: 'blimber-marketing',
    version: '0.1.0',
    note: 'Campanhas aqui = EDITORIAIS (social_campaigns). Meta Ads = /api/gpt/meta/*.',
    tools,
  }
})
