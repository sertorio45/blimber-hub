import { describe, expect, it, vi } from 'vitest'

import { encryptSecret } from '~/lib/marketing-secrets'
import {
  buildGraphTrackingSpecs,
  metaCreateAd,
  metaListDatasets,
  metaListPixels,
  MetaAdsToolError,
  metaTrackingSpecInputSchema,
  metaUpdateAdTracking,
  setMetaWriteAuditSink,
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

function graphWithOwnedTracking(extra?: (url: string, init?: any) => any) {
  return vi.fn(async (url: string, init?: any) => {
    if (String(url).includes('/adspixels')) {
      const fields = String(init?.query?.fields ?? '')
      if (fields.includes('is_consolidated_container')) {
        return {
          data: [
            { id: 'px_owned', name: 'Pixel Site', is_consolidated_container: true },
            { id: 'ds_owned', name: 'Loja Física', description: 'POS' },
          ],
        }
      }
      return { data: [{ id: 'px_owned', name: 'Pixel Site', is_unavailable: false }] }
    }
    if (String(url).includes('/offline_conversion_data_sets')) {
      return { data: [{ id: 'ds_owned', name: 'Loja Física', description: 'POS' }] }
    }
    if (String(url).includes('/ds_owned') && String(init?.query?.fields ?? '').includes('owner_ad_account')) {
      return { id: 'ds_owned', owner_ad_account: { id: 'act_555' } }
    }
    if (extra)
      return extra(url, init)
    throw new Error(`unexpected url ${url}`)
  })
}

describe('Meta Ad tracking_specs', () => {
  it('maps website / offline / crm to official Graph keys', () => {
    expect(buildGraphTrackingSpecs([
      { type: 'website', pixelId: '111' },
      { type: 'offline', datasetId: '222' },
      { type: 'crm', pixelId: '333' },
      { type: 'crm', datasetId: '444' },
    ])).toEqual([
      { 'action.type': 'offsite_conversion', fb_pixel: '111' },
      { 'action.type': 'offline_conversion', dataset: '222' },
      { 'action.type': 'leadgen_quality_conversion', fb_pixel: '333' },
      { 'action.type': 'leadgen_quality_conversion', dataset: '444' },
    ])
  })

  it('rejects website+dataset and crm without xor', () => {
    expect(metaTrackingSpecInputSchema.safeParse({ type: 'website', datasetId: 'x' }).success).toBe(false)
    expect(metaTrackingSpecInputSchema.safeParse({ type: 'offline', pixelId: 'x' }).success).toBe(false)
    expect(metaTrackingSpecInputSchema.safeParse({ type: 'crm' }).success).toBe(false)
    expect(metaTrackingSpecInputSchema.safeParse({ type: 'crm', pixelId: '1', datasetId: '2' }).success).toBe(false)
    expect(metaTrackingSpecInputSchema.safeParse({ type: 'website', pixelId: '1' }).success).toBe(true)
  })

  it('lists pixels and datasets from ad account edges', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
      pixel_id: 'px_owned',
    })
    const graphFetch = graphWithOwnedTracking()
    const pixels = await metaListPixels({ client, graphFetch }, { tenantId: 'tenant-1' })
    const datasets = await metaListDatasets({ client, graphFetch }, { tenantId: 'tenant-1' })
    expect(pixels.pixels).toEqual([{
      id: 'px_owned',
      name: 'Pixel Site',
    }])
    expect(pixels.configuredPixelId).toBe('px_owned')
    expect(datasets.datasets).toEqual(expect.arrayContaining([
      { id: 'ds_owned', name: 'Loja Física' },
    ]))
    expect(String(graphFetch.mock.calls[0]![0])).toContain('/act_555/adspixels')
    expect(String(graphFetch.mock.calls[1]![0])).toContain('/act_555/adspixels')
    expect(JSON.stringify(pixels)).not.toContain('tok')
  })

  it('createAd dryRun with trackingSpecs lists ownership and previews Graph payload', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_99',
    })
    const graphFetch = graphWithOwnedTracking()
    const result = await metaCreateAd(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        name: 'Ad com Pixel',
        linkUrl: 'https://example.com/lp',
        message: 'Oferta',
        trackingSpecs: [
          { type: 'website', pixelId: 'px_owned' },
          { type: 'offline', datasetId: 'ds_owned' },
        ],
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )
    expect((result as any).dryRun).toBe(true)
    expect((result as any).preview?.body?.ad?.tracking_specs).toEqual([
      { 'action.type': 'offsite_conversion', fb_pixel: 'px_owned' },
      { 'action.type': 'offline_conversion', dataset: 'ds_owned' },
    ])
    const posts = graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(posts).toHaveLength(0)
  })

  it('rejects foreign pixel on createAd (no mix tenants)', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_99',
    })
    await expect(metaCreateAd(
      { client, graphFetch: graphWithOwnedTracking() },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        name: 'Hijack',
        linkUrl: 'https://example.com',
        message: 'x',
        trackingSpecs: [{ type: 'website', pixelId: 'px_other_tenant' }],
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )).rejects.toMatchObject({ code: 'PIXEL_TENANT_MISMATCH', statusCode: 403 })
  })

  it('rejects foreign dataset', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_99',
    })
    await expect(metaCreateAd(
      { client, graphFetch: graphWithOwnedTracking() },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        name: 'Hijack DS',
        linkUrl: 'https://example.com',
        message: 'x',
        trackingSpecs: [{ type: 'offline', datasetId: 'ds_foreign' }],
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )).rejects.toMatchObject({ code: 'DATASET_TENANT_MISMATCH', statusCode: 403 })
  })

  it('createAd execute posts tracking_specs on the Ad', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_99',
    })
    const graphFetch = graphWithOwnedTracking((url, init) => {
      if (init?.method === 'POST') {
        if (String(url).includes('/adcreatives'))
          return { id: 'cr_1' }
        if (String(url).includes('/ads'))
          return { id: 'ad_1' }
      }
      if (String(url).includes('/adset_owned')) {
        return { id: 'adset_owned', name: 'Set', account_id: '555', campaign_id: 'cmp_1' }
      }
      return {}
    })
    const result = await metaCreateAd(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_owned',
        name: 'Ad track',
        linkUrl: 'https://example.com/lp',
        message: 'Txt',
        imageHash: 'h1',
        trackingSpecs: [{ type: 'website', pixelId: 'px_owned' }],
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: false,
      },
    )
    expect((result as any).adId).toBe('ad_1')
    const adPost = graphFetch.mock.calls.find(([url, init]) =>
      init?.method === 'POST' && String(url).includes('/ads'),
    )
    expect(adPost![1]?.body).toMatchObject({
      tracking_specs: [{ 'action.type': 'offsite_conversion', fb_pixel: 'px_owned' }],
    })
  })

  it('updateAdTracking dryRun then execute replaces specs', async () => {
    setMetaWriteAuditSink(() => {})
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = graphWithOwnedTracking((url, init) => {
      if (init?.method === 'POST' && String(url).includes('/ad_1'))
        return { success: true }
      if (String(url).includes('/ad_1')) {
        return {
          id: 'ad_1',
          name: 'Ad',
          account_id: '555',
          tracking_specs: [{ 'action.type': ['link_click'] }],
        }
      }
      throw new Error(`unexpected ${url}`)
    })

    const preview = await metaUpdateAdTracking(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adId: 'ad_1',
        trackingSpecs: [{ type: 'crm', datasetId: 'ds_owned' }],
        replaceTrackingSpecs: true,
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )
    expect((preview as any).dryRun).toBe(true)
    expect((preview as any).preview?.body?.tracking_specs).toEqual([
      { 'action.type': 'leadgen_quality_conversion', dataset: 'ds_owned' },
    ])

    const applied = await metaUpdateAdTracking(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adId: 'ad_1',
        trackingSpecs: [{ type: 'crm', datasetId: 'ds_owned' }],
        replaceTrackingSpecs: true,
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: false,
      },
    )
    expect((applied as any).dryRun).toBe(false)
    const post = graphFetch.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(String(post![0])).toContain('/ad_1')
    expect(post![1]?.body).toEqual({
      tracking_specs: [{ 'action.type': 'leadgen_quality_conversion', dataset: 'ds_owned' }],
    })
  })

  it('updateAdTracking rejects ad from another account', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      ad_account_id: '555',
    })
    const graphFetch = vi.fn(async (url: string) => {
      if (String(url).includes('/ad_x'))
        return { id: 'ad_x', account_id: '999' }
      return { data: [] }
    })
    await expect(metaUpdateAdTracking(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adId: 'ad_x',
        trackingSpecs: [{ type: 'website', pixelId: 'px_owned' }],
        confirmTenantId: 'tenant-1',
        confirm: true,
        dryRun: false,
      },
    )).rejects.toMatchObject({ code: 'AD_TENANT_MISMATCH' })
  })

  it('WHATSAPP createAd still works with website trackingSpecs', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_99',
    })
    const result = await metaCreateAd(
      { client, graphFetch: graphWithOwnedTracking() },
      {
        tenantId: 'tenant-1',
        adsetId: 'adset_1',
        name: 'WA + pixel',
        destinationType: 'WHATSAPP',
        message: 'Fale conosco',
        imageHash: 'h1',
        trackingSpecs: [{ type: 'website', pixelId: 'px_owned' }],
        confirmTenantId: 'tenant-1',
        confirm: true,
      },
    )
    expect((result as any).destinationType).toBe('WHATSAPP')
    expect((result as any).dryRun).toBe(true)
    expect((result as any).preview?.body?.ad?.tracking_specs[0].fb_pixel).toBe('px_owned')
  })

  it('throws MetaAdsToolError not generic Error on mismatch', async () => {
    const client = createIntegrationClient({
      access_token_enc: encryptSecret('tok'),
      page_access_token_enc: encryptSecret('page-tok'),
      ad_account_id: '555',
      page_id: 'page_99',
    })
    try {
      await metaCreateAd(
        { client, graphFetch: graphWithOwnedTracking() },
        {
          tenantId: 'tenant-1',
          adsetId: 'adset_1',
          name: 'x',
          linkUrl: 'https://example.com',
          message: 'x',
          trackingSpecs: [{ type: 'crm', pixelId: 'nope' }],
          confirmTenantId: 'tenant-1',
          confirm: true,
        },
      )
      expect.fail('should throw')
    }
    catch (err) {
      expect(err).toBeInstanceOf(MetaAdsToolError)
      expect((err as MetaAdsToolError).code).toBe('PIXEL_TENANT_MISMATCH')
    }
  })
})
