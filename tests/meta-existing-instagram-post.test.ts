import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encryptSecret } from '~/lib/marketing-secrets'
import { formatToolError, metaCreateAd, metaCreateAdFromInstagramPost, metaGetInstagramMedia, metaListInstagramAccounts, metaListInstagramMedia, setMetaWriteAuditSink } from '~/lib/meta-ads'
import { instagramPostShortcode, resolveOwnedInstagramMedia } from '~/lib/meta-ads/instagram-existing-post'
import { metaCreateAdSchema } from '~/lib/meta-ads/tools'
import { MetaAdsToolError } from '~/lib/meta-ads/types'

process.env.MARKETING_ENCRYPTION_SECRET = 'test-marketing-encryption-secret-for-existing-post'

function integration(config: Record<string, unknown>) {
  const row = {
    id: 'integration_1',
    tenant_id: 'tenant-1',
    provider: 'meta',
    is_active: true,
    updated_at: '2026-01-01T00:00:00.000Z',
    config,
  }
  return {
    from: () => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        order: async () => ({ data: [row], error: null }),
        maybeSingle: async () => ({ data: row, error: null }),
        insert: async () => ({ error: null }),
      }
      return chain
    },
  }
}

const config = {
  access_token_enc: encryptSecret('user-token'),
  page_access_token_enc: encryptSecret('page-token'),
  ad_account_id: '555',
  page_id: '123456789',
  instagram_business_account_id: '17841402051902677',
  instagram_username: 'brand',
  api_version: 'v25.0',
}

const baseInput = {
  tenantId: 'tenant-1',
  adsetId: 'adset_1',
  name: 'Post existente',
  destinationType: 'INSTAGRAM_PROFILE',
  confirmTenantId: 'tenant-1',
  confirm: true,
} as const

function graphMock(options: { foreignOwner?: boolean, foreignAdset?: boolean, pageMismatch?: boolean, failAt?: 'creative' | 'ad', boostEligible?: boolean } = {}) {
  return vi.fn(async (url: string, init?: any) => {
    if (init?.method === 'POST') {
      expect(String(url)).toMatch(/^https:\/\/graph\.facebook\.com\/v25\.0\/act_555\/(?:adcreatives|ads)$/)
      expect(init.query.access_token).toBe('user-token')
      if (String(url).endsWith('/adcreatives')) {
        expect(init.body).toEqual({
          name: 'Post existente Creative',
          instagram_user_id: '17841402051902677',
          source_instagram_media_id: '17841400000000001',
        })
        if (options.failAt === 'creative') {
          throw new MetaAdsToolError('META_GRAPH_ERROR', 'Invalid creative', 400, {
            type: 'OAuthException',
            code: 100,
            error_subcode: 1885316,
            error_user_msg: 'Publicação não elegível',
            fbtrace_id: 'trace-creative',
          })
        }
        return { id: 'creative_1' }
      }
      expect(init.body).toMatchObject({
        adset_id: 'adset_1',
        creative: { creative_id: 'creative_1' },
        status: 'PAUSED',
      })
      if (options.failAt === 'ad') {
        throw new MetaAdsToolError('META_GRAPH_ERROR', 'Invalid ad', 400, {
          type: 'OAuthException',
          code: 100,
          error_subcode: 1815857,
          error_user_msg: 'Combinação não aceita',
          fbtrace_id: 'trace-ad',
        })
      }
      return { id: 'ad_1' }
    }
    if (String(url).endsWith('/adset_1')) {
      return {
        id: 'adset_1',
        account_id: options.foreignAdset ? '999' : '555',
        campaign_id: 'cmp_1',
        destination_type: 'INSTAGRAM_PROFILE',
      }
    }
    if (String(url).endsWith('/123456789')) {
      return {
        id: '123456789',
        instagram_business_account: { id: options.pageMismatch ? 'other_ig' : '17841402051902677' },
      }
    }
    if (String(url).endsWith('/17841402051902677'))
      return { id: '17841402051902677', username: 'brand' }
    if (String(url).endsWith('/17841402051902677/media')) {
      return {
        data: [{
          id: '17841400000000001',
          username: 'brand',
          owner: { id: '17841402051902677' },
          permalink: 'https://www.instagram.com/reel/ABC_123/',
          media_type: 'VIDEO',
        }],
      }
    }
    if (String(url).endsWith('/17841400000000001')) {
      if (init?.query?.fields === 'boost_eligibility_info') {
        return options.boostEligible == null
          ? {}
          : { boost_eligibility_info: { is_eligible: options.boostEligible, reason: options.boostEligible ? 'OK' : 'Mídia bloqueada' } }
      }
      return {
        id: '17841400000000001',
        username: 'brand',
        owner: { id: options.foreignOwner ? 'other_ig' : '17841402051902677' },
        permalink: 'https://www.instagram.com/p/ABC_123/',
        media_type: 'IMAGE',
      }
    }
    throw new Error(`Unexpected Graph request: ${String(url)}`)
  })
}

