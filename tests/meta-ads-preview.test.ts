import { beforeEach, describe, expect, it, vi } from 'vitest'

import { encryptSecret } from '~/lib/marketing-secrets'
import {
  MetaAdsToolError,
  metaGenerateAdPreview,
  metaGenerateAdPreviewsBatch,
  metaValidateCreative,
} from '~/lib/meta-ads'

process.env.MARKETING_ENCRYPTION_SECRET = 'test-marketing-encryption-secret-for-mcp'

const AD_ACCOUNT = '555'

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

function makeConfig() {
  return {
    access_token_enc: encryptSecret('valid-token'),
    ad_account_id: AD_ACCOUNT,
    api_version: 'v25.0',
  }
}

const PREVIEW_HTML = '<iframe src="https://www.facebook.com/ads/api/preview_iframe.php?d=..."></iframe>'

describe('meta_generate_ad_preview', () => {
  let config: Record<string, unknown>
  let client: any

  beforeEach(() => {
    config = makeConfig()
    client = createIntegrationClient(config)
  })

  it('returns preview HTML for existing ad', async () => {
    const graphFetch = vi.fn().mockResolvedValue({
      data: [{ body: PREVIEW_HTML }],
    })

    const result = await metaGenerateAdPreview(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adId: '12345',
        ad_format: 'DESKTOP_FEED_STANDARD',
      },
    )

    expect(result).toMatchObject({
      tenantId: 'tenant-1',
      ad_format: 'DESKTOP_FEED_STANDARD',
      body: PREVIEW_HTML,
      error: null,
    })

    const calledUrl = graphFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain('/12345/previews')
  })

  it('returns preview HTML for creative spec', async () => {
    const graphFetch = vi.fn().mockResolvedValue({
      data: [{ body: PREVIEW_HTML }],
    })

    const result = await metaGenerateAdPreview(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        creative: {
          object_story_spec: {
            page_id: '999',
            link_data: { link: 'https://example.com', message: 'Test' },
          },
        },
        ad_format: 'INSTAGRAM_STANDARD',
      },
    )

    expect(result.body).toBe(PREVIEW_HTML)
    expect(result.error).toBeNull()

    const calledUrl = graphFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain(`/act_${AD_ACCOUNT}/generatepreviews`)
  })

  it('returns preview for existing creativeId', async () => {
    const graphFetch = vi.fn().mockResolvedValue({
      data: [{ body: PREVIEW_HTML }],
    })

    const result = await metaGenerateAdPreview(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        creativeId: '67890',
        ad_format: 'INSTAGRAM_STORY',
      },
    )

    expect(result.body).toBe(PREVIEW_HTML)
    const calledUrl = graphFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain('/67890/previews')
  })

  it('throws if no adId/creativeId/creative provided', async () => {
    const graphFetch = vi.fn()

    await expect(
      metaGenerateAdPreview(
        { client, graphFetch },
        {
          tenantId: 'tenant-1',
          ad_format: 'DESKTOP_FEED_STANDARD',
        },
      ),
    ).rejects.toThrow('Informe adId, creativeId ou creative.')
  })
})

describe('meta_generate_ad_previews_batch', () => {
  let config: Record<string, unknown>
  let client: any

  beforeEach(() => {
    config = makeConfig()
    client = createIntegrationClient(config)
  })

  it('returns previews for multiple placements', async () => {
    const graphFetch = vi.fn().mockResolvedValue({
      data: [{ body: PREVIEW_HTML }],
    })

    const result = await metaGenerateAdPreviewsBatch(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adId: '12345',
        ad_formats: ['DESKTOP_FEED_STANDARD', 'INSTAGRAM_STANDARD', 'INSTAGRAM_STORY'],
      },
    )

    expect(result.total).toBe(3)
    expect(result.succeeded).toBe(3)
    expect(result.failed).toBe(0)
    expect(result.previews).toHaveLength(3)
    expect(graphFetch).toHaveBeenCalledTimes(3)
  })

  it('reports failures per placement', async () => {
    const graphFetch = vi.fn()
      .mockResolvedValueOnce({ data: [{ body: PREVIEW_HTML }] })
      .mockRejectedValueOnce(new MetaAdsToolError('META_GRAPH_ERROR', 'Unsupported format for this creative', 400))

    const result = await metaGenerateAdPreviewsBatch(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adId: '12345',
        ad_formats: ['DESKTOP_FEED_STANDARD', 'INSTAGRAM_REELS'],
      },
    )

    expect(result.total).toBe(2)
    expect(result.succeeded).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.previews[1].error).toContain('Unsupported format')
  })
})

describe('meta_validate_creative', () => {
  let config: Record<string, unknown>
  let client: any

  beforeEach(() => {
    config = makeConfig()
    client = createIntegrationClient(config)
  })

  it('returns valid=true when all placements succeed', async () => {
    const graphFetch = vi.fn().mockResolvedValue({
      data: [{ body: PREVIEW_HTML }],
    })

    const result = await metaValidateCreative(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adId: '12345',
        ad_formats: ['DESKTOP_FEED_STANDARD', 'INSTAGRAM_STANDARD'],
      },
    )

    expect(result.valid).toBe(true)
    expect(result.placements_ok).toEqual(['DESKTOP_FEED_STANDARD', 'INSTAGRAM_STANDARD'])
    expect(result.placements_failed).toEqual([])
  })

  it('returns valid=false with failed placements', async () => {
    const graphFetch = vi.fn()
      .mockResolvedValueOnce({ data: [{ body: PREVIEW_HTML }] })
      .mockRejectedValueOnce(new MetaAdsToolError('META_GRAPH_ERROR', 'PNG not supported', 400))
      .mockRejectedValueOnce(new MetaAdsToolError('META_GRAPH_ERROR', 'Incompatible placement', 400))

    const result = await metaValidateCreative(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        creative: {
          object_story_spec: {
            page_id: '999',
            link_data: { link: 'https://example.com', message: 'Test' },
          },
        },
        ad_formats: ['DESKTOP_FEED_STANDARD', 'INSTAGRAM_STORY', 'INSTAGRAM_REELS'],
      },
    )

    expect(result.valid).toBe(false)
    expect(result.placements_ok).toEqual(['DESKTOP_FEED_STANDARD'])
    expect(result.placements_failed).toHaveLength(2)
    expect(result.placements_failed[0].error).toContain('PNG not supported')
    expect(result.summary).toContain('2/3')
  })

  it('uses default placements when ad_formats omitted', async () => {
    const graphFetch = vi.fn().mockResolvedValue({
      data: [{ body: PREVIEW_HTML }],
    })

    const result = await metaValidateCreative(
      { client, graphFetch },
      {
        tenantId: 'tenant-1',
        adId: '12345',
      },
    )

    expect(result.placements_ok).toHaveLength(4)
    expect(graphFetch).toHaveBeenCalledTimes(4)
  })
})
