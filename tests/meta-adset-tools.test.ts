import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encryptSecret } from '~/lib/marketing-secrets'
import { buildPlacementAssetFeedSpec } from '~/lib/meta-ads/placement-assets'
import {
  buildCreativeAssetGroupsSpec,
  checkFlexibleAdEligibility,
  META_ADSET_DETAIL_FIELDS,
  metaCopyAdset,
  metaGetAd,
  metaGetAdset,
  metaGetCreative,
  metaListAdsets,
  metaCreateAd,
  sanitizeAdsetForCreate,
  setMetaWriteAuditSink,
} from '~/lib/meta-ads'

process.env.MARKETING_ENCRYPTION_SECRET = 'test-marketing-encryption-secret-for-mcp'

function createIntegrationClient(config: Record<string, unknown>, tenantId = 'tenant-1') {
  return {
    from(_table: string) {
      const row = {
        id: 'int-1',
        tenant_id: tenantId,
        provider: 'meta',
        is_active: true,
        updated_at: '2026-01-01T00:00:00.000Z',
        config,
      }
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        insert: async () => ({ error: null }),
        order: async () => ({ data: [row], error: null }),
        maybeSingle: async () => ({ data: row, error: null }),
      }
      return chain
    },
  }
}

const SOURCE_ADSET = {
  id: 'adset_src',
  name: 'Adset Origem',
  account_id: '555',
  campaign_id: 'cmp_1',
  status: 'ACTIVE',
  effective_status: 'ACTIVE',
  configured_status: 'ACTIVE',
  billing_event: 'IMPRESSIONS',
  optimization_goal: 'OFFSITE_CONVERSIONS',
  bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
  daily_budget: '5000',
  targeting: {
    geo_locations: { countries: ['BR'], cities: [{ key: '2430536', name: 'São Paulo' }] },
    age_min: 25,
    age_max: 54,
    genders: [1],
    publisher_platforms: ['facebook', 'instagram'],
    facebook_positions: ['feed'],
    instagram_positions: ['stream'],
    device_platforms: ['mobile'],
    custom_audiences: [{ id: 'aud_1', name: 'Compradores' }],
    excluded_custom_audiences: [{ id: 'aud_2', name: 'Funcionários' }],
    flexible_spec: [{ interests: [{ id: '600', name: 'Cosmetics' }] }],
  },
  promoted_object: { pixel_id: 'px_1', custom_event_type: 'PURCHASE' },
  destination_type: 'WEBSITE',
  attribution_spec: [{ event_type: 'CLICK_THROUGH', window_days: 7 }],
  start_time: '2026-01-01T00:00:00-0300',
  end_time: '2026-12-31T23:59:59-0300',
}

