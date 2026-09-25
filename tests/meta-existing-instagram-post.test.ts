import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encryptSecret } from '~/lib/marketing-secrets'
import { metaCreateAd, setMetaWriteAuditSink } from '~/lib/meta-ads'
import { instagramPostShortcode, resolveOwnedInstagramMedia } from '~/lib/meta-ads/instagram-existing-post'
import { metaCreateAdSchema } from '~/lib/meta-ads/tools'

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

function graphMock(options: { foreignOwner?: boolean, foreignAdset?: boolean, pageMismatch?: boolean } = {}) {
  return vi.fn(async (url: string, init?: any) => {
    if (init?.method === 'POST')
      return { id: String(url).includes('/adcreatives') ? 'creative_1' : 'ad_1' }
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

  it('uses source_instagram_media_id at creative top level and preserves original post', async () => {
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
      object_id: '123456789',
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
})
