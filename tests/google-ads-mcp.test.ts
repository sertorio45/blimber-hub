import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encryptSecret } from '~/lib/marketing-secrets'
import {
  adsGoogleGetReport,
  adsGoogleListCampaigns,
  adsGoogleStatus,
  formatGoogleAdsToolError,
  GOOGLE_ADS_TOOL_DESCRIPTIONS,
} from '~/lib/google-ads'
import { GoogleAdsToolError } from '~/lib/google-ads/types'
import { buildBlimberMcpRegistry } from '~/lib/blimber-mcp'

process.env.MARKETING_ENCRYPTION_SECRET = 'test-marketing-encryption-secret-for-mcp'
process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'test-developer-token'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'

vi.mock('~/server/utils/marketing-reports', () => ({
  fetchGoogleAdsReportData: vi.fn(),
}))

import { fetchGoogleAdsReportData } from '~/server/utils/marketing-reports'

function createGoogleIntegrationClient(config: Record<string, unknown>) {
  return {
    from(_table: string) {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        limit: async () => ({
          data: [{
            id: 'int-1',
            tenant_id: TENANT_ID,
            provider: 'google_ads',
            is_active: true,
            updated_at: '2026-08-01T00:00:00.000Z',
            config,
          }],
          error: null,
        }),
        maybeSingle: async () => ({
          data: {
            id: 'int-1',
            tenant_id: TENANT_ID,
            provider: 'google_ads',
            is_active: true,
            updated_at: '2026-08-01T00:00:00.000Z',
            config,
          },
          error: null,
        }),
      }
      return chain
    },
  }
}

function emptyGoogleClient() {
  return {
    from(_table: string) {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        limit: async () => ({ data: [], error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
      }
      return chain
    },
  }
}

function googleConfig(overrides: Record<string, unknown> = {}) {
  return {
    customer_id: '1234567890',
    access_token_enc: encryptSecret('google-access-token'),
    refresh_token_enc: encryptSecret('google-refresh-token'),
    token_expires_at: '2099-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('google ads MCP registry', () => {
  it('registers ready google tools in unified catalog', () => {
    const registry = buildBlimberMcpRegistry()
    const googleTools = registry.tools.filter(t => t.domain === 'ads.google')
    expect(googleTools.map(t => t.name)).toEqual([
      'ads_google_status',
      'ads_google_list_accounts',
      'ads_google_list_campaigns',
      'ads_google_get_report',
    ])
    expect(googleTools.every(t => t.status === 'ready')).toBe(true)
  })

  it('documents all tool descriptions', () => {
    expect(Object.keys(GOOGLE_ADS_TOOL_DESCRIPTIONS)).toHaveLength(4)
  })
})

describe('adsGoogleStatus', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns disconnected summary when integration is missing', async () => {
    const data = await adsGoogleStatus(
      { client: emptyGoogleClient() as any },
      { tenantId: TENANT_ID },
    )

    expect(data.connected).toBe(false)
    expect(data.ready).toBe(false)
    expect(data.notes[0]).toContain('não encontrada')
  })

  it('returns ready when oauth, customer and token are valid', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ access_token: 'refreshed-token' }))

    const data = await adsGoogleStatus(
      { client: createGoogleIntegrationClient(googleConfig()) as any },
      { tenantId: TENANT_ID },
    )

    expect(data.connected).toBe(true)
    expect(data.ready).toBe(true)
    expect(data.customer_id).toBe('1234567890')
    expect(data.token_valid).toBe(true)
  })
})

describe('adsGoogleListCampaigns', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('maps campaign rows from GAQL search', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({
      results: [{
        campaign: {
          id: '99',
          name: 'Search Brand',
          status: 'ENABLED',
          advertisingChannelType: 'SEARCH',
        },
        campaignBudget: {
          amountMicros: '5000000',
          type: 'STANDARD',
          period: 'DAILY',
        },
      }],
    }))

    const data = await adsGoogleListCampaigns(
      { client: createGoogleIntegrationClient(googleConfig()) as any },
      { tenantId: TENANT_ID },
    )

    expect(data.campaigns).toHaveLength(1)
    expect(data.campaigns[0]).toMatchObject({
      id: '99',
      name: 'Search Brand',
      status: 'ENABLED',
      channel_type: 'SEARCH',
      budget: {
        amount: 5,
        amount_micros: 5000000,
      },
    })
  })
})

describe('adsGoogleGetReport', () => {
  beforeEach(() => {
    vi.mocked(fetchGoogleAdsReportData).mockReset()
  })

  it('reuses fetchGoogleAdsReportData and applies campaign scope', async () => {
    vi.mocked(fetchGoogleAdsReportData).mockResolvedValue({
      connected: true,
      customer_id: '1234567890',
      needs_account: false,
      error: null,
      metrics: {
        impressions: 100,
        clicks: 10,
        cost: 50,
        conversions: 2,
        conversions_value: 200,
        ctr: 10,
        cpc: 5,
        cost_per_conversion: 25,
        roas: 4,
      },
      previous_metrics: null,
      deltas: null,
      campaigns: [{
        id: '1',
        name: 'Camp A',
        status: 'ENABLED',
        channel: 'SEARCH',
        impressions: 60,
        clicks: 6,
        cost: 30,
        conversions: 1,
        conversions_value: 100,
        ctr: 10,
        cpc: 5,
        cost_per_conversion: 30,
      }],
      series: [{ date: '2026-08-01', impressions: 100, clicks: 10, cost: 50, conversions: 2, conversions_value: 200 }],
      series_by_campaign: {
        1: [{ date: '2026-08-01', impressions: 60, clicks: 6, cost: 30, conversions: 1, conversions_value: 100 }],
      },
      conversion_actions: [{
        id: '10',
        name: 'Compra',
        campaign_id: '1',
        conversions: 1,
        conversions_value: 100,
        all_conversions: 1,
        all_conversions_value: 100,
      }],
      conversion_actions_configured: [],
      networks: [],
    })

    const data = await adsGoogleGetReport(
      { client: createGoogleIntegrationClient(googleConfig()) as any },
      {
        tenantId: TENANT_ID,
        campaignId: '1',
      },
    )

    expect(fetchGoogleAdsReportData).toHaveBeenCalled()
    expect(data.report.scope).toEqual({ campaign_id: '1' })
    expect(data.report.metrics.conversions).toBe(1)
    expect(data.report.series[0]?.clicks).toBe(6)
    expect(data.report.deltas).toBeNull()
  })
})

describe('formatGoogleAdsToolError', () => {
  it('maps typed errors to MCP payload', () => {
    const formatted = formatGoogleAdsToolError(
      new GoogleAdsToolError('TEST', 'Falha de teste', 418),
    )
    expect(formatted.ok).toBe(false)
    expect(formatted.error.statusCode).toBe(418)
    expect(formatted.error.message).toBe('Falha de teste')
  })
})
