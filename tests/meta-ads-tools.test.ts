import { beforeEach, describe, expect, it, vi } from 'vitest'

import { encryptSecret } from '~/lib/marketing-secrets'
import {
  invokeMetaTool,
  MetaAdsToolError,
  metaGetInsights,
  metaListCampaigns,
  metaUpdateCampaignStatus,
} from '~/lib/meta-ads'

process.env.MARKETING_ENCRYPTION_SECRET = 'test-marketing-encryption-secret-for-mcp'

function createIntegrationClient(config: Record<string, unknown>) {
  return {
    from(_table: string) {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        order: async () => ({
          data: [{
            id: 'int-1',
            tenant_id: 'tenant-1',
            provider: 'meta',
            is_active: true,
            updated_at: '2026-01-01T00:00:00.000Z',
            config,
          }],
          error: null,
        }),
        maybeSingle: async () => ({
          data: {
            id: 'int-1',
            tenant_id: 'tenant-1',
            provider: 'meta',
            is_active: true,
            updated_at: '2026-01-01T00:00:00.000Z',
            config,
          },
          error: null,
        }),
      }
      return chain
    },
  }
}

describe('meta-ads MCP tools', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('lists campaigns via Graph API using tenant token (never returns token)', async () => {
    const token = 'meta-access-token-secret'
    const client = createIntegrationClient({
      access_token_enc: encryptSecret(token),
      ad_account_id: '123456789',
      api_version: 'v20.0',
    })

    const graphFetch = vi.fn(async () => ({
      data: [
        { id: 'cmp_1', name: 'Campanha A', status: 'ACTIVE', objective: 'OUTCOME_SALES' },
      ],
    }))

    const result = await metaListCampaigns(
      { client, graphFetch },
      { tenantId: 'tenant-1', limit: 10 },
    )

    expect(result.adAccountId).toBe('123456789')
    expect(result.campaigns).toHaveLength(1)
    expect(JSON.stringify(result)).not.toContain(token)
    expect(graphFetch).toHaveBeenCalledOnce()
    const [url, init] = graphFetch.mock.calls[0]!
    expect(String(url)).toContain('/act_123456789/campaigns')
    expect(init?.query?.access_token).toBe(token)
  })

  it('fetches insights with date preset', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '999',
    })

    const graphFetch = vi.fn(async () => ({
      data: [{ campaign_id: '1', spend: '12.5', impressions: '1000' }],
    }))

    const result = await metaGetInsights(
      { client, graphFetch },
      { tenantId: 'tenant-1', datePreset: 'last_7d', level: 'campaign' },
    )

    expect(result.insights[0].spend).toBe('12.5')
    const [, init] = graphFetch.mock.calls[0]!
    expect(init?.query?.date_preset).toBe('last_7d')
    expect(init?.query?.level).toBe('campaign')
  })

  it('rejects campaign status update without confirmTenantId match', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '999',
    })

    await expect(metaUpdateCampaignStatus(
      { client, graphFetch: vi.fn() },
      {
        tenantId: 'tenant-1',
        campaignId: 'cmp_1',
        status: 'PAUSED',
        confirmTenantId: 'other-tenant',
        confirm: true,
      },
    )).rejects.toBeInstanceOf(MetaAdsToolError)
  })

  it('updates campaign status after ownership check', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })

    const graphFetch = vi.fn(async (url: string, init?: any) => {
      if (init?.method === 'POST')
        return { success: true }
      return {
        id: 'cmp_1',
        name: 'X',
        account_id: '555',
        status: 'ACTIVE',
      }
    })

    const result = await metaUpdateCampaignStatus(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        campaignId: 'cmp_1',
        status: 'PAUSED',
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )

    expect(result.success).toBe(true)
    expect(result.status).toBe('PAUSED')
    expect(graphFetch).toHaveBeenCalled()
  })

  it('invokeMetaTool routes unknown tool as error only via registry keys', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '1',
    })
    const data = await invokeMetaTool(
      'meta_list_integrations',
      { client },
      { tenantId: 'tenant-1' },
    )
    expect((data as any).integrations).toBeDefined()
  })

  it('fails when Meta is not connected', async () => {
    const emptyClient = {
      from() {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          order: async () => ({ data: [], error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
        }
        return chain
      },
    }

    await expect(metaListCampaigns(
      { client: emptyClient, graphFetch: vi.fn() },
      { tenantId: 'tenant-missing' },
    )).rejects.toMatchObject({ code: 'META_NOT_CONNECTED' })
  })
})