describe('existing Instagram post ads', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setMetaWriteAuditSink(() => {})
  })

  it('references the original post without rebuilding a video or traffic creative', async () => {
    const graphFetch = graphMock()
    const result = await metaCreateAd(
      { client: integration(config), graphFetch },
      { ...baseInput, instagramMediaId: '17841400000000001', dryRun: false },
    )
    expect(result.success).toBe(true)
    expect((result as any).instagramMediaId).toBe('17841400000000001')
    const posts = graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(posts).toHaveLength(2)
    expect(posts[0]![1]?.body).toEqual({
      name: 'Post existente Creative',
      instagram_user_id: '17841402051902677',
      source_instagram_media_id: '17841400000000001',
    })
    expect(posts[0]![1]?.query?.access_token).toBe('user-token')
    expect(posts[1]![1]?.body).toMatchObject({
      adset_id: 'adset_1',
      creative: { creative_id: 'creative_1' },
      status: 'PAUSED',
    })
    expect(JSON.stringify(result)).not.toContain('user-token')
    expect(JSON.stringify(result)).not.toContain('page-token')
  })

  it('previews ID and permalink without a Graph call or mutation', async () => {
    const graphFetch = vi.fn()
    const byId = await metaCreateAd(
      { client: integration(config), graphFetch },
      { ...baseInput, instagramMediaId: '17841400000000001' },
    )
    expect((byId as any).preview.body.creative.source_instagram_media_id).toBe('17841400000000001')
    expect((byId as any).preview.body.creative).not.toHaveProperty('object_story_spec')
    const byUrl = await metaCreateAd(
      { client: integration(config), graphFetch },
      { ...baseInput, instagramPermalink: 'https://www.instagram.com/reel/ABC_123/?igsh=foo' },
    )
    expect((byUrl as any).preview.body.creative.source_instagram_media_id).toContain('resolvido')
    expect(graphFetch).not.toHaveBeenCalled()
  })

  it('resolves a permalink and sends the resolved media ID in the creative POST', async () => {
    const graphFetch = graphMock()
    const result = await metaCreateAd(
      { client: integration(config), graphFetch },
      { ...baseInput, instagramPermalink: 'https://www.instagram.com/reel/ABC_123/?utm_source=share', dryRun: false },
    )
    const posts = graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(posts[0]![1]?.body.source_instagram_media_id).toBe('17841400000000001')
    expect((result as any).instagramMediaId).toBe('17841400000000001')
    expect((result as any).instagramPermalink).toBe('https://www.instagram.com/reel/ABC_123/')
  })

  it.each([
    [{ foreignOwner: true }, 'INSTAGRAM_MEDIA_OWNERSHIP'],
    [{ foreignAdset: true }, 'ADSET_TENANT_MISMATCH'],
    [{ pageMismatch: true }, 'INSTAGRAM_PAGE_MISMATCH'],
  ] as const)('blocks foreign ownership before creating a creative: %s', async (options, code) => {
    const graphFetch = graphMock(options)
    await expect(metaCreateAd(
      { client: integration(config), graphFetch },
      { ...baseInput, instagramMediaId: '17841400000000001', dryRun: false },
    )).rejects.toMatchObject({ code })
    expect(graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  })

  it('resolves permalink only from connected account and uses fixed Graph URLs', async () => {
    const graphFetch = vi.fn(async (url: string, init?: any) => {
      if (String(url).endsWith('/17841402051902677') && !String(url).endsWith('/media'))
        return { id: '17841402051902677', username: 'brand' }
      if (String(url).endsWith('/17841402051902677/media')) {
        if (!init?.query?.after) {
          return {
            data: [{ id: '1111111111', permalink: 'https://www.instagram.com/p/OLDER/', username: 'brand' }],
            paging: { cursors: { after: 'next-cursor' } },
          }
        }
        return { data: [{ id: '17841400000000001', permalink: 'https://www.instagram.com/reel/ABC_123/', username: 'brand' }] }
      }
      throw new Error('Unexpected Graph request')
    })
    const media = await resolveOwnedInstagramMedia({
      apiVersion: 'v25.0',
      accessToken: 'user-token',
      instagramUserId: '17841402051902677',
      permalink: 'https://www.instagram.com/reel/ABC_123/?utm_source=share',
      graph: graphFetch,
    })
    expect(media.id).toBe('17841400000000001')
    expect(graphFetch.mock.calls[2]![1]?.query?.after).toBe('next-cursor')
    expect(graphFetch.mock.calls.every(([url]) => String(url).startsWith('https://graph.facebook.com/v25.0/'))).toBe(true)
  })

  it('rejects invalid links, mixed sources and edits to original creative', () => {
    expect(() => instagramPostShortcode('https://example.com/p/ABC_123/')).toThrow()
    expect(() => instagramPostShortcode('http://www.instagram.com/p/ABC_123/')).toThrow()
    expect(() => metaCreateAdSchema.parse({ ...baseInput, instagramMediaId: '17841400000000001', instagramPermalink: 'https://www.instagram.com/p/ABC_123/' })).toThrow()
    expect(() => metaCreateAdSchema.parse({ ...baseInput, instagramMediaId: '17841400000000001', message: 'alterar' })).toThrow()
    expect(() => metaCreateAdSchema.parse({ ...baseInput, instagramMediaId: '17841400000000001', creativeId: 'creative_other' })).toThrow()
  })

  it('discovers only the configured Page/Instagram pair and pages real media IDs', async () => {
    const graphFetch = graphMock({ boostEligible: false })
    const ctx = { client: integration(config), graphFetch }
    const accounts = await metaListInstagramAccounts(ctx, { tenantId: 'tenant-1' })
    expect(accounts.accounts).toEqual([expect.objectContaining({ id: '17841402051902677', pageId: '123456789' })])
    const list = await metaListInstagramMedia(ctx, { tenantId: 'tenant-1', limit: 10 })
    expect(list.media[0]).toMatchObject({
      id: '17841400000000001',
      mediaType: 'VIDEO',
      advertisingEligibility: { status: 'unknown' },
    })
    expect(list.nextAfter).toBeNull()
    const item = await metaGetInstagramMedia(ctx, { tenantId: 'tenant-1', instagramMediaId: '17841400000000001' })
    expect(item.media.id).toBe('17841400000000001')
    expect(item.media.advertisingEligibility).toEqual({ status: 'unavailable', reason: 'Mídia bloqueada' })
    expect(graphFetch.mock.calls.find(([url]) => String(url).endsWith('/17841402051902677/media'))?.[1]?.query?.limit).toBe(10)
  })

  it('uses the Graph cursor without deriving IDs from shortcodes', async () => {
    const fallback = graphMock()
    const graphFetch = vi.fn(async (url: string, init?: any) => {
      if (String(url).endsWith('/17841402051902677/media')) {
        if (!init?.query?.after) {
          return {
            data: [{ id: '17841400000000001', permalink: 'https://www.instagram.com/reel/ABC_123/' }],
            paging: { cursors: { after: 'opaque-cursor' } },
          }
        }
        expect(init.query.after).toBe('opaque-cursor')
        return { data: [{ id: '17841400000000002', permalink: 'https://www.instagram.com/p/DEF_456/' }] }
      }
      return fallback(url, init)
    })
    const ctx = { client: integration(config), graphFetch }
    const first = await metaListInstagramMedia(ctx, { tenantId: 'tenant-1', limit: 1 })
    expect(first.nextAfter).toBe('opaque-cursor')
    const second = await metaListInstagramMedia(ctx, { tenantId: 'tenant-1', limit: 1, after: first.nextAfter! })
    expect(second.media[0]?.id).toBe('17841400000000002')
    expect(second.nextAfter).toBeNull()
  })

  it('blocks Instagram discovery with a foreign ad account or mismatched Page', async () => {
    const foreignGraph = graphMock()
    await expect(metaListInstagramMedia({ client: integration(config), graphFetch: foreignGraph }, {
      tenantId: 'tenant-1',
      adAccountId: '999',
    })).rejects.toMatchObject({ code: 'AD_ACCOUNT_TENANT_MISMATCH' })
    expect(foreignGraph).not.toHaveBeenCalled()

    const mismatchedGraph = graphMock({ pageMismatch: true })
    await expect(metaListInstagramAccounts({ client: integration(config), graphFetch: mismatchedGraph }, {
      tenantId: 'tenant-1',
    })).rejects.toMatchObject({ code: 'INSTAGRAM_PAGE_MISMATCH' })
  })

  it('dedicated creation delegates to paused meta_create_ad and rejects unconfirmed writes', async () => {
    const graphFetch = graphMock()
    const input = { ...baseInput, instagramMediaId: '17841400000000001' }
    const preview = await metaCreateAdFromInstagramPost({ client: integration(config), graphFetch }, input)
    expect(preview.dryRun).toBe(true)
    expect(preview.status).toBe('PAUSED')
    expect(graphFetch).not.toHaveBeenCalled()
    await expect(metaCreateAdFromInstagramPost({ client: integration(config), graphFetch }, {
      ...input,
      confirmTenantId: 'another-tenant',
      dryRun: false,
    })).rejects.toMatchObject({ code: 'CONFIRM_TENANT_MISMATCH' })
    const created = await metaCreateAdFromInstagramPost({ client: integration(config), graphFetch }, { ...input, dryRun: false })
    expect(created.adId).toBe('ad_1')
    expect(created.status).toBe('PAUSED')
  })

  it.each(['creative', 'ad'] as const)('preserves Meta diagnostic fields when %s creation fails', async (failAt) => {
    const graphFetch = graphMock({ failAt })
    let failure: unknown
    try {
      await metaCreateAdFromInstagramPost({ client: integration(config), graphFetch }, {
        ...baseInput,
        instagramMediaId: '17841400000000001',
        dryRun: false,
      })
    }
    catch (error) {
      failure = error
    }
    const formatted = formatToolError(failure)
    expect(formatted.error.code).toBe('META_GRAPH_ERROR')
    expect(formatted.error.details).toMatchObject({
      code: 100,
      error_subcode: failAt === 'creative' ? 1885316 : 1815857,
      fbtrace_id: failAt === 'creative' ? 'trace-creative' : 'trace-ad',
    })
    expect(JSON.stringify(formatted)).not.toContain('user-token')
    expect(JSON.stringify(formatted)).not.toContain('page-token')
    expect(graphFetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(failAt === 'creative' ? 1 : 2)
  })
})