describe('meta_get_adset / meta_copy_adset', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setMetaWriteAuditSink(() => {})
  })

  it('1. tenant correto lê adset', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
      api_version: 'v25.0',
    })
    const graphFetch = vi.fn(async () => ({ ...SOURCE_ADSET }))

    const result = await metaGetAdset(
      { client, graphFetch },
      { tenantId: 'tenant-1', adsetId: 'adset_src' },
    )

    expect(result.adAccountId).toBe('555')
    expect(result.adset.id).toBe('adset_src')
    expect(JSON.stringify(result)).not.toContain('tok')
  })

  it('2. tenant diferente rejeitado (confirmTenantId mismatch)', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async () => ({ ...SOURCE_ADSET }))

    await expect(metaCopyAdset(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        sourceAdsetId: 'adset_src',
        name: 'Cópia',
        confirmTenantId: 'tenant-other',
        confirm: true,
      },
    )).rejects.toMatchObject({ code: 'CONFIRM_TENANT_MISMATCH' })
  })

  it('3. adAccount errada rejeitada', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async () => ({
      ...SOURCE_ADSET,
      account_id: '999',
    }))

    await expect(metaGetAdset(
      { client, graphFetch },
      { tenantId: 'tenant-1', adsetId: 'adset_src' },
    )).rejects.toMatchObject({ code: 'ADSET_TENANT_MISMATCH', statusCode: 403 })
  })

  it('4. meta_get_adset não solicita targeting_automation top-level', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async () => ({ ...SOURCE_ADSET }))

    await metaGetAdset(
      { client, graphFetch },
      { tenantId: 'tenant-1', adsetId: 'adset_src' },
    )

    const [, init] = graphFetch.mock.calls[0]!
    const fields = String(init?.query?.fields)
    expect(fields).toContain('targeting')
    expect(fields).not.toMatch(/(^|,)targeting_automation(,|$)/)
    expect(META_ADSET_DETAIL_FIELDS).not.toMatch(/(^|,)targeting_automation(,|$)/)
  })

  it('4b. meta_get_adset retorna targeting', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async () => ({ ...SOURCE_ADSET }))

    const result = await metaGetAdset(
      { client, graphFetch },
      { tenantId: 'tenant-1', adsetId: 'adset_src' },
    )

    expect((result.adset as any).targeting.geo_locations.countries).toContain('BR')
    expect((result.adset as any).targeting.age_min).toBe(25)
  })

  it('5. placements preservados (extraídos do targeting)', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async () => ({ ...SOURCE_ADSET }))

    const result = await metaGetAdset(
      { client, graphFetch },
      { tenantId: 'tenant-1', adsetId: 'adset_src' },
    )

    expect((result.adset as any).placements).toMatchObject({
      publisher_platforms: ['facebook', 'instagram'],
      facebook_positions: ['feed'],
      instagram_positions: ['stream'],
      device_platforms: ['mobile'],
    })
  })

  it('6. sanitize remove targeting_automation top-level (fica em targeting)', () => {
    const body = sanitizeAdsetForCreate({
      ...SOURCE_ADSET,
      targeting_automation: { advantage_audience: 1 },
      targeting: {
        ...(SOURCE_ADSET.targeting as object),
        targeting_automation: { advantage_audience: 1 },
      },
    } as Record<string, unknown>)
    expect(body).not.toHaveProperty('targeting_automation')
    expect((body.targeting as any).targeting_automation).toEqual({ advantage_audience: 1 })
  })

  it('6b. custom audiences preservadas no fallback sanitize', () => {
    const body = sanitizeAdsetForCreate(SOURCE_ADSET as Record<string, unknown>)
    expect((body.targeting as any).custom_audiences).toHaveLength(1)
    expect((body.targeting as any).custom_audiences[0].id).toBe('aud_1')
  })

  it('7. exclusões preservadas no fallback sanitize', () => {
    const body = sanitizeAdsetForCreate(SOURCE_ADSET as Record<string, unknown>)
    expect((body.targeting as any).excluded_custom_audiences[0].id).toBe('aud_2')
  })

  it('8. budget preservado na cópia dry-run', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async () => ({ ...SOURCE_ADSET }))

    const result = await metaCopyAdset(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        sourceAdsetId: 'adset_src',
        name: 'Cópia Budget',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: true,
      },
    )

    expect((result as any).dryRun).toBe(true)
    expect((result as any).preview).toBeDefined()
    const notes = String((result as any).preview?.notes?.join(' ') || '')
    expect(notes).toMatch(/5000/)
  })

  it('9. override budget funciona na execução', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })

    let patchBody: Record<string, unknown> | null = null
    const graphFetch = vi.fn(async (url: string, init?: any) => {
      if (init?.method === 'POST' && String(url).includes('/copies')) {
        return { copied_adset_id: 'adset_copy_1' }
      }
      if (init?.method === 'POST' && String(url).includes('/adset_copy_1')) {
        patchBody = init.body
        return { success: true }
      }
      if (String(url).includes('/adset_copy_1')) {
        return {
          ...SOURCE_ADSET,
          id: 'adset_copy_1',
          name: 'Cópia Override',
          daily_budget: '9900',
        }
      }
      return { ...SOURCE_ADSET }
    })

    const result = await metaCopyAdset(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        sourceAdsetId: 'adset_src',
        name: 'Cópia Override',
        dailyBudget: 9900,
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: false,
      },
    )

    expect((result as any).adsetId).toBe('adset_copy_1')
    expect(patchBody).toMatchObject({ daily_budget: 9900, name: 'Cópia Override' })
  })

  it('10. cópia default PAUSED', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async () => ({ ...SOURCE_ADSET }))

    const result = await metaCopyAdset(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        sourceAdsetId: 'adset_src',
        name: 'Cópia Pausada',
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )

    expect((result as any).status).toBe('PAUSED')
    expect((result as any).preview?.body).toMatchObject({ status_option: 'PAUSED' })
  })

  it('11. dryRun não cria adset', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async () => ({ ...SOURCE_ADSET }))

    await metaCopyAdset(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        sourceAdsetId: 'adset_src',
        name: 'Sem Criar',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: true,
      },
    )

    const postCalls = graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(postCalls).toHaveLength(0)
  })

  it('12. meta_get_ad não quebra sem creative_asset_groups_spec', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
      api_version: 'v25.0',
    })
    const mockAd = {
      id: 'ad_1',
      name: 'Anúncio',
      status: 'ACTIVE',
      creative: {
        id: 'cr_1',
        object_story_spec: { page_id: '111', link_data: { link: 'https://example.com' } },
      },
      campaign_id: 'cmp_1',
      adset_id: 'adset_1',
    }
    const graphFetch = vi.fn(async () => mockAd)

    const result = await metaGetAd({ client, graphFetch }, { tenantId: 'tenant-1', adId: 'ad_1' })
    expect(result.ad).toEqual(mockAd)

    const [url] = graphFetch.mock.calls[0]!
    expect(String(url)).not.toContain('creative_asset_groups_spec')
  })

  it('13. meta_get_creative não quebra sem creative_asset_groups_spec', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const mockCreative = {
      id: 'cr_1',
      object_story_spec: { page_id: '111' },
      asset_feed_spec: null,
    }
    const graphFetch = vi.fn(async () => mockCreative)

    const result = await metaGetCreative(
      { client, graphFetch },
      { tenantId: 'tenant-1', creativeId: 'cr_1' },
    )
    expect(result.creative).toEqual(mockCreative)

    const [url] = graphFetch.mock.calls[0]!
    expect(String(url)).not.toContain('creative_asset_groups_spec')
  })

  it('14. Flexible Ad continua funcionando', () => {
    const eligibility = checkFlexibleAdEligibility('v25.0')
    expect(eligibility.eligible).toBe(true)

    const spec = buildCreativeAssetGroupsSpec([{
      assets: [{ imageHash: 'abc123' }],
      texts: [{ text: 'Promo', textType: 'primary_text' }],
      callToAction: { type: 'LEARN_MORE', link: 'https://example.com' },
    }])
    expect((spec.groups as unknown[]).length).toBeGreaterThan(0)
  })

  it('15. Placement Asset Customization continua funcionando', async () => {
    const spec = buildPlacementAssetFeedSpec({
      resolvedImages: [
        { label: 'feed_img', hash: 'hash_feed' },
        { label: 'story_img', hash: 'hash_story' },
      ],
      rules: [
        { label: 'feed_img', platforms: ['facebook'], facebookPositions: ['feed'] },
        { label: 'story_img', platforms: ['instagram'], instagramPositions: ['story'] },
      ],
      linkUrls: [{ websiteUrl: 'https://example.com' }],
      bodies: [{ text: 'Msg base' }],
    })

    expect(spec.asset_customization_rules).toHaveLength(2)
    expect(spec.images).toHaveLength(2)
    expect(spec.ad_formats).toEqual(['AUTOMATIC_FORMAT'])

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
        name: 'Ad Placement',
        creativeType: 'IMAGE',
        linkUrl: 'https://example.com',
        message: 'Msg',
        placementAssets: {
          images: [
            { label: 'feed_img', imageHash: 'hash_feed' },
            { label: 'story_img', imageHash: 'hash_story' },
          ],
          rules: [
            { label: 'feed_img', platforms: ['facebook'], facebookPositions: ['feed'] },
            { label: 'story_img', platforms: ['instagram'], instagramPositions: ['story'] },
          ],
        },
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )

    const assetFeed = (result as any).preview?.body?.creative?.asset_feed_spec
    expect(assetFeed?.asset_customization_rules).toHaveLength(2)
    expect(assetFeed?.ad_formats).toEqual(['AUTOMATIC_FORMAT'])
    expect(postCallsSafe(graphFetch)).toBe(0)
  })

  it('meta_copy_adset pré-leitura não solicita targeting_automation top-level', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async () => ({ ...SOURCE_ADSET }))

    await metaCopyAdset(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        sourceAdsetId: 'adset_src',
        name: 'Cópia Fields',
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: true,
      },
    )

    const [, init] = graphFetch.mock.calls[0]!
    const fields = String(init?.query?.fields)
    expect(fields).toContain('targeting')
    expect(fields).not.toMatch(/(^|,)targeting_automation(,|$)/)
  })

  it('meta_list_adsets detailLevel=full inclui targeting no fields', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async () => ({
      data: [{ ...SOURCE_ADSET, id: 'adset_1' }],
    }))

    await metaListAdsets(
      { client, graphFetch },
      { tenantId: 'tenant-1', detailLevel: 'full' },
    )

    const [, init] = graphFetch.mock.calls[0]!
    const fields = String(init?.query?.fields)
    expect(fields).toContain('targeting')
    expect(fields).toContain('promoted_object')
    expect(fields).not.toMatch(/(^|,)targeting_automation(,|$)/)
  })
})

function postCallsSafe(graphFetch: ReturnType<typeof vi.fn>) {
  return graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST').length
}
