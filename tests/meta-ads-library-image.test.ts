import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { encryptSecret } from '~/lib/marketing-secrets'
import {
  MetaAdsToolError,
  metaCreateAd,
  metaUploadImage,
  uploadImage,
  setMetaWriteAuditSink,
} from '~/lib/meta-ads'

process.env.MARKETING_ENCRYPTION_SECRET = 'test-marketing-encryption-secret-for-mcp'

const TENANT_ID = 'tenant-1'
const ASSET_ID = 'a1b2c3d4-e5f6-4789-8abc-def012345678'
const USER_TOKEN = 'meta-user-access-token'
const PAGE_TOKEN = 'meta-page-access-token-must-not-be-used'
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

function libraryAssetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSET_ID,
    tenant_id: TENANT_ID,
    name: 'hero.png',
    mime_type: 'image/png',
    object_path: `${TENANT_ID}/hero.png`,
    bucket: 'marketing-assets',
    width: 1200,
    height: 628,
    size_bytes: PNG_1X1.length,
    status: 'ready',
    ...overrides,
  }
}

function createLibraryMetaClient(opts: {
  assets?: Array<Record<string, unknown>>
  download?: ReturnType<typeof vi.fn>
  createSignedUrl?: ReturnType<typeof vi.fn>
  config?: Record<string, unknown>
}) {
  const config = {
    access_token_enc: encryptSecret(USER_TOKEN),
    page_access_token_enc: encryptSecret(PAGE_TOKEN),
    ad_account_id: '555',
    page_id: 'page_99',
    api_version: 'v25.0',
    ...opts.config,
  }
  const assets = opts.assets ?? [libraryAssetRow()]
  const download = opts.download ?? vi.fn(async () => ({ data: PNG_1X1, error: null }))
  const createSignedUrl = opts.createSignedUrl ?? vi.fn()

  return {
    download,
    createSignedUrl,
    client: {
      from(table: string) {
        if (table === 'media_assets') {
          const filters: Record<string, unknown> = {}
          const chain: any = {
            select: () => chain,
            eq: (col: string, val: unknown) => {
              filters[col] = val
              return chain
            },
            maybeSingle: async () => {
              const row = assets.find(item => String(item.id) === String(filters.id)) ?? null
              return { data: row, error: null }
            },
          }
          return chain
        }
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          insert: async () => ({ error: null }),
          order: async () => ({
            data: [{
              id: 'int-1',
              tenant_id: TENANT_ID,
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
              tenant_id: TENANT_ID,
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
      storage: {
        from: () => ({ download, createSignedUrl }),
      },
    },
  }
}

describe('meta_upload_image / createAd library assetId', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setMetaWriteAuditSink(() => {})
  })

  it('uploads library image bytes and returns imageHash + dimensions (user token, never page token)', async () => {
    const { client, download } = createLibraryMetaClient({})
    const graphFetch = vi.fn(async () => ({
      images: {
        'hero.png': { hash: 'imghash_library_1', width: 1200, height: 628 },
      },
    }))

    const result = await metaUploadImage(
      { client, graphFetch },
      {
        tenantId: TENANT_ID,
        assetId: ASSET_ID,
        confirmTenantId: TENANT_ID,
        confirm: true,
        dryRun: false,
      },
    )

    expect(result).toMatchObject({
      success: true,
      imageHash: 'imghash_library_1',
      width: 1200,
      height: 628,
      assetId: ASSET_ID,
      reused: false,
    })
    expect(JSON.stringify(result)).not.toContain(USER_TOKEN)
    expect(JSON.stringify(result)).not.toContain(PAGE_TOKEN)
    expect(JSON.stringify(result)).not.toContain(PNG_1X1.toString('base64'))
    expect(download).toHaveBeenCalledWith(`${TENANT_ID}/hero.png`)
    expect(graphFetch).toHaveBeenCalledOnce()
    const [url, init] = graphFetch.mock.calls[0]!
    expect(String(url)).toContain('https://graph.facebook.com/v25.0/act_555/adimages')
    expect(init?.query?.access_token).toBe(USER_TOKEN)
    expect(init?.query?.access_token).not.toBe(PAGE_TOKEN)
    expect(init?.bodyEncoding).toBe('form')
    expect(init?.body?.bytes).toBe(PNG_1X1.toString('base64'))
    expect(init?.body?.name).toBe('hero.png')
  })

  it('dryRun with assetId checks tenant, skips download and Graph, keeps library dimensions', async () => {
    const { client, download } = createLibraryMetaClient({})
    const graphFetch = vi.fn(async () => ({}))

    const result = await metaUploadImage(
      { client, graphFetch },
      {
        tenantId: TENANT_ID,
        assetId: ASSET_ID,
        confirmTenantId: TENANT_ID,
        confirm: true,
        dryRun: true,
      },
    )

    expect(result.imageHash).toContain('dryRun')
    expect(result.width).toBe(1200)
    expect(result.height).toBe(628)
    expect(download).not.toHaveBeenCalled()
    expect(graphFetch).not.toHaveBeenCalled()
  })

  it('returns 403 when asset belongs to another tenant (no download, no Graph)', async () => {
    const { client, download } = createLibraryMetaClient({
      assets: [libraryAssetRow({ tenant_id: 'other-tenant' })],
    })
    const graphFetch = vi.fn(async () => ({}))

    await expect(metaUploadImage(
      { client, graphFetch },
      {
        tenantId: TENANT_ID,
        assetId: ASSET_ID,
        confirmTenantId: TENANT_ID,
        confirm: true,
        dryRun: false,
      },
    )).rejects.toMatchObject({
      code: 'ASSET_TENANT_MISMATCH',
      statusCode: 403,
    })

    expect(download).not.toHaveBeenCalled()
    expect(graphFetch).not.toHaveBeenCalled()
  })

  it('rejects video library assets', async () => {
    const { client, download } = createLibraryMetaClient({
      assets: [libraryAssetRow({ mime_type: 'video/mp4', name: 'clip.mp4' })],
    })
    const graphFetch = vi.fn(async () => ({}))

    await expect(metaUploadImage(
      { client, graphFetch },
      {
        tenantId: TENANT_ID,
        assetId: ASSET_ID,
        confirmTenantId: TENANT_ID,
        confirm: true,
        dryRun: false,
      },
    )).rejects.toMatchObject({ code: 'LIBRARY_ASSET_NOT_IMAGE' })

    expect(download).not.toHaveBeenCalled()
    expect(graphFetch).not.toHaveBeenCalled()
  })

  it('rejects assetId combined with imageUrl (XOR)', async () => {
    const { client } = createLibraryMetaClient({})
    await expect(metaUploadImage(
      { client, graphFetch: vi.fn() },
      {
        tenantId: TENANT_ID,
        assetId: ASSET_ID,
        imageUrl: 'https://cdn.example.com/a.png',
        confirmTenantId: TENANT_ID,
        confirm: true,
        dryRun: true,
      },
    )).rejects.toBeInstanceOf(z.ZodError)
  })

  it('omits raw bytes from Graph write error payload', async () => {
    const graph = vi.fn(async () => {
      throw new MetaAdsToolError('META_GRAPH_ERROR', 'Invalid parameter', 400, { code: 100 })
    })

    try {
      await uploadImage(
        {
          apiVersion: 'v25.0',
          accessToken: USER_TOKEN,
          adAccountId: '555',
          graph,
        },
        { bytes: PNG_1X1, name: 'hero.png' },
      )
      throw new Error('expected META_GRAPH_ERROR')
    }
    catch (err) {
      expect(err).toMatchObject({ code: 'META_GRAPH_ERROR' })
      const details = (err as MetaAdsToolError).details as Record<string, any>
      expect(details.request_payload.bytes).toBeUndefined()
      expect(details.request_payload.name).toBe('hero.png')
      expect(JSON.stringify(details)).not.toContain(PNG_1X1.toString('base64'))
      expect(JSON.stringify(details)).not.toContain(USER_TOKEN)
    }
  })

  it('createAd execute uploads assetId then uses imageHash (v25, user token)', async () => {
    const { client, download } = createLibraryMetaClient({})
    const graphFetch = vi.fn(async (url: string, init?: any) => {
      if (init?.method === 'POST' && String(url).includes('/adimages')) {
        return { images: { 'hero.png': { hash: 'hash_from_library', width: 1200, height: 628 } } }
      }
      if (init?.method === 'POST' && String(url).includes('/adcreatives'))
        return { id: 'creative_lib_1' }
      if (init?.method === 'POST' && String(url).includes('/ads'))
        return { id: 'ad_lib_1' }
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
        tenantId: TENANT_ID,
        adsetId: 'adset_owned',
        name: 'Ad Biblioteca',
        linkUrl: 'https://example.com/lp',
        message: 'Texto',
        assetId: ASSET_ID,
        confirmTenantId: TENANT_ID,
        confirm: true,
        dryRun: false,
      },
    )

    expect(result).toMatchObject({
      success: true,
      adId: 'ad_lib_1',
      imageHash: 'hash_from_library',
      assetId: ASSET_ID,
    })
    expect(download).toHaveBeenCalledOnce()
    const adImageCall = graphFetch.mock.calls.find(([url]) => String(url).includes('/adimages'))
    expect(adImageCall).toBeTruthy()
    expect(adImageCall![1]?.query?.access_token).toBe(USER_TOKEN)
    expect(String(adImageCall![0])).toContain('/v25.0/')
    const creativeCall = graphFetch.mock.calls.find(([url]) => String(url).includes('/adcreatives'))
    const creativeJson = JSON.stringify(creativeCall![1]?.body ?? {})
    expect(creativeJson).toContain('hash_from_library')
    expect(JSON.stringify(result)).not.toContain(PAGE_TOKEN)
  })

  it('createAd dryRun with foreign assetId is 403 before Graph', async () => {
    const { client, download } = createLibraryMetaClient({
      assets: [libraryAssetRow({ tenant_id: 'other-tenant' })],
    })
    const graphFetch = vi.fn(async () => ({}))

    await expect(metaCreateAd(
      { client, graphFetch },
      {
        tenantId: TENANT_ID,
        adsetId: 'adset_owned',
        name: 'Ad Biblioteca',
        linkUrl: 'https://example.com/lp',
        message: 'Texto',
        assetId: ASSET_ID,
        confirmTenantId: TENANT_ID,
        confirm: true,
        dryRun: true,
      },
    )).rejects.toMatchObject({ code: 'ASSET_TENANT_MISMATCH', statusCode: 403 })

    expect(download).not.toHaveBeenCalled()
    expect(graphFetch).not.toHaveBeenCalled()
  })
})
