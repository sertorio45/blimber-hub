import { beforeEach, describe, expect, it, vi } from 'vitest'

import { encryptSecret } from '~/lib/marketing-secrets'
import {
  invokeMetaTool,
  MetaAdsToolError,
  metaCreateAd,
  metaCreateAdset,
  metaCreateCampaign,
  metaExecuteBulkDelete,
  metaGetInsights,
  metaListCampaigns,
  metaListCustomAudiences,
  metaListIntegrations,
  metaPreviewBulkDelete,
  metaSearchGeolocations,
  metaSearchInterests,
  metaUpdateAdCreativeCopy,
  metaUpdateAdMedia,
  metaUpdateAdTracking,
  metaUpdateAdsetBudget,
  metaUpdateAdsetStatus,
  metaUpdateAdsetTargeting,
  metaUpdateAdStatus,
  metaUpdateCampaignStatus,
  setMetaWriteAuditSink,
  metaListExperiments,
  metaCheckExperimentEligibility,
  metaCreateExperiment,
  metaGetExperiment,
} from '~/lib/meta-ads'

process.env.MARKETING_ENCRYPTION_SECRET = 'test-marketing-encryption-secret-for-mcp'

function createIntegrationClient(config: Record<string, unknown>) {
  return {
    from(_table: string) {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        insert: async () => ({ error: null }),
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
    vi.unstubAllEnvs()
    setMetaWriteAuditSink(() => {})
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

  it('lists campaigns on Ads Graph v25 while Ad Studies stay isolated', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '123456789',
      api_version: 'v25.0',
    })
    const graphFetch = vi.fn(async () => ({ data: [] }))
    await metaListCampaigns(
      { client, graphFetch },
      { tenantId: 'tenant-1', limit: 10 },
    )
    const [url] = graphFetch.mock.calls[0]!
    expect(String(url)).toContain('https://graph.facebook.com/v25.0/act_123456789/campaigns')
    expect(String(url)).not.toContain('/v26.0/')
  })

  it('searches interests via Graph adinterest (never returns token)', async () => {
    const token = 'meta-interest-token'
    const client = createIntegrationClient({
      access_token_enc: encryptSecret(token),
      ad_account_id: '123',
      api_version: 'v20.0',
    })
    const graphFetch = vi.fn(async () => ({
      data: [
        {
          id: '6003139266461',
          name: 'Cosmetics',
          audience_size_lower_bound: 1000000,
          audience_size_upper_bound: 2000000,
          path: ['Shopping', 'Beauty'],
          topic: 'Shopping',
        },
      ],
    }))

    const result = await metaSearchInterests(
      { client, graphFetch },
      { tenantId: 'tenant-1', q: 'cosméticos', limit: 10 },
    )

    expect(result.interests).toHaveLength(1)
    expect(result.interests[0]).toMatchObject({
      id: '6003139266461',
      name: 'Cosmetics',
      audience_size: 2000000,
      type: 'adinterest',
    })
    expect(JSON.stringify(result)).not.toContain(token)
    const [url, init] = graphFetch.mock.calls[0]!
    expect(String(url)).toContain('/search')
    expect(init?.query).toMatchObject({
      type: 'adinterest',
      q: 'cosméticos',
      locale: 'pt_BR',
      access_token: token,
    })
  })

  it('searches geolocations via Graph adgeolocation', async () => {
    const token = 'meta-geo-token'
    const client = createIntegrationClient({
      access_token_enc: encryptSecret(token),
      ad_account_id: '123',
      api_version: 'v20.0',
    })
    const graphFetch = vi.fn(async () => ({
      data: [
        {
          key: '2439115',
          name: 'São Paulo',
          type: 'city',
          country_code: 'BR',
          region: 'São Paulo',
          region_id: '2418',
        },
      ],
    }))

    const result = await metaSearchGeolocations(
      { client, graphFetch },
      { tenantId: 'tenant-1', q: 'São Paulo', countryCode: 'BR' },
    )

    expect(result.geolocations).toHaveLength(1)
    expect(result.geolocations[0]).toMatchObject({
      key: '2439115',
      name: 'São Paulo',
      type: 'city',
      country_code: 'BR',
    })
    expect(result.locationTypes).toEqual(['city', 'region'])
    const [, init] = graphFetch.mock.calls[0]!
    expect(init?.query).toMatchObject({
      type: 'adgeolocation',
      q: 'São Paulo',
      country_code: 'BR',
      location_types: JSON.stringify(['city', 'region']),
      access_token: token,
    })
    expect(JSON.stringify(result)).not.toContain(token)
  })

  it('lists custom audiences for ad account', async () => {
    const token = 'meta-audience-token'
    const client = createIntegrationClient({
      access_token_enc: encryptSecret(token),
      ad_account_id: '987654321',
      api_version: 'v20.0',
    })
    const graphFetch = vi.fn(async () => ({
      data: [
        {
          id: '1202123456789',
          name: 'Visitantes site 30d',
          subtype: 'WEBSITE',
          approximate_count: 15000,
        },
      ],
    }))

    const result = await metaListCustomAudiences(
      { client, graphFetch },
      { tenantId: 'tenant-1', limit: 20 },
    )

    expect(result.adAccountId).toBe('987654321')
    expect(result.customAudiences).toHaveLength(1)
    expect(result.customAudiences[0]).toMatchObject({
      id: '1202123456789',
      name: 'Visitantes site 30d',
      subtype: 'WEBSITE',
      approximate_count: 15000,
    })
    const [url, init] = graphFetch.mock.calls[0]!
    expect(String(url)).toContain('/act_987654321/customaudiences')
    expect(init?.query?.access_token).toBe(token)
    expect(JSON.stringify(result)).not.toContain(token)
  })

  it('rejects empty interest search query', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '1',
    })
    await expect(metaSearchInterests(
      { client, graphFetch: vi.fn() },
      { tenantId: 'tenant-1', q: '' },
    )).rejects.toBeTruthy()
  })

  it('lists integrations with write_readiness for Meta', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      granted_scopes: ['ads_read', 'ads_management', 'pages_show_list'],
    })

    const result = await metaListIntegrations({ client }, { tenantId: 'tenant-1' })
    expect(result.integrations).toHaveLength(1)
    const row = result.integrations[0]!
    expect(row.meta_ready).toBe(true)
    expect(row.write_readiness?.ads_management).toBe(true)
    expect(row.write_readiness?.has_page_token).toBe(true)
    expect(row.write_readiness?.scopes_unknown).toBe(false)
    expect(JSON.stringify(result)).not.toContain('page-tok')
  })

  it('write_readiness flags missing ads_management', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
      granted_scopes: 'ads_read,read_insights',
    })

    const result = await metaListIntegrations({ client }, { tenantId: 'tenant-1' })
    expect(result.integrations[0]!.write_readiness?.ads_management).toBe(false)
    expect(result.integrations[0]!.write_readiness?.has_page_token).toBe(false)
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

    const graphFetch = vi.fn(async (_url: string, init?: any) => {
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
    expect((result as any).dryRun).toBe(false)
    expect(graphFetch).toHaveBeenCalled()
    const postCalls = graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(postCalls).toHaveLength(1)
  })

  it('dryRun=true preview skips Graph POST for campaign status', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })

    const graphFetch = vi.fn(async () => ({
      id: 'cmp_1',
      name: 'X',
      account_id: '555',
      status: 'ACTIVE',
    }))

    const result = await metaUpdateCampaignStatus(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        campaignId: 'cmp_1',
        status: 'PAUSED',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: true,
      },
    )

    expect(result.success).toBe(true)
    expect((result as any).dryRun).toBe(true)
    expect((result as any).preview?.body).toEqual({ status: 'PAUSED' })
    const postCalls = graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(postCalls).toHaveLength(0)
  })

  it('rejects adset status when ownership mismatches', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })

    const graphFetch = vi.fn(async () => ({
      id: 'adset_1',
      account_id: '999',
      status: 'ACTIVE',
    }))

    await expect(metaUpdateAdsetStatus(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        status: 'PAUSED',
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )).rejects.toMatchObject({ code: 'ADSET_TENANT_MISMATCH', statusCode: 403 })
  })

  it('updates adset status with audit path (executed)', async () => {
    const audits: unknown[] = []
    setMetaWriteAuditSink(r => audits.push(r))

    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })

    const graphFetch = vi.fn(async (_url: string, init?: any) => {
      if (init?.method === 'POST')
        return { success: true }
      return { id: 'adset_1', account_id: '555', status: 'ACTIVE', name: 'AS' }
    })

    const result = await metaUpdateAdsetStatus(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        status: 'PAUSED',
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )

    expect(result.success).toBe(true)
    expect((result as any).adsetId).toBe('adset_1')
    expect(audits.some((a: any) => a.action === 'meta.gpt.adset.status' && a.dryRun === false)).toBe(true)
  })

  it('updates ad status after ownership check', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })

    const graphFetch = vi.fn(async (_url: string, init?: any) => {
      if (init?.method === 'POST')
        return { success: true }
      return { id: 'ad_1', account_id: 'act_555', status: 'PAUSED', name: 'Ad' }
    })

    const result = await metaUpdateAdStatus(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adId: 'ad_1',
        status: 'ACTIVE',
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )

    expect(result.success).toBe(true)
    expect(result.status).toBe('ACTIVE')
    expect((result as any).adId).toBe('ad_1')
  })

  it('rejects ad status without confirm true', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })

    await expect(metaUpdateAdStatus(
      { client, graphFetch: vi.fn() },
      {
        tenantId: 'tenant-1',
        adId: 'ad_1',
        status: 'PAUSED',
        confirmTenantId: 'tenant-1',
        confirm: false,
      },
    )).rejects.toBeInstanceOf(Error)
  })

  it('create campaign dryRun default skips Graph entirely and returns preview', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn()

    const result = await metaCreateCampaign(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        name: 'Campanha Teste',
        objective: 'OUTCOME_SALES',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dailyBudget: 5000,
      },
    )

    expect(result.success).toBe(true)
    expect((result as any).dryRun).toBe(true)
    expect((result as any).campaignId).toBeNull()
    expect((result as any).status).toBe('PAUSED')
    expect((result as any).preview?.body).toMatchObject({
      name: 'Campanha Teste',
      objective: 'OUTCOME_SALES',
      status: 'PAUSED',
      daily_budget: 5000,
      special_ad_categories: [],
    })
    expect((result as any).preview?.body.is_adset_budget_sharing_enabled).toBeUndefined()
    expect(graphFetch).not.toHaveBeenCalled()
  })

  it('create campaign dryRun without budget sets is_adset_budget_sharing_enabled false', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn()

    const result = await metaCreateCampaign(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        name: 'ABO Campaign',
        objective: 'OUTCOME_TRAFFIC',
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )

    expect((result as any).preview?.body).toMatchObject({
      name: 'ABO Campaign',
      objective: 'OUTCOME_TRAFFIC',
      status: 'PAUSED',
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: false,
    })
    expect((result as any).preview?.body.daily_budget).toBeUndefined()
    expect(graphFetch).not.toHaveBeenCalled()
  })

  it('create campaign rejects confirmTenantId mismatch without Graph', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn()

    await expect(metaCreateCampaign(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        name: 'X',
        objective: 'OUTCOME_TRAFFIC',
        confirmTenantId: 'other',
        confirm: true,
      },
    )).rejects.toMatchObject({ code: 'CONFIRM_TENANT_MISMATCH' })
    expect(graphFetch).not.toHaveBeenCalled()
  })

  it('create campaign ACTIVE without confirmActive is rejected', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })

    await expect(metaCreateCampaign(
      { client, graphFetch: vi.fn() },
      {
        tenantId: 'tenant-1',
        name: 'Live',
        objective: 'OUTCOME_LEADS',
        status: 'ACTIVE',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: true,
      },
    )).rejects.toMatchObject({ code: 'CONFIRM_ACTIVE_REQUIRED' })
  })

  it('create campaign rejects legacy objective', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })

    await expect(metaCreateCampaign(
      { client, graphFetch: vi.fn() },
      {
        tenantId: 'tenant-1',
        name: 'Legacy',
        objective: 'CONVERSIONS',
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )).rejects.toBeInstanceOf(Error)
  })

  it('create campaign execute posts to act_*/campaigns and audits campaign id', async () => {
    const audits: unknown[] = []
    setMetaWriteAuditSink(r => audits.push(r))

    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })

    const graphFetch = vi.fn(async (url: string, init?: any) => {
      if (init?.method === 'POST')
        return { id: 'cmp_new_1' }
      if (String(url).includes('/act_555'))
        return { id: 'act_555', account_id: '555', currency: 'BRL', name: 'Conta' }
      return {}
    })

    const result = await metaCreateCampaign(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        name: 'Campanha Real',
        objective: 'OUTCOME_SALES',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: false,
        dailyBudget: 10000,
      },
    )

    expect(result.success).toBe(true)
    expect((result as any).dryRun).toBe(false)
    expect((result as any).campaignId).toBe('cmp_new_1')
    expect((result as any).currency).toBe('BRL')
    const postCalls = graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(postCalls).toHaveLength(1)
    expect(String(postCalls[0]![0])).toContain('/act_555/campaigns')
    expect(postCalls[0]![1]?.body).toMatchObject({
      name: 'Campanha Real',
      objective: 'OUTCOME_SALES',
      status: 'PAUSED',
      daily_budget: 10000,
      special_ad_categories: [],
    })
    expect(postCalls[0]![1]?.body.is_adset_budget_sharing_enabled).toBeUndefined()
    expect(audits.some((a: any) =>
      a.action === 'meta.gpt.campaign.create'
      && a.dryRun === false
      && a.entityId === 'cmp_new_1',
    )).toBe(true)
    expect(JSON.stringify(result)).not.toContain('tok')
  })

  it('create campaign Graph error returns subcode/user msgs and sanitized payload', async () => {
    const audits: unknown[] = []
    setMetaWriteAuditSink(r => audits.push(r))

    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok-secret'),
      ad_account_id: '555',
    })

    const graphFetch = vi.fn(async (_url: string, init?: any) => {
      if (init?.method === 'POST') {
        throw new MetaAdsToolError('META_GRAPH_ERROR', 'Invalid parameter', 400, {
          type: 'OAuthException',
          code: 100,
          error_subcode: 4834011,
          error_user_title: 'Campo obrigatório',
          error_user_msg: 'Informe is_adset_budget_sharing_enabled',
          fbtrace_id: 'AbC123',
        })
      }
      return { id: 'act_555', account_id: '555', currency: 'BRL' }
    })

    await expect(metaCreateCampaign(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        name: 'Falhou',
        objective: 'OUTCOME_SALES',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: false,
      },
    )).rejects.toMatchObject({
      code: 'META_GRAPH_ERROR',
      details: {
        code: 100,
        error_subcode: 4834011,
        error_user_title: 'Campo obrigatório',
        error_user_msg: 'Informe is_adset_budget_sharing_enabled',
        fbtrace_id: 'AbC123',
        request_payload: {
          name: 'Falhou',
          objective: 'OUTCOME_SALES',
          status: 'PAUSED',
          special_ad_categories: [],
          is_adset_budget_sharing_enabled: false,
        },
      },
    })

    expect(audits.some((a: any) => a.action === 'meta.gpt.campaign.create.failed')).toBe(true)
    expect(JSON.stringify(audits)).not.toContain('tok-secret')
  })

  it('create campaign rejects budget above META_GPT_BUDGET_DAILY_MAX_CENTS', async () => {
    const prev = process.env.META_GPT_BUDGET_DAILY_MAX_CENTS
    process.env.META_GPT_BUDGET_DAILY_MAX_CENTS = '1000'
    try {
      const client = createIntegrationClient({
        access_token_enc: encryptSecret('tok'),
        ad_account_id: '555',
      })
      await expect(metaCreateCampaign(
        { client, graphFetch: vi.fn() },
        {
          tenantId: 'tenant-1',
          name: 'Over',
          objective: 'OUTCOME_TRAFFIC',
          confirmTenantId: 'tenant-1',
          confirm: true,
          dailyBudget: 1001,
        },
      )).rejects.toMatchObject({ code: 'BUDGET_LIMIT_EXCEEDED' })
    }
    finally {
      if (prev === undefined)
        delete process.env.META_GPT_BUDGET_DAILY_MAX_CENTS
      else
        process.env.META_GPT_BUDGET_DAILY_MAX_CENTS = prev
    }
  })

  it('create adset dryRun default skips Graph entirely and returns targeting preview', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn()

    const result = await metaCreateAdset(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        campaignId: 'cmp_1',
        name: 'Adset BR',
        targetingTemplate: 'BR_25_54',
        billingEvent: 'IMPRESSIONS',
        optimizationGoal: 'LINK_CLICKS',
        dailyBudget: 8000,
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )

    expect(result.success).toBe(true)
    expect((result as any).dryRun).toBe(true)
    expect((result as any).adsetId).toBeNull()
    expect((result as any).status).toBe('PAUSED')
    expect((result as any).targetingTemplate).toBe('BR_25_54')
    expect((result as any).advantageAudience).toBe(0)
    expect((result as any).targeting).toEqual({
      geo_locations: { countries: ['BR'] },
      age_min: 25,
      age_max: 54,
      targeting_automation: { advantage_audience: 0 },
    })
    expect((result as any).preview?.body).toMatchObject({
      name: 'Adset BR',
      campaign_id: 'cmp_1',
      status: 'PAUSED',
      daily_budget: 8000,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: {
        targeting_automation: { advantage_audience: 0 },
      },
    })
    expect((result as any).preview?.notes?.some((n: string) => n.includes('BR_25_54'))).toBe(true)
    expect((result as any).preview?.notes?.some((n: string) => n.includes('advantage_audience=0'))).toBe(true)
    expect(graphFetch).not.toHaveBeenCalled()
  })

  it('create adset isDynamicCreative dryRun previews is_dynamic_creative', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn()

    const result = await metaCreateAdset(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        campaignId: 'cmp_1',
        name: 'Adset Dyn',
        targetingTemplate: 'BR_18_65',
        billingEvent: 'IMPRESSIONS',
        optimizationGoal: 'LINK_CLICKS',
        dailyBudget: 5000,
        isDynamicCreative: true,
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )

    expect(result.success).toBe(true)
    expect((result as any).isDynamicCreative).toBe(true)
    expect((result as any).preview?.body).toMatchObject({
      is_dynamic_creative: true,
    })
    expect(graphFetch).not.toHaveBeenCalled()
  })

  it('create adset rejects isDynamicCreative with WHATSAPP', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
      page_id: 'page_1',
    })

    await expect(metaCreateAdset(
      { client, graphFetch: vi.fn() },
      {
        tenantId: 'tenant-1',
        campaignId: 'cmp_1',
        name: 'Bad Dyn',
        targetingTemplate: 'BR_18_65',
        billingEvent: 'IMPRESSIONS',
        optimizationGoal: 'CONVERSATIONS',
        destinationType: 'WHATSAPP',
        isDynamicCreative: true,
        dailyBudget: 5000,
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )).rejects.toThrow(/isDynamicCreative|WEBSITE/)
  })

  it('create adset rejects confirmTenantId mismatch without Graph', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn()

    await expect(metaCreateAdset(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        campaignId: 'cmp_1',
        name: 'X',
        targetingTemplate: 'BR_18_65',
        billingEvent: 'IMPRESSIONS',
        optimizationGoal: 'REACH',
        dailyBudget: 1000,
        confirmTenantId: 'other',
        confirm: true,
      },
    )).rejects.toMatchObject({ code: 'CONFIRM_TENANT_MISMATCH' })
    expect(graphFetch).not.toHaveBeenCalled()
  })

  it('create adset rejects invalid targetingTemplate', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })

    await expect(metaCreateAdset(
      { client, graphFetch: vi.fn() },
      {
        tenantId: 'tenant-1',
        campaignId: 'cmp_1',
        name: 'Bad targeting',
        targetingTemplate: 'US_OPEN_GRAPH',
        billingEvent: 'IMPRESSIONS',
        optimizationGoal: 'REACH',
        dailyBudget: 1000,
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )).rejects.toBeInstanceOf(Error)
  })

  it('create adset with custom targeting dryRun previews Graph payload', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn()

    const result = await metaCreateAdset(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        campaignId: 'cmp_1',
        name: 'Farma custom',
        targeting: {
          age_min: 25,
          age_max: 45,
          genders: [2],
          geo_locations: { countries: ['BR'] },
          interests: [{ id: '6003139266461', name: 'Cosmetics' }],
        },
        billingEvent: 'IMPRESSIONS',
        optimizationGoal: 'LINK_CLICKS',
        dailyBudget: 9000,
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )

    expect(result.success).toBe(true)
    expect((result as any).dryRun).toBe(true)
    expect((result as any).targetingTemplate).toBeNull()
    expect((result as any).targetingSource).toBe('custom')
    expect((result as any).targeting).toMatchObject({
      age_min: 25,
      age_max: 45,
      genders: [2],
      geo_locations: { countries: ['BR'] },
      flexible_spec: [{ interests: [{ id: '6003139266461', name: 'Cosmetics' }] }],
      targeting_automation: { advantage_audience: 0 },
    })
    expect((result as any).preview?.body?.targeting).toMatchObject({
      genders: [2],
      flexible_spec: [{ interests: [{ id: '6003139266461', name: 'Cosmetics' }] }],
      targeting_automation: { advantage_audience: 0 },
    })
    expect((result as any).preview?.notes?.some((n: string) => n.includes('custom'))).toBe(true)
    expect(graphFetch).not.toHaveBeenCalled()
  })

  it('create adset rejects both targetingTemplate and targeting', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })

    await expect(metaCreateAdset(
      { client, graphFetch: vi.fn() },
      {
        tenantId: 'tenant-1',
        campaignId: 'cmp_1',
        name: 'Both',
        targetingTemplate: 'BR_18_65',
        targeting: { geo_locations: { countries: ['BR'] }, age_min: 18, age_max: 40 },
        billingEvent: 'IMPRESSIONS',
        optimizationGoal: 'REACH',
        dailyBudget: 1000,
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )).rejects.toBeInstanceOf(Error)
  })

  it('create adset ACTIVE without confirmActive is rejected', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })

    await expect(metaCreateAdset(
      { client, graphFetch: vi.fn() },
      {
        tenantId: 'tenant-1',
        campaignId: 'cmp_1',
        name: 'Live adset',
        targetingTemplate: 'BR_18_34',
        billingEvent: 'IMPRESSIONS',
        optimizationGoal: 'REACH',
        status: 'ACTIVE',
        dailyBudget: 2000,
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: true,
      },
    )).rejects.toMatchObject({ code: 'CONFIRM_ACTIVE_REQUIRED' })
  })

  it('create adset rejects campaign ownership mismatch on execute', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async () => ({
      id: 'cmp_foreign',
      name: 'Outra conta',
      account_id: '999',
    }))

    await expect(metaCreateAdset(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        campaignId: 'cmp_foreign',
        name: 'Hijack',
        targetingTemplate: 'BR_18_65',
        billingEvent: 'IMPRESSIONS',
        optimizationGoal: 'REACH',
        dailyBudget: 1500,
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: false,
      },
    )).rejects.toMatchObject({ code: 'CAMPAIGN_TENANT_MISMATCH' })

    const postCalls = graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(postCalls).toHaveLength(0)
  })

  it('create adset execute posts to act_*/adsets and audits adset id', async () => {
    const audits: unknown[] = []
    setMetaWriteAuditSink(r => audits.push(r))

    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })

    const graphFetch = vi.fn(async (url: string, init?: any) => {
      if (init?.method === 'POST')
        return { id: 'adset_new_1' }
      if (String(url).includes('/cmp_owned')) {
        return { id: 'cmp_owned', name: 'Campanha', account_id: '555', objective: 'OUTCOME_TRAFFIC' }
      }
      if (String(url).includes('/act_555'))
        return { id: 'act_555', account_id: '555', currency: 'BRL', name: 'Conta' }
      return {}
    })

    const result = await metaCreateAdset(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        campaignId: 'cmp_owned',
        name: 'Adset Real',
        targetingTemplate: 'BR_35_65',
        billingEvent: 'LINK_CLICKS',
        optimizationGoal: 'LANDING_PAGE_VIEWS',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: false,
        dailyBudget: 12000,
      },
    )

    expect(result.success).toBe(true)
    expect((result as any).dryRun).toBe(false)
    expect((result as any).adsetId).toBe('adset_new_1')
    expect((result as any).currency).toBe('BRL')
    expect((result as any).targetingTemplate).toBe('BR_35_65')
    const postCalls = graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(postCalls).toHaveLength(1)
    expect(String(postCalls[0]![0])).toContain('/act_555/adsets')
    expect(postCalls[0]![1]?.body).toMatchObject({
      campaign_id: 'cmp_owned',
      targeting: {
        geo_locations: { countries: ['BR'] },
        age_min: 35,
        age_max: 65,
        targeting_automation: { advantage_audience: 0 },
      },
    })
    expect(audits.some((a: any) =>
      a.action === 'meta.gpt.adset.create'
      && a.dryRun === false
      && a.entityId === 'adset_new_1',
    )).toBe(true)
    expect(JSON.stringify(result)).not.toContain('tok')
  })

  it('create ad dryRun default skips Graph POST and returns copy+page preview', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_99',
      page_name: 'Page Teste',
    })
    const graphFetch = vi.fn()

    const result = await metaCreateAd(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        name: 'Ad Link',
        linkUrl: 'https://example.com/oferta',
        message: 'Compre agora com frete grátis',
        headline: 'Oferta BR',
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )

    expect(result.success).toBe(true)
    expect((result as any).dryRun).toBe(true)
    expect((result as any).adId).toBeNull()
    expect((result as any).creativeId).toBeNull()
    expect((result as any).status).toBe('PAUSED')
    expect((result as any).pageId).toBe('page_99')
    expect((result as any).linkUrl).toBe('https://example.com/oferta')
    expect((result as any).preview?.body?.creative?.object_story_spec).toMatchObject({
      page_id: 'page_99',
      link_data: {
        message: 'Compre agora com frete grátis',
        link: 'https://example.com/oferta',
        name: 'Oferta BR',
      },
    })
    expect((result as any).preview?.notes?.some((n: string) => n.includes('page_99'))).toBe(true)
    expect(graphFetch).not.toHaveBeenCalled()
  })

  it('create ad VIDEO dryRun previews video_data Graph payload', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_99',
    })
    const result = await metaCreateAd(
      { client, graphFetch: vi.fn() },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        name: 'Ad Vídeo',
        creativeType: 'VIDEO',
        linkUrl: 'https://example.com/v',
        message: 'Veja o vídeo',
        videoId: 'video_meta_1',
        imageHash: 'thumb_1',
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )
    expect((result as any).dryRun).toBe(true)
    expect((result as any).creativeType).toBe('VIDEO')
    expect((result as any).preview?.body?.creative?.object_story_spec).toMatchObject({
      page_id: 'page_99',
      video_data: {
        video_id: 'video_meta_1',
        message: 'Veja o vídeo',
        image_hash: 'thumb_1',
        call_to_action: { type: 'LEARN_MORE', value: { link: 'https://example.com/v' } },
      },
    })
    expect((result as any).preview?.body?.creative?.object_story_spec).not.toHaveProperty('link_data')
  })

  it('create ad CAROUSEL dryRun previews child_attachments', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_99',
    })
    const result = await metaCreateAd(
      { client, graphFetch: vi.fn() },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        name: 'Ad Carrossel',
        creativeType: 'CAROUSEL',
        linkUrl: 'https://example.com',
        message: 'Veja as opções',
        callToAction: 'SHOP_NOW',
        childAttachments: [
          { link: 'https://example.com/a', name: 'A', imageHash: 'ha' },
          { link: 'https://example.com/b', name: 'B', imageHash: 'hb' },
        ],
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )
    expect((result as any).creativeType).toBe('CAROUSEL')
    const linkData = (result as any).preview?.body?.creative?.object_story_spec?.link_data
    expect(linkData?.child_attachments).toHaveLength(2)
    expect(linkData?.multi_share_optimized).toBe(true)
    expect(linkData?.child_attachments[0]).toMatchObject({ image_hash: 'ha', name: 'A' })
  })

  it('create ad DYNAMIC_CREATIVE alias maps to LEGACY and requires assetFeed', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_99',
    })
    await expect(metaCreateAd(
      { client, graphFetch: vi.fn() },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_dyn',
        name: 'Ad Dinâmico',
        creativeType: 'DYNAMIC_CREATIVE',
        message: 'Fallback body',
        linkUrl: 'https://example.com/dyn',
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )).rejects.toThrow(/assetFeed|DYNAMIC_CREATIVE/)
  })

  it('create ad DYNAMIC_CREATIVE_LEGACY dryRun previews asset_feed_spec', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_99',
    })
    const graphFetch = vi.fn()
    const result = await metaCreateAd(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        name: 'Dyn Ad',
        creativeType: 'DYNAMIC_CREATIVE_LEGACY',
        message: 'Body from top',
        headline: 'Title from top',
        assetFeed: {
          images: [{ hash: 'h1' }, { hash: 'h2' }],
          linkUrls: [{ websiteUrl: 'https://example.com' }],
          callToActionTypes: ['LEARN_MORE'],
          adFormats: ['SINGLE_IMAGE'],
        },
        confirm: true,
        confirmTenantId: 'tenant-1',
        dryRun: true,
      },
    )
    expect((result as any).creativeType).toBe('DYNAMIC_CREATIVE_LEGACY')
    expect((result as any).dryRun).toBe(true)
    expect(graphFetch).not.toHaveBeenCalled()
    expect(JSON.stringify((result as any).preview)).toContain('asset_feed_spec')
  })

  it('create ad with creativeId XOR reuses creative on dryRun', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_99',
    })
    const graphFetch = vi.fn()
    const result = await metaCreateAd(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        name: 'Reuse Creative Ad',
        creativeId: 'cr_existing_1',
        confirm: true,
        confirmTenantId: 'tenant-1',
        dryRun: true,
      },
    )
    expect((result as any).creativeId).toBe('cr_existing_1')
    expect((result as any).reusedCreative).toBe(true)
    expect(graphFetch).not.toHaveBeenCalled()
  })

  it('meta_get_capabilities returns graph version matrix', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
      api_version: 'v20.0',
    })
    const { metaGetCapabilities } = await import('~/lib/meta-ads')
    const result = await metaGetCapabilities(
      { client, graphFetch: vi.fn() },
      { tenantId: 'tenant-1' },
    )
    expect((result as any).capabilities.graphVersion).toBe('v20.0')
    expect((result as any).capabilities.creativeTypes.FLEXIBLE_AD_FORMAT.supported).toBe(false)
    expect((result as any).capabilities.creativeTypes.FLEXIBLE_MEDIA_PAC_RELAXATION.supported).toBe(true)
    expect((result as any).capabilities.creativeTypes.DYNAMIC_CREATIVE_LEGACY.supported).toBe(true)
    expect((result as any).capabilities.catalog.listProductSets.supported).toBe(true)
  })

  it('meta_list_product_sets lists sets after catalog ownership check', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async (url: string) => {
      if (String(url).includes('/product_catalogs')) {
        return { data: [{ id: 'cat_1', name: 'Cat', product_count: 10, vertical: 'commerce' }] }
      }
      if (String(url).includes('/product_sets')) {
        return { data: [{ id: 'ps_1', name: 'All', product_count: 10, filter: null }] }
      }
      throw new Error(`unexpected url ${url}`)
    })
    const { metaListProductSets } = await import('~/lib/meta-ads')
    const result = await metaListProductSets(
      { client, graphFetch },
      { tenantId: 'tenant-1', catalogId: 'cat_1' },
    )
    expect((result as any).catalogId).toBe('cat_1')
    expect((result as any).productSets).toEqual([
      { id: 'ps_1', name: 'All', productCount: 10, filter: null },
    ])
  })

  it('create ad CAROUSEL WHATSAPP dryRun uses protocol links not website URLs', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_1',
    })
    const result = await metaCreateAd(
      { client, graphFetch: vi.fn() },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        name: 'Carrossel WA',
        creativeType: 'CAROUSEL',
        destinationType: 'WHATSAPP',
        message: 'Oi',
        childAttachments: [
          { imageHash: 'h1', name: 'Card 1' },
          { imageHash: 'h2', name: 'Card 2' },
        ],
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )
    expect(result.success).toBe(true)
    expect((result as any).dryRun).toBe(true)
    const linkData = (result as any).preview?.body?.creative?.object_story_spec?.link_data
    expect(linkData.link).toBe('https://api.whatsapp.com/send')
    expect(linkData.call_to_action.type).toBe('WHATSAPP_MESSAGE')
    expect(linkData.child_attachments).toHaveLength(2)
    expect(linkData.child_attachments[0].link).toBe('https://api.whatsapp.com/send')
    expect(linkData.child_attachments[0].call_to_action.type).toBe('WHATSAPP_MESSAGE')
  })

  it('create ad rejects CAROUSEL WHATSAPP with website card links', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_1',
    })
    await expect(metaCreateAd(
      { client, graphFetch: vi.fn() },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        name: 'Bad',
        creativeType: 'CAROUSEL',
        destinationType: 'WHATSAPP',
        message: 'Oi',
        childAttachments: [
          { link: 'https://example.com/a', imageHash: 'h1' },
          { link: 'https://example.com/b', imageHash: 'h2' },
        ],
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )).rejects.toThrow()
  })

  it('create ad rejects confirmTenantId mismatch without Graph', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_1',
    })
    const graphFetch = vi.fn()

    await expect(metaCreateAd(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        name: 'X',
        linkUrl: 'https://example.com',
        message: 'Hi',
        confirmTenantId: 'other',
        confirm: true,
      },
    )).rejects.toMatchObject({ code: 'CONFIRM_TENANT_MISMATCH' })
    expect(graphFetch).not.toHaveBeenCalled()
  })

  it('create ad fails clearly when page_id missing', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
    })

    await expect(metaCreateAd(
      { client, graphFetch: vi.fn() },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        name: 'Sem page',
        linkUrl: 'https://example.com',
        message: 'Copy',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: true,
      },
    )).rejects.toMatchObject({ code: 'META_PAGE_ID_REQUIRED' })
  })

  it('create ad fails clearly when page token missing', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
      page_id: 'page_1',
    })

    await expect(metaCreateAd(
      { client, graphFetch: vi.fn() },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        name: 'Sem page token',
        linkUrl: 'https://example.com',
        message: 'Copy',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: true,
      },
    )).rejects.toMatchObject({ code: 'META_PAGE_TOKEN_REQUIRED' })
  })

  it('create ad ACTIVE without confirmActive is rejected', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_1',
    })

    await expect(metaCreateAd(
      { client, graphFetch: vi.fn() },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        name: 'Live ad',
        linkUrl: 'https://example.com',
        message: 'Go',
        status: 'ACTIVE',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: true,
      },
    )).rejects.toMatchObject({ code: 'CONFIRM_ACTIVE_REQUIRED' })
  })

  it('create ad rejects adset ownership mismatch on execute', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_1',
    })
    const graphFetch = vi.fn(async () => ({
      id: 'adset_foreign',
      name: 'Outra conta',
      account_id: '999',
    }))

    await expect(metaCreateAd(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_foreign',
        name: 'Hijack',
        linkUrl: 'https://example.com',
        message: 'Nope',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: false,
      },
    )).rejects.toMatchObject({ code: 'ADSET_TENANT_MISMATCH' })

    const postCalls = graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(postCalls).toHaveLength(0)
  })

  it('create ad execute posts creative then ad and audits ad id', async () => {
    const audits: unknown[] = []
    setMetaWriteAuditSink(r => audits.push(r))

    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_99',
    })

    const graphFetch = vi.fn(async (url: string, init?: any) => {
      if (init?.method === 'POST') {
        if (String(url).includes('/adcreatives'))
          return { id: 'creative_new_1' }
        if (String(url).includes('/ads'))
          return { id: 'ad_new_1' }
      }
      if (String(url).includes('/adset_owned')) {
        return {
          id: 'adset_owned',
          name: 'Adset',
          account_id: '555',
          campaign_id: 'cmp_1',
        }
      }
      return {}
    })

    const result = await metaCreateAd(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_owned',
        name: 'Ad Real',
        linkUrl: 'https://example.com/lp',
        message: 'Texto principal',
        headline: 'Headline',
        imageHash: 'hash_abc',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: false,
      },
    )

    expect(result.success).toBe(true)
    expect((result as any).dryRun).toBe(false)
    expect((result as any).adId).toBe('ad_new_1')
    expect((result as any).creativeId).toBe('creative_new_1')
    expect((result as any).campaignId).toBe('cmp_1')
    const postCalls = graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(postCalls).toHaveLength(2)
    expect(String(postCalls[0]![0])).toContain('/act_555/adcreatives')
    expect(postCalls[0]![1]?.body).toMatchObject({
      object_story_spec: {
        page_id: 'page_99',
        link_data: {
          link: 'https://example.com/lp',
          message: 'Texto principal',
          image_hash: 'hash_abc',
        },
      },
    })
    expect(String(postCalls[1]![0])).toContain('/act_555/ads')
    expect(postCalls[1]![1]?.body).toMatchObject({
      adset_id: 'adset_owned',
      creative: { creative_id: 'creative_new_1' },
      status: 'PAUSED',
    })
    expect(audits.some((a: any) =>
      a.action === 'meta.gpt.ad.create'
      && a.dryRun === false
      && a.entityId === 'ad_new_1',
    )).toBe(true)
    expect(JSON.stringify(result)).not.toContain('tok')
  })

  it('create ad WEBSITE rejects fake wa.me linkUrl', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_1',
    })

    await expect(metaCreateAd(
      { client, graphFetch: vi.fn() },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        name: 'Fake WA',
        destinationType: 'WEBSITE',
        linkUrl: 'https://wa.me/5511999999999',
        message: 'Fale conosco',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: true,
      },
    )).rejects.toBeInstanceOf(Error)
  })

  it('create ad WEBSITE rejects api.whatsapp.com as linkUrl', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_1',
    })

    await expect(metaCreateAd(
      { client, graphFetch: vi.fn() },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        name: 'Fake API WA',
        linkUrl: 'https://api.whatsapp.com/send?phone=5511999999999',
        message: 'Oi',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: true,
      },
    )).rejects.toBeInstanceOf(Error)
  })

  it('create ad WHATSAPP dryRun omits site linkUrl and builds CTWA creative payload', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_99',
      page_name: 'Page WA',
    })
    const graphFetch = vi.fn()

    const result = await metaCreateAd(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_wa',
        name: 'Ad WhatsApp',
        destinationType: 'WHATSAPP',
        message: 'Fale no WhatsApp',
        headline: 'Atendimento',
        welcomeMessage: 'Olá! Posso ajudar?',
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )

    expect(result.success).toBe(true)
    expect((result as any).dryRun).toBe(true)
    expect((result as any).destinationType).toBe('WHATSAPP')
    expect((result as any).linkUrl).toBeNull()
    expect((result as any).callToAction).toBe('WHATSAPP_MESSAGE')
    const linkData = (result as any).preview?.body?.creative?.object_story_spec?.link_data
    expect(linkData).toMatchObject({
      message: 'Fale no WhatsApp',
      name: 'Atendimento',
      link: 'https://api.whatsapp.com/send',
      call_to_action: {
        type: 'WHATSAPP_MESSAGE',
        value: { app_destination: 'WHATSAPP' },
      },
    })
    expect(linkData.call_to_action.value.link).toBeUndefined()
    expect(linkData.page_welcome_message).toBeTruthy()
    expect((result as any).preview?.notes?.some((n: string) => n.includes('destinationType: WHATSAPP'))).toBe(true)
    expect(graphFetch).not.toHaveBeenCalled()
  })

  it('create ad dryRun previews tracking_specs for pixel + offline dataset without Graph', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_99',
    })
    const graphFetch = vi.fn()
    const result = await metaCreateAd(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        name: 'Ad com tracking',
        linkUrl: 'https://example.com/oferta',
        message: 'Oferta',
        pixelId: 'px_1',
        offlineDatasetId: 'ds_1',
        conversionDomain: 'example.com',
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )
    expect((result as any).dryRun).toBe(true)
    expect((result as any).preview?.body?.ad?.tracking_specs).toEqual([
      { 'action.type': 'offsite_conversion', fb_pixel: 'px_1' },
      { 'action.type': 'offline_conversion', dataset: 'ds_1' },
    ])
    expect((result as any).preview?.body?.ad?.conversion_domain).toBe('example.com')
    expect((result as any).preview?.notes?.some((n: string) => n.includes('fb_pixel=px_1'))).toBe(true)
    expect((result as any).preview?.notes?.some((n: string) => n.includes('dataset=ds_1'))).toBe(true)
    expect(graphFetch).not.toHaveBeenCalled()
  })

  it('create ad execute sends tracking_specs after ownership checks', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_99',
    })
    const graphFetch = vi.fn(async (url: string, init?: any) => {
      if (String(url).includes('/adspixels'))
        return { data: [{ id: 'px_1', name: 'Pixel' }] }
      if (String(url).includes('/offline_conversion_data_sets'))
        return { data: [{ id: 'ds_1', name: 'Offline' }] }
      if (init?.method === 'POST') {
        if (String(url).includes('/adcreatives'))
          return { id: 'creative_new_1' }
        if (String(url).includes('/ads'))
          return { id: 'ad_new_1' }
      }
      if (String(url).includes('/adset_owned')) {
        return { id: 'adset_owned', name: 'Adset', account_id: '555', campaign_id: 'cmp_1' }
      }
      return {}
    })

    const result = await metaCreateAd(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_owned',
        name: 'Ad Real Tracking',
        linkUrl: 'https://example.com/lp',
        message: 'Texto',
        imageHash: 'hash_abc',
        pixelId: 'px_1',
        offlineDatasetId: 'ds_1',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: false,
      },
    )
    expect((result as any).adId).toBe('ad_new_1')
    const adsCall = graphFetch.mock.calls.find(([url, init]) => init?.method === 'POST' && String(url).includes('/act_555/ads'))
    expect(adsCall?.[1]?.body).toMatchObject({
      tracking_specs: [
        { 'action.type': 'offsite_conversion', fb_pixel: 'px_1' },
        { 'action.type': 'offline_conversion', dataset: 'ds_1' },
      ],
    })
    expect(JSON.stringify(result)).not.toContain('tok')
  })

  it('create ad execute rejects pixel from another account', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_99',
    })
    const graphFetch = vi.fn(async (url: string, init?: any) => {
      if (String(url).includes('/adspixels'))
        return { data: [{ id: 'px_owned', name: 'Pixel' }] }
      if (String(url).includes('/adset_owned'))
        return { id: 'adset_owned', account_id: '555' }
      return {}
    })
    await expect(metaCreateAd(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_owned',
        name: 'Hijack pixel',
        linkUrl: 'https://example.com',
        message: 'Nope',
        pixelId: 'px_foreign',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: false,
      },
    )).rejects.toMatchObject({ code: 'PIXEL_TENANT_MISMATCH' })
  })

  it('update ad tracking dryRun merges dataset onto existing specs', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async (url: string) => {
      if (String(url).includes('/adspixels'))
        return { data: [{ id: 'px_1' }] }
      if (String(url).includes('/offline_conversion_data_sets'))
        return { data: [{ id: 'ds_1' }] }
      if (String(url).includes('/ad_1')) {
        return {
          id: 'ad_1',
          name: 'Ad',
          account_id: '555',
          tracking_specs: [{ 'action.type': ['offsite_conversion'], fb_pixel: ['px_1'] }],
        }
      }
      return {}
    })
    const result = await metaUpdateAdTracking(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adId: 'ad_1',
        offlineDatasetId: 'ds_1',
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )
    expect((result as any).dryRun).toBe(true)
    expect((result as any).preview?.body?.tracking_specs).toEqual([
      { 'action.type': ['offsite_conversion'], fb_pixel: ['px_1'] },
      { 'action.type': 'offline_conversion', dataset: 'ds_1' },
    ])
    const posts = graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(posts).toHaveLength(0)
  })

  it('create ad WHATSAPP rejects fabricated linkUrl input', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_1',
    })

    await expect(metaCreateAd(
      { client, graphFetch: vi.fn() },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        name: 'WA bad',
        destinationType: 'WHATSAPP',
        linkUrl: 'https://wa.me/5511999999999',
        message: 'Oi',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: true,
      },
    )).rejects.toBeInstanceOf(Error)
  })

  it('create ad without linkUrl fails on WEBSITE default', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_1',
    })

    await expect(metaCreateAd(
      { client, graphFetch: vi.fn() },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        name: 'Sem link',
        message: 'Copy',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: true,
      },
    )).rejects.toBeInstanceOf(Error)
  })

  it('create adset WHATSAPP dryRun includes destination_type and promoted_object page_id', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
      page_id: 'page_wa_1',
    })
    const graphFetch = vi.fn()

    const result = await metaCreateAdset(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        campaignId: 'cmp_eng',
        name: 'Adset WA',
        targetingTemplate: 'BR_25_54',
        billingEvent: 'IMPRESSIONS',
        optimizationGoal: 'CONVERSATIONS',
        destinationType: 'WHATSAPP',
        campaignObjective: 'OUTCOME_ENGAGEMENT',
        dailyBudget: 5000,
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )

    expect(result.success).toBe(true)
    expect((result as any).dryRun).toBe(true)
    expect((result as any).destinationType).toBe('WHATSAPP')
    expect((result as any).preview?.body).toMatchObject({
      destination_type: 'WHATSAPP',
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'CONVERSATIONS',
      promoted_object: { page_id: 'page_wa_1' },
    })
    expect(graphFetch).not.toHaveBeenCalled()
  })

  it('create adset WHATSAPP rejects incompatible campaignObjective AWARENESS', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
      page_id: 'page_1',
    })

    await expect(metaCreateAdset(
      { client, graphFetch: vi.fn() },
      {
        tenantId: 'tenant-1',
        campaignId: 'cmp_1',
        name: 'Bad WA',
        targetingTemplate: 'BR_18_65',
        billingEvent: 'IMPRESSIONS',
        optimizationGoal: 'CONVERSATIONS',
        destinationType: 'WHATSAPP',
        campaignObjective: 'OUTCOME_AWARENESS',
        dailyBudget: 2000,
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: true,
      },
    )).rejects.toBeInstanceOf(Error)
  })

  it('create adset WHATSAPP rejects LINK_CLICKS billingEvent', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
      page_id: 'page_1',
    })

    await expect(metaCreateAdset(
      { client, graphFetch: vi.fn() },
      {
        tenantId: 'tenant-1',
        campaignId: 'cmp_1',
        name: 'Bad billing',
        targetingTemplate: 'BR_18_65',
        billingEvent: 'LINK_CLICKS',
        optimizationGoal: 'CONVERSATIONS',
        destinationType: 'WHATSAPP',
        dailyBudget: 2000,
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: true,
      },
    )).rejects.toBeInstanceOf(Error)
  })

  it('update adset budget dryRun default GETs before and skips POST', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async () => ({
      id: 'adset_1',
      name: 'Adset',
      account_id: '555',
      daily_budget: '10000',
      lifetime_budget: null,
    }))

    const result = await metaUpdateAdsetBudget(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        dailyBudget: 12000,
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )

    expect((result as any).dryRun).toBe(true)
    expect((result as any).before.dailyBudget).toBe(10000)
    expect((result as any).after.dailyBudget).toBe(12000)
    expect((result as any).preview?.body).toEqual({ daily_budget: 12000 })
    const postCalls = graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(postCalls).toHaveLength(0)
    expect(graphFetch).toHaveBeenCalled()
  })

  it('update adset budget requires confirmBudgetIncrease on large bump', async () => {
    vi.stubEnv('META_GPT_BUDGET_INCREASE_MAX_PERCENT', '50')
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async () => ({
      id: 'adset_1',
      account_id: '555',
      daily_budget: '10000',
    }))

    await expect(metaUpdateAdsetBudget(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        dailyBudget: 20000,
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: true,
      },
    )).rejects.toMatchObject({ code: 'CONFIRM_BUDGET_INCREASE_REQUIRED' })
  })

  it('update adset budget execute posts and audits before/after', async () => {
    const audits: unknown[] = []
    setMetaWriteAuditSink(r => audits.push(r))
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async (_url: string, init?: any) => {
      if (init?.method === 'POST')
        return { success: true }
      return {
        id: 'adset_1',
        name: 'Adset',
        account_id: '555',
        daily_budget: '10000',
      }
    })

    const result = await metaUpdateAdsetBudget(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        dailyBudget: 8000,
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: false,
      },
    )

    expect((result as any).dryRun).toBe(false)
    expect((result as any).before.dailyBudget).toBe(10000)
    expect((result as any).after.dailyBudget).toBe(8000)
    const postCalls = graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(postCalls).toHaveLength(1)
    expect(postCalls[0]![1]?.body).toEqual({ daily_budget: 8000 })
    expect(audits.some((a: any) =>
      a.action === 'meta.gpt.adset.budget' && a.dryRun === false,
    )).toBe(true)
  })

  it('update adset targeting rejects foreign adset', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async () => ({
      id: 'adset_x',
      account_id: '999',
      targeting: { geo_locations: { countries: ['US'] } },
    }))

    await expect(metaUpdateAdsetTargeting(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_x',
        targetingTemplate: 'BR_18_34',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: true,
      },
    )).rejects.toMatchObject({ code: 'ADSET_TENANT_MISMATCH' })
  })

  it('update adset targeting dryRun shows template and before snapshot', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async () => ({
      id: 'adset_1',
      name: 'Adset',
      account_id: '555',
      targeting: { geo_locations: { countries: ['BR'] }, age_min: 18, age_max: 65 },
    }))

    const result = await metaUpdateAdsetTargeting(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        targetingTemplate: 'BR_25_54',
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )

    expect((result as any).dryRun).toBe(true)
    expect((result as any).targetingTemplate).toBe('BR_25_54')
    expect((result as any).after.targeting).toEqual({
      geo_locations: { countries: ['BR'] },
      age_min: 25,
      age_max: 54,
      targeting_automation: { advantage_audience: 0 },
    })
    expect((result as any).advantageAudience).toBe(0)
    expect(graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  })

  it('update adset targeting accepts custom targeting dryRun', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async () => ({
      id: 'adset_1',
      name: 'Adset',
      account_id: '555',
      targeting: { geo_locations: { countries: ['BR'] }, age_min: 18, age_max: 65 },
    }))

    const result = await metaUpdateAdsetTargeting(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        targeting: {
          age_min: 30,
          age_max: 50,
          genders: [1, 2],
          geo_locations: { countries: ['BR'] },
          custom_audiences: [{ id: 'aud_123' }],
        },
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )

    expect((result as any).dryRun).toBe(true)
    expect((result as any).targetingTemplate).toBeNull()
    expect((result as any).targetingSource).toBe('custom')
    expect((result as any).after.targeting).toMatchObject({
      age_min: 30,
      age_max: 50,
      custom_audiences: [{ id: 'aud_123' }],
      targeting_automation: { advantage_audience: 0 },
    })
    expect(graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  })

  it('update adset targeting advantageAudience=1 dryRun', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async () => ({
      id: 'adset_1',
      name: 'Adset',
      account_id: '555',
      targeting: { geo_locations: { countries: ['BR'] }, age_min: 18, age_max: 65 },
    }))

    const result = await metaUpdateAdsetTargeting(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        targetingTemplate: 'BR_18_65',
        advantageAudience: 1,
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )

    expect((result as any).advantageAudience).toBe(1)
    expect((result as any).after.targeting.targeting_automation).toEqual({ advantage_audience: 1 })
    expect((result as any).preview?.body?.targeting?.targeting_automation).toEqual({
      advantage_audience: 1,
    })
  })

  it('update ad creative copy dryRun merges fields and skips POST', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_99',
    })
    const graphFetch = vi.fn(async () => ({
      id: 'ad_1',
      name: 'Ad',
      account_id: '555',
      creative: {
        id: 'cr_old',
        name: 'Old',
        object_story_spec: {
          page_id: 'page_99',
          link_data: {
            message: 'Copy antiga',
            link: 'https://example.com/old',
            name: 'Headline antiga',
            call_to_action: { type: 'LEARN_MORE', value: { link: 'https://example.com/old' } },
            image_hash: 'hash_keep',
          },
        },
      },
    }))

    const result = await metaUpdateAdCreativeCopy(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adId: 'ad_1',
        message: 'Copy nova',
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )

    expect((result as any).dryRun).toBe(true)
    expect((result as any).before.message).toBe('Copy antiga')
    expect((result as any).after.message).toBe('Copy nova')
    expect((result as any).after.linkUrl).toBe('https://example.com/old')
    expect((result as any).preview?.body?.creative?.object_story_spec?.link_data).toMatchObject({
      message: 'Copy nova',
      link: 'https://example.com/old',
      image_hash: 'hash_keep',
    })
    expect(graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  })

  it('update ad creative copy execute creates creative then swaps ad', async () => {
    const audits: unknown[] = []
    setMetaWriteAuditSink(r => audits.push(r))
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_99',
    })
    const graphFetch = vi.fn(async (url: string, init?: any) => {
      if (init?.method === 'POST') {
        if (String(url).includes('/adcreatives'))
          return { id: 'cr_new' }
        return { success: true }
      }
      return {
        id: 'ad_1',
        name: 'Ad',
        account_id: '555',
        creative: {
          id: 'cr_old',
          object_story_spec: {
            page_id: 'page_99',
            link_data: {
              message: 'A',
              link: 'https://example.com',
              call_to_action: { type: 'LEARN_MORE', value: { link: 'https://example.com' } },
            },
          },
        },
      }
    })

    const result = await metaUpdateAdCreativeCopy(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adId: 'ad_1',
        headline: 'Nova headline',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: false,
      },
    )

    expect((result as any).creativeId).toBe('cr_new')
    expect((result as any).previousCreativeId).toBe('cr_old')
    const posts = graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(posts).toHaveLength(2)
    expect(String(posts[0]![0])).toContain('/adcreatives')
    expect(posts[1]![1]?.body).toEqual({ creative: { creative_id: 'cr_new' } })
    expect(audits.some((a: any) => a.action === 'meta.gpt.ad.creative_copy')).toBe(true)
  })

  it('update ad media execute swaps imageHash via new creative', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_99',
    })
    const graphFetch = vi.fn(async (url: string, init?: any) => {
      if (init?.method === 'POST') {
        if (String(url).includes('/adcreatives'))
          return { id: 'cr_media' }
        return { success: true }
      }
      return {
        id: 'ad_1',
        account_id: '555',
        creative: {
          id: 'cr_old',
          object_story_spec: {
            page_id: 'page_99',
            link_data: {
              message: 'Keep',
              link: 'https://example.com',
              call_to_action: { type: 'SHOP_NOW', value: { link: 'https://example.com' } },
              image_hash: 'old_hash',
            },
          },
        },
      }
    })

    const result = await metaUpdateAdMedia(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adId: 'ad_1',
        imageHash: 'new_hash',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: false,
      },
    )

    expect((result as any).creativeId).toBe('cr_media')
    expect((result as any).after.imageHash).toBe('new_hash')
    const creativePost = graphFetch.mock.calls.find(
      ([url, init]) => init?.method === 'POST' && String(url).includes('/adcreatives'),
    )
    expect(creativePost![1]?.body?.object_story_spec?.link_data).toMatchObject({
      message: 'Keep',
      image_hash: 'new_hash',
    })
  })

  it('bulk delete preview GETs ownership and never POSTs', async () => {
    const audits: unknown[] = []
    setMetaWriteAuditSink(r => audits.push(r))
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async (url: string) => {
      if (String(url).includes('/ad_1')) {
        return {
          id: 'ad_1',
          name: 'Ad teste',
          status: 'PAUSED',
          effective_status: 'PAUSED',
          account_id: '555',
          daily_budget: null,
        }
      }
      return {
        id: 'ad_2',
        name: 'Ad 2',
        status: 'ACTIVE',
        account_id: '555',
      }
    })

    const result = await metaPreviewBulkDelete(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        level: 'ad',
        ids: ['ad_1', 'ad_2', 'ad_1'],
      },
    )

    expect((result as any).deletableIds).toEqual(['ad_1', 'ad_2'])
    expect((result as any).previewToken).toMatch(/^\d+\.[a-f0-9]{64}$/)
    expect((result as any).items).toHaveLength(2)
    expect((result as any).items[0].name).toBe('Ad teste')
    const postCalls = graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(postCalls).toHaveLength(0)
    expect(audits.some((a: any) => a.action === 'meta.gpt.bulk.delete.preview' && a.dryRun === true)).toBe(true)
  })

  it('bulk delete preview enforces META_GPT_BULK_MAX', async () => {
    vi.stubEnv('META_GPT_BULK_MAX', '2')
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async () => ({ id: 'x', account_id: '555' }))

    await expect(metaPreviewBulkDelete(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        level: 'campaign',
        ids: ['a', 'b', 'c'],
      },
    )).rejects.toMatchObject({ code: 'BULK_LIMIT_EXCEEDED' })
    expect(graphFetch).not.toHaveBeenCalled()
  })

  it('bulk delete preview rejects foreign ad account IDs', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async () => ({
      id: 'cmp_other',
      name: 'Outra',
      account_id: '999',
      status: 'PAUSED',
    }))

    await expect(metaPreviewBulkDelete(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        level: 'campaign',
        ids: ['cmp_other'],
      },
    )).rejects.toMatchObject({ code: 'BULK_DELETE_NONE_OWNED' })
  })

  it('bulk delete execute dryRun default skips Graph POST', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async () => ({
      id: 'ad_1',
      name: 'Ad',
      account_id: '555',
      status: 'PAUSED',
    }))

    const preview = await metaPreviewBulkDelete(
      { client, graphFetch },
      { tenantId: 'tenant-1', level: 'ad', ids: ['ad_1'] },
    )

    graphFetch.mockClear()
    graphFetch.mockImplementation(async () => ({
      id: 'ad_1',
      name: 'Ad',
      account_id: '555',
      status: 'PAUSED',
    }))

    const result = await metaExecuteBulkDelete(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        level: 'ad',
        ids: ['ad_1'],
        previewToken: (preview as any).previewToken,
        confirmTenantId: 'tenant-1',
        confirm: true,
        confirmDelete: true,
      },
    )

    expect((result as any).dryRun).toBe(true)
    const postCalls = graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(postCalls).toHaveLength(0)
  })

  it('bulk delete execute requires confirms and previewToken', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async () => ({ id: 'ad_1', account_id: '555' }))

    await expect(metaExecuteBulkDelete(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        level: 'ad',
        ids: ['ad_1'],
        previewToken: 'bad',
        confirmTenantId: 'tenant-1',
        confirm: true,
        confirmDelete: true,
        dryRun: false,
      },
    )).rejects.toMatchObject({ code: 'PREVIEW_TOKEN_INVALID' })

    await expect(metaExecuteBulkDelete(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        level: 'ad',
        ids: ['ad_1'],
        previewToken: '1.abcdef',
        confirmTenantId: 'other',
        confirm: true,
        confirmDelete: true,
        dryRun: false,
      },
    )).rejects.toMatchObject({ code: 'CONFIRM_TENANT_MISMATCH' })

    await expect(metaExecuteBulkDelete(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        level: 'ad',
        ids: ['ad_1'],
        previewToken: '1.abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: false,
      },
    )).rejects.toBeTruthy()
  })

  it('bulk delete execute posts DELETED and audits', async () => {
    const audits: unknown[] = []
    setMetaWriteAuditSink(r => audits.push(r))
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async (_url: string, init?: any) => {
      if (init?.method === 'POST')
        return { success: true }
      return {
        id: 'ad_1',
        name: 'Ad',
        account_id: '555',
        status: 'PAUSED',
      }
    })

    const preview = await metaPreviewBulkDelete(
      { client, graphFetch },
      { tenantId: 'tenant-1', level: 'ad', ids: ['ad_1'] },
    )

    const result = await metaExecuteBulkDelete(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        level: 'ad',
        ids: (preview as any).deletableIds,
        previewToken: (preview as any).previewToken,
        confirmTenantId: 'tenant-1',
        confirm: true,
        confirmDelete: true,
        dryRun: false,
      },
    )

    expect((result as any).dryRun).toBe(false)
    expect((result as any).succeeded).toHaveLength(1)
    expect((result as any).succeeded[0].status).toBe('DELETED')
    const postCalls = graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(postCalls.length).toBeGreaterThanOrEqual(1)
    expect(postCalls[0]![1]?.body).toEqual({ status: 'DELETED' })
    expect(audits.some((a: any) => a.action === 'meta.gpt.bulk.delete' && a.dryRun === false)).toBe(true)
  })

  it('lists experiments via impacting_ad_studies and business ad_studies', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
      business_id: '9988776655',
      api_version: 'v25.0',
    })
    const graphFetch = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/act_555/impacting_ad_studies')) {
        return {
          data: [{
            id: 'study_1',
            name: 'A/B criativo',
            type: 'SPLIT_TEST_V2',
            cells: { data: [{ adaccounts: { data: [{ id: '555' }] } }] },
          }],
        }
      }
      if (u.includes('/9988776655/ad_studies')) {
        return {
          data: [
            {
              id: 'study_1',
              name: 'A/B criativo',
              type: 'SPLIT_TEST_V2',
            },
            {
              id: 'study_other_account',
              name: 'Outra conta',
              type: 'SPLIT_TEST_V2',
              cells: { data: [{ adaccounts: { data: [{ id: '999' }] } }] },
            },
            {
              id: 'study_2',
              name: 'Mesma conta',
              type: 'SPLIT_TEST_V2',
              cells: { data: [{ adaccounts: { data: [{ id: 'act_555' }] } }] },
            },
          ],
        }
      }
      return { data: [] }
    })
    const result = await metaListExperiments(
      { client, graphFetch },
      { tenantId: 'tenant-1' },
    )
    expect((result as any).studies.map((s: any) => s.id).sort()).toEqual(['study_1', 'study_2'])
    expect((result as any).businessId).toBe('9988776655')
    expect((result as any).sources.impactingAdStudies).toBe(true)
    expect((result as any).sources.businessAdStudies).toBe(true)
    const urls = graphFetch.mock.calls.map(([url]) => String(url))
    expect(urls.some(u => u.includes('/v25.0/act_555/impacting_ad_studies'))).toBe(true)
    expect(urls.some(u => u.includes('/v26.0/9988776655/ad_studies'))).toBe(true)
    expect(urls.some(u => u.includes('/v25.0/9988776655/ad_studies'))).toBe(false)
  })

  it('eligibility fails when the ad is already in an active study', async () => {
    const now = Math.floor(Date.now() / 1000)
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
      api_version: 'v25.0',
    })
    const graphFetch = vi.fn(async (url: string) => {
      if (String(url).includes('/ad_1') && !String(url).includes('ad_studies') && !String(url).includes('copies')) {
        return {
          id: 'ad_1',
          name: 'Base',
          account_id: '555',
          adset_id: 'as_1',
          campaign_id: 'c_1',
          creative: { id: 'cr_1', object_story_spec: { page_id: 'p', link_data: { message: 'm', link: 'https://ex.com' } } },
        }
      }
      if (String(url).includes('impacting_ad_studies')) {
        return {
          data: [{
            id: 'study_live',
            name: 'Já rodando',
            type: 'SPLIT_TEST_V2',
            start_time: now - 100,
            end_time: now + 86400,
            cells: { data: [{ id: 'cell_a', ads: { data: [{ id: 'ad_1' }] } }] },
          }],
        }
      }
      if (String(url).includes('/ad_studies'))
        return { data: [] }
      return { data: [] }
    })

    const result = await metaCheckExperimentEligibility(
      { client, graphFetch },
      { tenantId: 'tenant-1', adId: 'ad_1' },
    )
    expect((result as any).eligible).toBe(false)
    expect((result as any).conflicts[0].studyId).toBe('study_live')
  })

  it('create experiment from baseAdId dryRun previews USER then BUSINESS Ad Studies', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
      business_id: '9988776655',
      api_version: 'v25.0',
    })
    const graphFetch = vi.fn(async (url: string, init?: any) => {
      if (init?.method === 'POST')
        throw new Error('should not POST in dryRun')
      if (/\/v[\d.]+\/me$/.test(String(url).split('?')[0]))
        return { id: '111222333', name: 'Ana' }
      if (String(url).includes('/ad_base')) {
        return {
          id: 'ad_base',
          name: 'Base',
          account_id: '555',
          adset_id: 'as_1',
          campaign_id: 'c_1',
          creative: { id: 'cr_1', object_story_spec: { page_id: 'p', link_data: { message: 'm', link: 'https://ex.com' } } },
        }
      }
      return { data: [] }
    })

    const result = await metaCreateExperiment(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: true,
        name: 'Teste copy',
        type: 'SPLIT_TEST_V2',
        baseAdId: 'ad_base',
        variations: [
          { name: 'V2', message: 'copy B' },
        ],
        startTime: 1800000000,
        endTime: 1800600000,
        creativeTestDailyBudget: 15000,
      },
    )
    expect((result as any).dryRun).toBe(true)
    expect((result as any).cells).toHaveLength(2)
    expect((result as any).plannedCopies).toHaveLength(1)
    expect((result as any).preview.ownerOrder).toEqual(['USER', 'BUSINESS'])
    expect((result as any).preview.plannedEndpoints).toEqual([
      'POST v26.0 /111222333/ad_studies',
      'POST v26.0 /9988776655/ad_studies',
    ])
    expect(String((result as any).preview.path)).not.toContain('/me/ad_studies')
    expect((result as any).preview.body.type).toBe('SPLIT_TEST_V2')
    expect(graphFetch.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true)
  })

  it('create experiment copies ads then POSTs USER /ad_studies with SPLIT_TEST_V2', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
      business_id: '9988776655',
      api_version: 'v25.0',
    })
    const graphFetch = vi.fn(async (url: string, init?: any) => {
      const u = String(url)
      if (/\/v[\d.]+\/me$/.test(u.split('?')[0]))
        return { id: '111222333' }
      if (init?.method === 'POST' && u.includes('/ad_base/copies'))
        return { copied_ad_id: 'ad_copy_1' }
      if (init?.method === 'POST' && u.includes('/111222333/ad_studies'))
        return { id: 'study_new' }
      if (init?.method === 'POST' && u.includes('/9988776655/ad_studies'))
        throw new Error('BUSINESS should not run when USER succeeds')
      if (init?.method === 'POST' && u.includes('/me/ad_studies'))
        throw new Error('POST /me/ad_studies is unsupported')
      if (u.includes('/ad_copy_1')) {
        return {
          id: 'ad_copy_1',
          account_id: '555',
          adset_id: 'as_1',
          campaign_id: 'c_1',
          creative: { object_story_spec: { link_data: { message: 'copy B', link: 'https://ex.com' } } },
        }
      }
      if (u.includes('/ad_base')) {
        return {
          id: 'ad_base',
          name: 'Base',
          account_id: '555',
          adset_id: 'as_1',
          campaign_id: 'c_1',
          creative: { object_story_spec: { page_id: 'p', link_data: { message: 'm', link: 'https://ex.com' } } },
        }
      }
      return { data: [] }
    })

    const result = await metaCreateExperiment(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: false,
        name: 'Teste copy',
        type: 'SPLIT_TEST_V2',
        baseAdId: 'ad_base',
        variations: [{ name: 'V2', message: 'copy B' }],
        startTime: 1800000000,
        endTime: 1800600000,
        creativeTestDailyBudget: 15000,
      },
    )
    expect((result as any).studyId).toBe('study_new')
    expect((result as any).studyOwner).toBe('USER')
    expect((result as any).copiedAds[0].adId).toBe('ad_copy_1')
    const posts = graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(posts.some(([url]) => String(url).includes('/v25.0/ad_base/copies'))).toBe(true)
    expect(posts.some(([url]) => String(url).includes('/me/ad_studies'))).toBe(false)
    expect(posts.some(([url]) => String(url).includes('/v26.0/111222333/ad_studies'))).toBe(true)
    expect(posts.some(([url]) => String(url).includes('/9988776655/ad_studies'))).toBe(false)
    const studyPost = posts.find(([url]) => String(url).includes('/111222333/ad_studies'))
    expect(studyPost?.[1]?.body?.type).toBe('SPLIT_TEST_V2')
  })

  it('create experiment resolves business_id from GET act_{id}?fields=business when config lacks it', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
      api_version: 'v25.0',
    })
    const graphFetch = vi.fn(async (url: string, init?: any) => {
      const u = String(url)
      const path = u.split('?')[0]
      if (/\/v[\d.]+\/me$/.test(path))
        return { id: '111222333' }
      if (/\/act_555$/.test(path))
        return { id: 'act_555', business: { id: '9988776655', name: 'Cliente BM' } }
      if (init?.method === 'POST' && u.includes('/ad_base/copies'))
        return { copied_ad_id: 'ad_copy_1' }
      if (init?.method === 'POST' && u.includes('/111222333/ad_studies'))
        throw new MetaAdsToolError('META_GRAPH_ERROR', 'Unsupported request - method type: post', 400, { type: 'GraphMethodException', code: 100 })
      if (init?.method === 'POST' && u.includes('/9988776655/ad_studies'))
        return { id: 'study_biz' }
      if (init?.method === 'POST' && u.includes('/me/ad_studies'))
        throw new Error('POST /me/ad_studies is unsupported')
      if (u.includes('/ad_copy_1')) {
        return {
          id: 'ad_copy_1',
          account_id: '555',
          adset_id: 'as_1',
          campaign_id: 'c_1',
          creative: { object_story_spec: { link_data: { message: 'copy B', link: 'https://ex.com' } } },
        }
      }
      if (u.includes('/ad_base')) {
        return {
          id: 'ad_base',
          name: 'Base',
          account_id: '555',
          adset_id: 'as_1',
          campaign_id: 'c_1',
          creative: { object_story_spec: { page_id: 'p', link_data: { message: 'm', link: 'https://ex.com' } } },
        }
      }
      return { data: [] }
    })

    const result = await metaCreateExperiment(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: false,
        name: 'Teste BM',
        type: 'SPLIT_TEST_V2',
        baseAdId: 'ad_base',
        variations: [{ name: 'V2', message: 'copy B' }],
        startTime: 1800000000,
        endTime: 1800600000,
        creativeTestDailyBudget: 15000,
      },
    )
    expect((result as any).studyId).toBe('study_biz')
    const accountLookups = graphFetch.mock.calls.filter(([url]) => /\/act_555$/.test(String(url).split('?')[0]))
    expect(accountLookups.some(([, init]) => String((init as any)?.query?.fields || '').includes('business'))).toBe(true)
    const posts = graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(posts.some(([url]) => String(url).includes('/me/ad_studies'))).toBe(false)
    expect(posts.some(([url]) => String(url).includes('/111222333/ad_studies'))).toBe(true)
    expect(posts.some(([url]) => String(url).includes('/9988776655/ad_studies'))).toBe(true)
  })

  it('create experiment errors clearly when studyOwner=BUSINESS and business_id cannot be resolved (no copies)', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
      api_version: 'v25.0',
    })
    const graphFetch = vi.fn(async (url: string, init?: any) => {
      if (init?.method === 'POST' && String(url).includes('/ad_base/copies'))
        return { copied_ad_id: 'ad_copy_1' }
      if (/\/v[\d.]+\/me$/.test(String(url).split('?')[0]))
        return { id: '111222333' }
      if (String(url).includes('/ad_copy_1') || String(url).includes('/ad_base')) {
        return {
          id: String(url).includes('/ad_copy_1') ? 'ad_copy_1' : 'ad_base',
          account_id: '555',
          adset_id: 'as_1',
          campaign_id: 'c_1',
          creative: { object_story_spec: { page_id: 'p', link_data: { message: 'm', link: 'https://ex.com' } } },
        }
      }
      return { data: [] }
    })

    await expect(metaCreateExperiment(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: false,
        studyOwner: 'BUSINESS',
        name: 'Sem parent',
        type: 'SPLIT_TEST_V2',
        baseAdId: 'ad_base',
        variations: [{ name: 'V2' }],
        startTime: 1800000000,
        endTime: 1800600000,
        creativeTestDailyBudget: 15000,
      },
    )).rejects.toMatchObject({ code: 'EXPERIMENT_PARENT_REQUIRED' })
    const posts = graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(posts.some(([url]) => String(url).includes('/ad_studies'))).toBe(false)
    expect(posts.some(([url]) => String(url).includes('/copies'))).toBe(false)
  })

  it('rolls back copied ads (not baseAdId) when POST study fails', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
      business_id: '9988776655',
      api_version: 'v25.0',
    })
    const graphFetch = vi.fn(async (url: string, init?: any) => {
      const u = String(url)
      if (/\/v[\d.]+\/me$/.test(u.split('?')[0]))
        return { id: '111222333' }
      if (init?.method === 'POST' && u.includes('/ad_base/copies'))
        return { copied_ad_id: 'ad_copy_1' }
      if (init?.method === 'POST' && u.includes('/ad_studies')) {
        throw new MetaAdsToolError('META_GRAPH_ERROR', 'Unsupported request - method type: post', 400, { type: 'GraphMethodException', code: 100 })
      }
      if (init?.method === 'POST' && u.includes('/ad_copy_1'))
        return { success: true }
      if (u.includes('/ad_copy_1')) {
        return {
          id: 'ad_copy_1',
          account_id: '555',
          adset_id: 'as_1',
          campaign_id: 'c_1',
          creative: { object_story_spec: { link_data: { message: 'copy B', link: 'https://ex.com' } } },
        }
      }
      if (u.includes('/ad_base')) {
        return {
          id: 'ad_base',
          name: 'Base',
          account_id: '555',
          adset_id: 'as_1',
          campaign_id: 'c_1',
          creative: { object_story_spec: { page_id: 'p', link_data: { message: 'm', link: 'https://ex.com' } } },
        }
      }
      return { data: [] }
    })

    await expect(metaCreateExperiment(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: false,
        name: 'Falha study',
        type: 'SPLIT_TEST_V2',
        baseAdId: 'ad_base',
        variations: [{ name: 'V2', message: 'copy B' }],
        startTime: 1800000000,
        endTime: 1800600000,
        creativeTestDailyBudget: 15000,
      },
    )).rejects.toMatchObject({
      code: 'META_GRAPH_ERROR',
      details: {
        copiedAdsRolledBack: { deleted: ['ad_copy_1'] },
        baseAdIdPreserved: 'ad_base',
      },
    })
    const posts = graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    const deleteCopy = posts.find(([url, init]) =>
      String(url).includes('/ad_copy_1') && (init as any)?.body?.status === 'DELETED',
    )
    expect(deleteCopy).toBeTruthy()
    expect(posts.some(([url, init]) =>
      String(url).includes('/ad_base') && (init as any)?.body?.status === 'DELETED',
    )).toBe(false)
  })

  it('rejects 6 variations (7 versions) against Meta 2–5 cell Creative Test', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async () => ({
      id: 'ad_base',
      account_id: '555',
      adset_id: 'as_1',
      campaign_id: 'c_1',
      creative: { object_story_spec: { link_data: { message: 'm', link: 'https://ex.com' } } },
    }))
    await expect(metaCreateExperiment(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: true,
        name: 'Too many',
        baseAdId: 'ad_base',
        variations: [
          { name: '1' }, { name: '2' }, { name: '3' }, { name: '4' }, { name: '5' }, { name: '6' },
        ],
        startTime: 1,
        endTime: 2,
        creativeTestDailyBudget: 1000,
      },
    )).rejects.toMatchObject({ code: 'EXPERIMENT_CELLS_INVALID' })
  })

  it('get experiment returns cells, ads and winner summary without inventing winner_cell_id', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
      api_version: 'v25.0',
    })
    const graphFetch = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.endsWith('/study_1/cells')) {
        return { data: [{ id: 'cell_a', name: 'A', treatment_percentage: 50, ads: { data: [{ id: 'ad_1' }] } }] }
      }
      if (u.endsWith('/study_1/objectives'))
        return { data: [] }
      if (u.includes('/ad_1'))
        return { id: 'ad_1', account_id: '555' }
      if (u.includes('/study_1')) {
        return {
          id: 'study_1',
          name: 'Teste',
          type: 'SPLIT_TEST_V2',
          results_first_available_date: '2026-08-01',
          confidence_level: 0.95,
        }
      }
      return { data: [] }
    })

    const result = await metaGetExperiment(
      { client, graphFetch },
      { tenantId: 'tenant-1', studyId: 'study_1' },
    )
    expect((result as any).ads).toEqual(['ad_1'])
    expect((result as any).winner.documentedWinnerField).toBe(false)
    expect((result as any).winner.resultsFirstAvailableDate).toBe('2026-08-01')
    expect((result as any).study.id).toBe('study_1')
    const urls = graphFetch.mock.calls.map(([url]) => String(url))
    expect(urls.some(u => u.includes('/v26.0/study_1'))).toBe(true)
    expect(urls.some(u => /\/v25\.0\/ad_1(\?|$)/.test(u) || u.includes('/v25.0/ad_1'))).toBe(true)
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
